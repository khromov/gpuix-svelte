/**
 * Every item goes pending → processing → ready | error. Steps are derived from the
 * row's state rather than stored, so a restart resumes at the first missing output
 * instead of replaying an hour of Whisper.
 */

import { chunk_markdown, embed_text } from './chunk.js';
import { create_llm } from './llm.js';
import { warn } from './log.js';
import { derive_title, segments_to_markdown } from './media.js';
import { thumb_path } from './paths.js';
import { fetch_image, scrape } from './scrape.js';

const RETRY_DELAYS = [5_000, 30_000, 120_000];
const MAX_ATTEMPTS = 3;

/**
 * @param {{ store: any, vectors: import('./vectors.js').VectorIndex, images: import('./vectors.js').VectorIndex,
 *   ml: any, media: any, settings: any, bus: any, dirs: import('./paths.js').DataDirs,
 *   io_concurrency?: number, fetch?: typeof fetch }} deps
 */
export function create_ingestor({ store, vectors, images, ml, media, settings, bus, dirs, io_concurrency = 4, fetch: fetch_fn = fetch }) {
	const queue = [];
	const active = new Set();
	const timers = new Map();
	let waiters = [];
	let done = 0;
	let failed = 0;

	const stats = () => ({ pending: queue.length, active: active.size, done, failed, active_ids: [...active] });
	const emit_item = (id, extra = {}) => bus.emit({ type: 'item', id, ...extra });
	const emit_queue = () => bus.emit({ type: 'queue', ...stats() });

	function enqueue(id, { priority = 'normal' } = {}) {
		if (active.has(id) || queue.includes(id)) return;
		if (priority === 'high') queue.unshift(id);
		else queue.push(id);
		pump();
	}

	function pump() {
		while (active.size < io_concurrency && queue.length) {
			const id = queue.shift();
			active.add(id);
			run(id).finally(() => {
				active.delete(id);
				emit_queue();
				pump();
				if (active.size === 0 && queue.length === 0) for (const resolve of waiters.splice(0)) resolve();
			});
		}
		emit_queue();
	}

	function plan(item) {
		const steps = [];
		if (item.kind === 'link' && !item.body) steps.push(['scrape', scrape_step]);
		if (item.kind === 'audio' && !item.meta.pcm_path) steps.push(['convert', convert_step]);
		if (item.kind === 'audio' && !item.body) steps.push(['transcribe', transcribe_step]);
		if (item.kind === 'image' && !item.body && settings.vision_config()) steps.push(['describe', describe_step]);
		if (item.kind === 'image' && item.file_path && !store.has_image_embedding(item.id)) steps.push(['clip', clip_step]);
		steps.push(['embed', embed_step]);
		return steps;
	}

	async function run(id) {
		let item = store.get_item(id);
		if (!item) return;
		store.set_status(id, 'processing');
		emit_item(id, { status: 'processing' });
		try {
			for (const [name, step] of plan(item)) {
				emit_item(id, { status: 'processing', step: name });
				await step(item);
				item = store.get_item(id);
				if (!item) return;
			}
			store.set_status(id, 'ready');
			done++;
			emit_item(id, { status: 'ready' });
		} catch (err) {
			const message = err?.message ?? String(err);
			warn(`item ${id} failed:`, message);
			store.set_status(id, 'error', { error: message });
			failed++;
			emit_item(id, { status: 'error', error: message });
			const attempts = store.get_item(id)?.attempts ?? MAX_ATTEMPTS;
			if (err?.transient && attempts < MAX_ATTEMPTS) schedule_retry(id, attempts);
		}
	}

	function schedule_retry(id, attempts) {
		clearTimeout(timers.get(id));
		const delay = RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
		timers.set(
			id,
			setTimeout(() => {
				timers.delete(id);
				if (!store.get_item(id)) return;
				store.set_status(id, 'pending');
				enqueue(id);
			}, delay)
		);
	}

	async function scrape_step(item) {
		const page = await scrape(item.source_url, { fetch: fetch_fn });
		const body = page.text || page.description || `No readable text at ${item.source_url}.`;
		const patch = {
			title: item.meta.auto_title ? page.title || page.siteName || item.source_url : item.title,
			body,
			meta: {
				canonical_url: page.canonical,
				site_name: page.siteName,
				excerpt: page.description,
				lang: page.lang,
				og_image: page.imageUrl,
				final_url: page.url,
				fetched_at: Date.now(),
				truncated: page.truncated,
				empty: !page.text
			}
		};
		if (page.imageUrl) {
			const thumb = await fetch_image(page.imageUrl, thumb_path(dirs, item.id), { fetch: fetch_fn });
			if (thumb) Object.assign(patch, { thumb_path: thumb.path, width: thumb.width, height: thumb.height });
		}
		store.update_item(item.id, patch);
	}

	async function convert_step(item) {
		if (!item.file_path) throw Object.assign(new Error('audio file missing'), { transient: false });
		const { pcm_path, duration } = await media.prepare_pcm(item.file_path, item.id);
		store.update_item(item.id, { duration, meta: { pcm_path } });
	}

	async function transcribe_step(item) {
		const language = settings.get('stt.language') || null;
		const result = await ml.transcribe(item.meta.pcm_path, {
			language,
			on_progress: (p) =>
				emit_item(item.id, {
					status: 'processing',
					step: 'transcribe',
					progress: p.total_s ? Math.min(1, p.done_s / p.total_s) : null,
					text: p.text
				})
		});
		const spoken = segments_to_markdown(result.segments, result.text);
		const words = spoken.split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w)).length;
		const patch = { body: words > 0 ? spoken : '(no speech detected)', meta: { segments: result.segments, language: result.language } };
		if (item.meta.auto_title && words >= 3) patch.title = derive_title(spoken) || item.title;
		store.update_item(item.id, patch);
	}

	// Failure here is a note on the item, not a failed ingest: the LLM is optional.
	async function describe_step(item) {
		const config = settings.vision_config();
		if (!config || !item.file_path) return;
		try {
			const description = await create_llm(config).describe_image(await Bun.file(item.file_path).bytes());
			store.update_item(item.id, { body: description.trim(), meta: { described_by: config.model, describe_error: null } });
		} catch (err) {
			warn(`describe failed for item ${item.id}:`, err.message);
			store.update_item(item.id, { meta: { describe_error: err.message } });
		}
	}

	async function clip_step(item) {
		if (!ml.available || ml.status.worker === 'down') return;
		let vec;
		try {
			vec = await ml.clip_image(item.meta.display_path ?? item.file_path);
		} catch (err) {
			if (err.code === 'ML_UNAVAILABLE') return;
			throw err;
		}
		store.set_image_embedding(item.id, ml.model_id('clip'), vec);
		images.add(item.id, item.id, vec);
	}

	async function embed_step(item) {
		// Without a worker the item stays keyword-searchable; existing vectors are kept.
		if (!ml.available) return;
		const chunks = chunk_markdown(item.body);
		const texts = chunks.map((c) => embed_text(item.title, c));
		let vecs = [];
		try {
			vecs = texts.length ? await ml.embed_texts(texts) : [];
		} catch (err) {
			if (err.code === 'ML_UNAVAILABLE') return;
			throw err;
		}
		const { removed, chunks: rows } = store.replace_chunks(
			item.id,
			chunks.map((c, i) => ({ text: c.text, embedding: vecs[i] ?? null }))
		);
		vectors.remove(removed);
		rows.forEach((row, i) => {
			if (vecs[i]) vectors.add(row.id, item.id, vecs[i]);
		});
		store.update_item(item.id, { meta: { embed_model: ml.model_id('embed'), embedded_at: Date.now() } });
	}

	function resume() {
		for (const item of store.unfinished_items()) {
			if (item.status === 'processing') store.set_status(item.id, 'pending');
			enqueue(item.id);
		}
		const current = ml.model_id('embed');
		const indexed = settings.get('index.embedModel');
		if (ml.available && !current.endsWith('#stub')) {
			if (indexed && indexed !== current && store.counts().total > 0) {
				warn(`embedding model changed (${indexed} → ${current}); reindexing`);
				reindex_all();
			}
			settings.set('index.embedModel', current);
		}
	}

	function reindex_all() {
		for (const item of store.list_items({ limit: 1_000_000 })) {
			vectors.remove_group(item.id);
			if (item.status !== 'processing') store.set_status(item.id, 'pending');
			enqueue(item.id);
		}
		store.rebuild_fts();
	}

	/** Items that never got their vectors, e.g. added while the worker was down. */
	function reindex_missing() {
		for (const id of store.items_missing_vectors()) {
			if (store.get_item(id)?.status !== 'processing') enqueue(id);
		}
	}

	function retry(id) {
		clearTimeout(timers.get(id));
		timers.delete(id);
		store.update_item(id, { attempts: 0, status: 'pending', error: null });
		emit_item(id, { status: 'pending' });
		enqueue(id, { priority: 'high' });
	}

	function retry_failed() {
		const items = store.errored_items();
		for (const item of items) retry(item.id);
		return items.length;
	}

	/**
	 * Items marked pending or processing that nobody here is working on — left by a
	 * crash, or by another process on the same database — go back in the queue.
	 * @param {{ olderThanMs?: number }} [opts]
	 */
	function requeue_stuck({ olderThanMs = 0 } = {}) {
		const cutoff = Date.now() - olderThanMs;
		let count = 0;
		for (const item of store.unfinished_items()) {
			if (active.has(item.id) || queue.includes(item.id) || timers.has(item.id)) continue;
			if (item.updated_at > cutoff) continue;
			if (item.status === 'processing') store.set_status(item.id, 'pending');
			enqueue(item.id);
			count++;
		}
		if (count) warn(`requeued ${count} unfinished item${count === 1 ? '' : 's'}`);
		return count;
	}

	/** Unfinished items this process is not handling — what a requeue would pick up. */
	const stuck_count = () => store.unfinished_items().filter((i) => !active.has(i.id) && !queue.includes(i.id) && !timers.has(i.id)).length;

	const idle = () => (active.size === 0 && queue.length === 0 ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve)));

	return {
		enqueue,
		resume,
		retry,
		retry_failed,
		requeue_stuck,
		stuck_count,
		reindex_all,
		reindex_missing,
		idle,
		get stats() {
			return stats();
		}
	};
}
