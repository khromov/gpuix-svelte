/**
 * Wires the data layer together. `main.ts`, the tests and the UI all talk to the
 * object this returns, and a hot remount reuses it, so DB and worker outlive UI edits.
 */

import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask as ask_llm, type AskOptions } from './ask.ts';
import { create_blobs } from './blobs.ts';
import { create_bus } from './bus.ts';
import { capabilities as get_capabilities } from './capabilities.ts';
import { read_image } from './clipboard.ts';
import { open_db } from './db.ts';
import { create_feeds } from './feeds/poll.ts';
import { create_ingestor } from './ingest.ts';
import { install_exit_handlers } from './lifecycle.ts';
import { create_llm } from './llm.ts';
import { log, warn } from './log.ts';
import { create_media, derive_title, needs_display_copy } from './media.ts';
import { DIMS, MlClient, type MlLike, type MlStatus } from './ml-client.ts';
import { MlStub } from './ml-stub.ts';
import { data_dirs, resources_dir } from './paths.ts';
import { normalize_url } from './scrape.ts';
import { create_search, type SearchOptions } from './search.ts';
import { create_settings } from './settings.ts';
import { create_store, type Item, type ListOptions } from './store.ts';
import type { Fetcher } from './types.ts';
import { VectorIndex } from './vectors.ts';
import { encode_wav } from './wav.ts';

export type App = Awaited<ReturnType<typeof create_app>>;

export type ImageSource =
	| string
	| { clipboard: true; bytes?: undefined; name?: undefined; ext?: undefined }
	| { clipboard?: undefined; bytes: Uint8Array; name?: string; ext?: string };

export interface AppOptions {
	data_dir?: string | null;
	ml?: MlLike | null;
	fetch?: Fetcher;
	autoload?: boolean;
	seed?: boolean;
}

// From a checkout the worker sits beside its node_modules in ml/; a compiled .app
// carries both in Contents/Resources/ml, since transformers.js cannot live in the binary.
const ML_DIR = resources_dir() ? join(resources_dir()!, 'ml') : fileURLToPath(new URL('../ml', import.meta.url));
// The compiled app bundles the worker to `worker.js`; a checkout runs the source.
const WORKER = join(ML_DIR, resources_dir() ? 'worker.js' : 'worker.ts');
const ML_INSTALLED = join(ML_DIR, 'node_modules', '@huggingface', 'transformers', 'package.json');

export const ml_installed = () => existsSync(ML_INSTALLED);

export function default_ml({ models_dir, autoload = true, on_status }: { models_dir: string; autoload?: boolean; on_status?: (s: MlStatus) => void }): MlLike {
	if (process.env.GPUIX_BRAIN_STUB === '1') return new MlStub({ on_status });
	if (process.env.GPUIX_BRAIN_ML === 'off') return new MlStub({ available: false, reason: 'ML disabled by GPUIX_BRAIN_ML=off', on_status });
	if (!ml_installed()) {
		return new MlStub({ available: false, reason: 'ML dependencies not installed — run `npm run brain:install`', on_status });
	}
	return new MlClient({
		worker_path: WORKER,
		models_dir,
		autoload,
		on_status
	});
}

const date_label = () =>
	new Date().toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export async function create_app({ data_dir = null, ml = null, fetch: fetch_fn = fetch, autoload = true, seed = false }: AppOptions = {}) {
	install_exit_handlers();
	const dirs = data_dirs(data_dir ?? undefined);
	const db = open_db(dirs.db);
	const store = create_store(db);
	const blobs = create_blobs(db, dirs);
	const bus = create_bus();
	const settings = create_settings(store, bus);

	const vectors = new VectorIndex(DIMS.embed);
	vectors.load(store.all_chunk_vectors());
	const images = new VectorIndex(DIMS.clip);
	images.load(store.all_image_vectors());

	const media = create_media();
	const on_status = (status: MlStatus) => bus.emit({ type: 'ml', status });
	ml ??= default_ml({ models_dir: dirs.models, autoload: autoload && settings.get('ml.autoload') !== false, on_status });
	ml.on_status = on_status;

	const ingest = create_ingestor({ store, blobs, vectors, images, ml, media, settings, bus, fetch: fetch_fn });
	const search = create_search({ store, vectors, images, ml, settings });

	// Retention and "remove a feed with its items" reuse the whole teardown, blobs included.
	const delete_item = (id: number): boolean => {
		const gone = store.delete_item(id);
		if (!gone) return false;
		vectors.remove(gone.chunk_ids);
		images.remove([id]);
		blobs.forget(gone.blob_ids);
		store.reclaim();
		bus.emit({ type: 'item', id, status: 'deleted' });
		return true;
	};

	const feeds = create_feeds({ store, settings, bus, ingest, delete_item, fetch: fetch_fn });

	// Items added while the worker was down get their vectors once it comes up.
	let embed_ready = false;
	bus.subscribe((e) => {
		if (e.type !== 'ml') return;
		const ready = e.status.embed?.state === 'ready';
		if (ready && !embed_ready) ingest.reindex_missing();
		embed_ready = ready;
	});

	// Configuring a vision model later still describes the images already here.
	bus.subscribe((e) => {
		if (e.type !== 'settings' || !e.key.startsWith('llm.') || !settings.vision_config()) return;
		for (const item of store.list_items({ kind: 'image', limit: 10_000 })) {
			if (!item.body && item.file_blob && item.status !== 'processing') {
				store.set_status(item.id, 'pending');
				ingest.enqueue(item.id);
			}
		}
	});

	// Self-heal: a job another process (or a crashed one) left unfinished for ten
	// minutes is taken over here.
	const heal = setInterval(() => ingest.requeue_stuck({ olderThanMs: 10 * 60_000 }), 60_000);

	const added = (item: Item): Item => {
		bus.emit({ type: 'item', id: item.id, status: item.status, added: true });
		if (item.status === 'pending') ingest.enqueue(item.id, { priority: 'high' });
		return item;
	};

	const app = {
		dirs,
		db,
		store,
		blobs,
		settings,
		vectors,
		images,
		ml,
		ingest,
		media,
		bus,
		feeds,

		add_note({ title = '', body }: { title?: string; body: string }): Item {
			const text = body.trim();
			return added(store.insert_item({ kind: 'text', title: title.trim() || derive_title(text), body: text, meta: { auto_title: !title.trim() } }));
		},

		async add_link(url: string): Promise<{ item: Item; existed: boolean }> {
			const source_url = normalize_url(url);
			const existing = store.get_item_by_url(source_url);
			if (existing) return { item: existing, existed: true };
			return { item: added(store.insert_item({ kind: 'link', title: '', source_url, meta: { auto_title: true } })), existed: false };
		},

		async add_image(src: ImageSource, { title = '' }: { title?: string } = {}): Promise<Item> {
			let bytes: Uint8Array | null = null;
			let name: string;
			let ext: string | undefined;
			if (typeof src === 'string') {
				name = basename(src);
			} else if (src.clipboard) {
				bytes = await read_image();
				if (!bytes) throw new Error('no image on the clipboard');
				name = `Pasted image ${date_label()}`;
				ext = 'png';
			} else {
				bytes = src.bytes;
				name = src.name ?? `Image ${date_label()}`;
				ext = src.ext ?? 'png';
			}
			const item = store.insert_item({ kind: 'image', title: title || name, meta: { auto_title: !title, original_name: name } });
			try {
				const info = await media.import_image(typeof src === 'string' ? src : bytes!, { ext });
				const thumb = await media.make_thumb(info.bytes);
				store.update_item(item.id, {
					file_blob: blobs.put(item.id, 'original', info.bytes, info.ext),
					width: info.width,
					height: info.height,
					thumb_blob: blobs.put(item.id, 'thumb', thumb.bytes, thumb.ext),
					meta: {
						format: info.format,
						thumb_width: thumb.width,
						thumb_height: thumb.height,
						display_blob: info.display ? blobs.put(item.id, 'display', info.display.bytes, info.display.ext) : null
					}
				});
			} catch (err) {
				store.set_status(item.id, 'error', { error: (err as Error).message });
			}
			return added(store.get_item(item.id)!);
		},

		async add_audio(src: string, { move = false, recorded = false, title = '' }: { move?: boolean; recorded?: boolean; title?: string } = {}): Promise<Item> {
			const name = basename(src);
			const item = store.insert_item({
				kind: 'audio',
				title: title || (move ? `Recording ${date_label()}` : name),
				meta: { auto_title: !title, original_name: name, recorded }
			});
			try {
				const audio = await media.import_audio_file(src, { move });
				store.update_item(item.id, { file_blob: blobs.put(item.id, 'original', audio.bytes, audio.ext) });
			} catch (err) {
				store.set_status(item.id, 'error', { error: (err as Error).message });
			}
			return added(store.get_item(item.id)!);
		},

		update_note(id: number, { title, body }: { title?: string; body?: string }): Item | null {
			const patch: Partial<Item> = {};
			if (title !== undefined) {
				patch.title = title;
				patch.meta = { auto_title: false };
			}
			if (body !== undefined) patch.body = body;
			const item = store.update_item(id, patch);
			if (!item) return null;
			bus.emit({ type: 'item', id, status: item.status, updated: true });
			if (body !== undefined || title !== undefined) {
				store.set_status(id, 'pending');
				ingest.enqueue(id, { priority: 'high' });
			}
			return store.get_item(id);
		},

		delete_item,

		/** Replaces an image's body with a vision model's description. */
		async describe_image(id: number): Promise<string> {
			const config = settings.vision_config();
			if (!config) throw new Error('set a vision model in Settings first');
			const item = store.get_item(id);
			const bytes = blobs.bytes(item?.file_blob);
			if (!bytes) throw new Error('no image file');
			const description = (await create_llm(config).describe_image(bytes)).trim();
			store.update_item(id, { meta: { described_by: config.model, describe_error: null } });
			app.update_note(id, { body: description });
			return description;
		},

		async summarize(id: number): Promise<string> {
			const config = settings.llm_config();
			if (!config) throw new Error('set up an LLM in Settings first');
			const item = store.get_item(id);
			if (!item?.body) throw new Error('nothing to summarize yet');
			const summary = (await create_llm(config).summarize(item.body)).trim();
			store.update_item(id, { meta: { summary, summarized_by: config.model } });
			bus.emit({ type: 'item', id, status: item.status, updated: true });
			return summary;
		},

		get_item: (id: number) => store.get_item(id),
		list: (opts?: ListOptions) => store.list_items(opts),
		search: (query: string, opts?: SearchOptions) => search.search(query, opts),
		related: (id: number, opts?: { limit?: number }) => search.related(id, opts),
		ask: (question: string, opts?: AskOptions) => ask_llm({ search, settings }, question, opts),
		retry: (id: number) => ingest.retry(id),

		/** Fetches a link again: body, title (when never edited) and preview image are replaced. */
		rescrape(id: number): boolean {
			const item = store.get_item(id);
			if (!item || item.kind !== 'link') return false;
			store.update_item(id, { body: '', attempts: 0, status: 'pending', error: null });
			bus.emit({ type: 'item', id, status: 'pending' });
			ingest.enqueue(id, { priority: 'high' });
			return true;
		},
		retry_failed: () => ingest.retry_failed(),
		requeue: () => ingest.requeue_stuck(),
		stuck_count: () => ingest.stuck_count(),
		reindex: () => ingest.reindex_all(),
		capabilities: () => get_capabilities({ llmConfig: settings.llm_config() }),
		subscribe: bus.subscribe,
		snapshot: () => ({ ml: ml.status, queue: ingest.stats, counts: store.counts() }),
		close() {
			clearInterval(heal);
			feeds.stop();
			ml.stop_sync();
			db.close();
		}
	};

	if (seed && store.counts().total === 0) await seed_demo(app);

	blobs.prune_cache();

	// Images imported before AVIF/HEIC got a paintable copy.
	for (const item of store.list_items({ kind: 'image', limit: 10_000 })) {
		const original = needs_display_copy(item.meta.format) && !item.meta.display_blob ? blobs.bytes(item.file_blob) : null;
		if (!original) continue;
		media
			.make_display(original)
			.then((display) => {
				store.update_item(item.id, { meta: { display_blob: blobs.put(item.id, 'display', display.bytes, display.ext) } });
				bus.emit({ type: 'item', id: item.id, status: item.status, updated: true });
			})
			.catch((err) => warn(`display copy for image ${item.id} failed:`, (err as Error).message));
	}

	ml.start()
		.then(() => {
			// The first image search should not wait for CLIP to load.
			if (images.size > 0 && ml.load) ml.load('clip').catch(() => {});
		})
		.catch((err) => warn('ML worker failed to start:', (err as Error).message));
	ingest.resume();
	feeds.start();
	log(`data dir ${dirs.root} · ${store.counts().total} items · ${vectors.size} vectors`);
	return app;
}

/** A populated brain for screenshots and the smoke test; needs no models or network. */
async function seed_demo(app: App) {
	app.add_note({
		body: '# Compost notes\n\nTurn the heap every two weeks. Worms love coffee grounds but not citrus peel.\n\n- browns: cardboard, dry leaves\n- greens: kitchen scraps, grass'
	});
	app.add_note({
		title: 'Reading list',
		body: 'Books to get to this autumn:\n\n1. *The One-Straw Revolution*\n2. *Braiding Sweetgrass*\n3. Something on soil biology'
	});
	app.add_note({ body: 'Idea: a tiny app that turns everything I pour into it into fertile ground. Call it Substrate.' });
	app.store.insert_item({
		kind: 'link',
		title: 'Loam - Wikipedia',
		body: 'Loam (in geology and soil science) is soil composed mostly of sand, silt, and a smaller amount of clay. By weight, its mineral composition is about 40–40–20% concentration of sand, silt and clay, respectively.',
		source_url: 'https://en.wikipedia.org/wiki/Loam',
		meta: { site_name: 'en.wikipedia.org', auto_title: false }
	});
	app.store.insert_item({
		kind: 'link',
		title: '',
		source_url: 'https://example.invalid/unreachable',
		status: 'error',
		error: 'host not found: example.invalid',
		attempts: 3,
		meta: { auto_title: true }
	});
	const icon = fileURLToPath(new URL('../../tic-tac-toe/icon.png', import.meta.url));
	if (existsSync(icon)) await app.add_image(icon, { title: 'Tic-tac-toe icon' });
	const sine = Float32Array.from({ length: 16000 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / 16000));
	const wav = `${app.dirs.tmp}/demo-memo.wav`;
	await Bun.write(wav, encode_wav(sine, 16000));
	await app.add_audio(wav, { move: true, title: 'Voice memo (demo)' });
	for (const item of app.store.list_items({ limit: 100 })) if (item.status === 'pending') app.ingest.enqueue(item.id);
}
