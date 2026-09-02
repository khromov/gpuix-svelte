/**
 * The UI's mirror of the data layer: the app object's bus events land in `$state`
 * here, and every component reads from this module rather than the store.
 */

import type { App } from './app.ts';
import type { capabilities } from './capabilities.ts';
import type { MlStatus } from './ml-client.ts';
import type { Item, Store } from './store.ts';

export interface Progress {
	step: string | null;
	progress: number | null;
	text: string | null;
}
export interface QueueStats {
	pending: number;
	active: number;
	done: number;
	failed: number;
	active_ids: number[];
}
export type Counts = ReturnType<Store['counts']>;
export type Capabilities = Awaited<ReturnType<typeof capabilities>>;

export interface Data {
	items: Item[];
	progress: Record<number, Progress>;
	counts: Counts;
	queue: QueueStats;
	stuck: number;
	memory: number;
	ml: MlStatus;
	capabilities: Capabilities | null;
	ready: boolean;
}

export const data = $state<Data>({
	items: [],
	progress: {},
	counts: { total: 0, by_kind: { text: 0, link: 0, image: 0, audio: 0 }, pending: 0, error: 0 },
	queue: { pending: 0, active: 0, done: 0, failed: 0, active_ids: [] },
	stuck: 0,
	memory: process.memoryUsage().rss,
	ml: { embed: { state: 'unloaded' }, whisper: { state: 'unloaded' }, clip: { state: 'unloaded' }, worker: 'down', error: null } as MlStatus,
	capabilities: null,
	ready: false
});

let app: App | null = null;

export const get_app = () => app as App;

function upsert(item: Item) {
	const at = data.items.findIndex((i) => i.id === item.id);
	if (at === -1) {
		data.items.push(item);
		data.items.sort((a, b) => b.created_at - a.created_at || b.id - a.id);
	} else {
		data.items[at] = item;
	}
}

function refresh_counts() {
	data.counts = app!.store.counts();
	data.stuck = app!.stuck_count();
}

/** Idempotent: a hot remount calls it again with the same app. */
export function bind_app(next: App) {
	if (app === next) return;
	app = next;
	data.items = app.list({ limit: 500 });
	data.ml = app.ml.status;
	refresh_counts();
	data.queue = app.ingest.stats;
	data.ready = true;
	app.capabilities().then((caps) => {
		data.capabilities = caps;
	});

	// Another process on the same database (an import script) moves items without
	// telling this one; a slow poll keeps the counts and the stuck number honest.
	setInterval(() => {
		if (!app) return;
		refresh_counts();
		for (const item of app.store.unfinished_items()) upsert(item);
		data.memory = process.memoryUsage().rss;
	}, 5000);

	app.subscribe((event) => {
		if (event.type === 'item') {
			if (event.status === 'deleted') {
				const at = data.items.findIndex((i) => i.id === event.id);
				if (at !== -1) data.items.splice(at, 1);
				delete data.progress[event.id];
			} else {
				const item = app!.get_item(event.id);
				if (item) upsert(item);
				if (event.status === 'processing') {
					data.progress[event.id] = { step: event.step ?? null, progress: event.progress ?? null, text: event.text ?? null };
				} else {
					delete data.progress[event.id];
				}
			}
			refresh_counts();
		} else if (event.type === 'queue') {
			data.queue = { pending: event.pending, active: event.active, done: event.done, failed: event.failed, active_ids: event.active_ids ?? [] };
			data.stuck = app!.stuck_count();
		} else if (event.type === 'ml') {
			data.ml = { ...event.status };
		} else if (event.type === 'settings' && event.key.startsWith('llm.')) {
			app!.capabilities().then((caps) => {
				data.capabilities = caps;
			});
		}
	});
}

export const STEP_LABEL: Record<string, string> = {
	scrape: 'Reading page…',
	convert: 'Converting audio…',
	transcribe: 'Transcribing…',
	describe: 'Describing image…',
	clip: 'Indexing image…',
	embed: 'Embedding…'
};

export function status_text(item: Item): string {
	if (item.status === 'error') return item.error ?? 'failed';
	if (item.status === 'pending') return 'Queued…';
	if (item.status === 'processing') {
		const p = data.progress[item.id];
		const label = STEP_LABEL[p?.step as string] ?? 'Working…';
		return p?.progress != null ? `${label} ${Math.round(p.progress * 100)}%` : label;
	}
	return '';
}

export const item_by_id = (id: number): Item | null => data.items.find((i) => i.id === id) ?? app?.get_item(id) ?? null;

export function ago(ts: number): string {
	const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
	if (mins < 60 * 24 * 30) return `${Math.round(mins / (60 * 24))}d ago`;
	return new Intl.DateTimeFormat().format(ts);
}

export const display_title = (item: Item): string => item.title || (item.kind === 'link' ? item.source_url : '') || 'Untitled';

export function preview(item: Item, max = 160): string {
	let body = item.body ?? '';
	// An auto-titled note's first line is its title; showing it twice says nothing.
	if (item.meta?.auto_title && item.kind === 'text') {
		const lines = body.split('\n');
		const first = lines.findIndex((line) => line.trim());
		if (first !== -1 && lines.length > first + 1) body = lines.slice(first + 1).join('\n');
	}
	const text = body.replace(/^#+\s*/gm, '').replace(/[*_`>]/g, '').replace(/\s+/g, ' ').trim();
	if (text) return text.length > max ? text.slice(0, max - 1).replace(/\s\S*$/, '') + '…' : text;
	if (item.kind === 'link') return item.source_url ?? '';
	if (item.kind === 'image') return item.width ? `${item.width} × ${item.height}` : 'image';
	if (item.kind === 'audio') return item.duration ? `${Math.round(item.duration)}s` : 'audio';
	return '';
}

export const format_bytes = (bytes: number) => (bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(1)} GB` : `${Math.round(bytes / 1048576)} MB`);

export function format_duration(seconds: number | null | undefined): string {
	if (!seconds) return '0:00';
	const s = Math.round(seconds);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
