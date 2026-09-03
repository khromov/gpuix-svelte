import type { Database } from 'bun:sqlite';
import type { TranscribeSegment } from './ml-client.ts';
import { to_blob } from './vectors.ts';

/** The JSON `meta` column; every key is optional because each pipeline step adds its own. */
export interface ItemMeta {
	auto_title?: boolean;
	original_name?: string;
	format?: string | null;
	thumb_width?: number;
	thumb_height?: number;
	display_blob?: number | null;
	described_by?: string;
	describe_error?: string | null;
	summary?: string;
	summarized_by?: string;
	site_name?: string;
	canonical_url?: string | null;
	excerpt?: string;
	lang?: string;
	og_image?: string | null;
	final_url?: string;
	fetched_at?: number;
	truncated?: boolean;
	empty?: boolean;
	pcm_blob?: number | null;
	/** Captured through the microphone rather than handed to the app, so safe to re-encode. */
	recorded?: boolean;
	/** The post-transcript pass that drops the PCM and shrinks a recording has run. */
	compacted?: boolean;
	segments?: TranscribeSegment[];
	language?: string | null;
	embed_model?: string;
	embedded_at?: number;
	/** Brought in by a feed poll rather than by hand. */
	feed?: boolean;
	author?: string;
	/** Edited by hand, so retention leaves it alone. */
	edited?: boolean;
}

export type Kind = 'text' | 'link' | 'image' | 'audio';
export type Status = 'pending' | 'processing' | 'ready' | 'error';

export type Item = {
	id: number;
	kind: Kind;
	title: string;
	body: string;
	source_url: string | null;
	file_blob: number | null;
	thumb_blob: number | null;
	width: number | null;
	height: number | null;
	duration: number | null;
	status: Status;
	error: string | null;
	attempts: number;
	meta: ItemMeta;
	feed_id: number | null;
	created_at: number;
	updated_at: number;
};

export interface Feed {
	id: number;
	type: string;
	url: string;
	title: string;
	site_url: string | null;
	schedule: string;
	full_text: boolean;
	enabled: boolean;
	retention_days: number | null;
	retention_max: number | null;
	etag: string | null;
	last_modified: string | null;
	last_polled_at: number | null;
	last_ok_at: number | null;
	last_error: string | null;
	created_at: number;
}

/** An entry the poller has seen, whether or not its item still exists. */
export interface FeedEntryRow {
	feed_id: number;
	guid: string;
	item_id: number | null;
	seen_at: number;
}

export interface Chunk {
	id: number;
	item_id: number;
	idx: number;
	text: string;
}

export type ChunkDetail = Chunk & { title: string; kind: Kind; item_status: Status };

export interface FtsHit {
	id: number;
	rank: number;
	snippet: string;
}

export interface ListOptions {
	kind?: Kind | null;
	limit?: number;
	before?: number | null;
}

export interface Counts {
	total: number;
	by_kind: Record<Kind, number>;
	pending: number;
	error: number;
	feeds: number;
}

export type Store = ReturnType<typeof create_store>;

type ItemRow = Omit<Item, 'meta'> & { meta: string };
type IdRow = { id: number };
type VectorRow = { id: number; group: number; embedding: Uint8Array };
type CountRow = { total: number; text: number | null; link: number | null; image: number | null; audio: number | null; pending: number | null; error: number | null; feeds: number | null };
type FeedRow = Omit<Feed, 'full_text' | 'enabled'> & { full_text: number; enabled: number };
type Param = string | number | bigint | boolean | null | Uint8Array;
type Params = Record<string, Param>;

const ITEM_COLS =
	'id, kind, title, body, source_url, file_blob, thumb_blob, width, height, duration, status, error, attempts, meta, feed_id, created_at, updated_at';
const PATCHABLE = new Set(['kind', 'title', 'body', 'source_url', 'file_blob', 'thumb_blob', 'width', 'height', 'duration', 'status', 'error', 'attempts', 'feed_id']);

/** Every two hours, on the hour — croner's six-field form, seconds first. */
export const DEFAULT_SCHEDULE = '0 0 */2 * * *';

const FEED_COLS =
	'id, type, url, title, site_url, schedule, full_text, enabled, retention_days, retention_max, etag, last_modified, last_polled_at, last_ok_at, last_error, created_at';
const FEED_PATCHABLE = new Set([
	'type', 'url', 'title', 'site_url', 'schedule', 'full_text', 'enabled', 'retention_days', 'retention_max', 'etag', 'last_modified', 'last_polled_at', 'last_ok_at', 'last_error'
]);

const to_feed = (row: FeedRow | null | undefined): Feed | null => (row ? { ...row, full_text: !!row.full_text, enabled: !!row.enabled } : null);

const parse_meta = (s: string): ItemMeta => {
	try {
		return JSON.parse(s) ?? {};
	} catch {
		return {};
	}
};

const to_item = (row: ItemRow | null | undefined): Item | null => (row ? { ...row, meta: parse_meta(row.meta) } : null);

export function create_store(db: Database) {
	const q = <Row>(sql: string) => db.query<Row, Params[]>(sql);

	const insert_stmt = q<never>(
		`INSERT INTO items (kind, title, body, source_url, file_blob, thumb_blob, width, height, duration, status, error, meta, feed_id, created_at, updated_at)
		 VALUES ($kind, $title, $body, $source_url, $file_blob, $thumb_blob, $width, $height, $duration, $status, $error, $meta, $feed_id, $created_at, $now)`
	);
	const get_stmt = q<ItemRow>(`SELECT ${ITEM_COLS} FROM items WHERE id = $id`);
	const by_url_stmt = q<ItemRow>(`SELECT ${ITEM_COLS} FROM items WHERE source_url = $url`);
	const list_stmt = q<ItemRow>(
		`SELECT ${ITEM_COLS} FROM items
		 WHERE ($kind IS NULL OR kind = $kind) AND ($before IS NULL OR created_at < $before)
		 ORDER BY created_at DESC, id DESC LIMIT $limit`
	);
	const unfinished_stmt = q<ItemRow>(`SELECT ${ITEM_COLS} FROM items WHERE status IN ('pending', 'processing') ORDER BY created_at ASC`);
	const errored_stmt = q<ItemRow>(`SELECT ${ITEM_COLS} FROM items WHERE status = 'error' ORDER BY created_at ASC`);
	const status_stmt = q<never>(`UPDATE items SET status = $status, error = $error, updated_at = $now WHERE id = $id`);
	const fail_stmt = q<never>(`UPDATE items SET status = 'error', error = $error, attempts = attempts + 1, updated_at = $now WHERE id = $id`);
	const delete_stmt = q<never>(`DELETE FROM items WHERE id = $id`);

	const chunk_ids_stmt = q<IdRow>(`SELECT id FROM chunks WHERE item_id = $item_id`);
	const blob_ids_stmt = q<IdRow>(`SELECT id FROM blobs WHERE item_id = $item_id`);
	const chunks_stmt = q<Chunk>(`SELECT id, item_id, idx, text FROM chunks WHERE item_id = $item_id ORDER BY idx`);
	const chunk_stmt = q<ChunkDetail>(
		`SELECT c.id, c.item_id, c.idx, c.text, i.title, i.kind, i.status AS item_status
		 FROM chunks c JOIN items i ON i.id = c.item_id WHERE c.id = $id`
	);
	const delete_chunks_stmt = q<never>(`DELETE FROM chunks WHERE item_id = $item_id`);
	const insert_chunk_stmt = q<never>(`INSERT INTO chunks (item_id, idx, text, embedding) VALUES ($item_id, $idx, $text, $embedding)`);
	const chunk_embed_stmt = q<never>(`UPDATE chunks SET embedding = $embedding WHERE id = $id`);
	const chunk_vectors_stmt = q<VectorRow>(`SELECT id, item_id AS "group", embedding FROM chunks WHERE embedding IS NOT NULL`);
	const missing_vectors_stmt = q<IdRow>(
		`SELECT id FROM items WHERE status = 'ready' AND (
		   (body <> '' AND NOT EXISTS (SELECT 1 FROM chunks WHERE chunks.item_id = items.id AND embedding IS NOT NULL))
		   OR (kind = 'image' AND file_blob IS NOT NULL AND NOT EXISTS (SELECT 1 FROM image_embeddings WHERE item_id = items.id))
		 )`
	);

	const image_embed_stmt = q<never>(`INSERT OR REPLACE INTO image_embeddings (item_id, model, embedding) VALUES ($item_id, $model, $embedding)`);
	const has_image_embed_stmt = q<unknown>(`SELECT 1 FROM image_embeddings WHERE item_id = $item_id`);
	const image_vectors_stmt = q<VectorRow>(`SELECT item_id AS id, item_id AS "group", embedding FROM image_embeddings`);

	const setting_get_stmt = q<{ value: string }>(`SELECT value FROM settings WHERE key = $key`);
	const setting_set_stmt = q<never>(`INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
	const settings_all_stmt = q<{ key: string; value: string }>(`SELECT key, value FROM settings`);

	const count_stmt = q<CountRow>(
		`SELECT COUNT(*) AS total,
		        SUM(kind = 'text') AS text, SUM(kind = 'link') AS link, SUM(kind = 'image') AS image, SUM(kind = 'audio') AS audio,
		        SUM(status IN ('pending', 'processing')) AS pending, SUM(status = 'error') AS error,
		        SUM(feed_id IS NOT NULL) AS feeds
		 FROM items`
	);

	const feed_insert_stmt = q<never>(
		`INSERT INTO feeds (type, url, title, site_url, schedule, full_text, enabled, retention_days, retention_max, created_at)
		 VALUES ($type, $url, $title, $site_url, $schedule, $full_text, $enabled, $retention_days, $retention_max, $now)`
	);
	const feeds_stmt = q<FeedRow>(`SELECT ${FEED_COLS} FROM feeds ORDER BY created_at ASC`);
	const feed_stmt = q<FeedRow>(`SELECT ${FEED_COLS} FROM feeds WHERE id = $id`);
	const feed_by_url_stmt = q<FeedRow>(`SELECT ${FEED_COLS} FROM feeds WHERE url = $url`);
	const feed_delete_stmt = q<never>(`DELETE FROM feeds WHERE id = $id`);
	const feed_items_stmt = q<IdRow>(`SELECT id FROM items WHERE feed_id = $feed_id`);
	const feed_item_ids_stmt = q<IdRow>(`SELECT id FROM items WHERE feed_id IS NOT NULL`);
	const feed_entry_stmt = q<FeedEntryRow>(`SELECT feed_id, guid, item_id, seen_at FROM feed_entries WHERE feed_id = $feed_id AND guid = $guid`);
	const feed_entry_insert_stmt = q<never>(
		`INSERT INTO feed_entries (feed_id, guid, item_id, seen_at) VALUES ($feed_id, $guid, $item_id, $now)
		 ON CONFLICT(feed_id, guid) DO UPDATE SET item_id = excluded.item_id`
	);
	// Newest first, so retention counts from the end of the list.
	const feed_entry_items_stmt = q<ItemRow>(
		`SELECT ${ITEM_COLS.split(', ').map((c) => `i.${c}`).join(', ')} FROM feed_entries e JOIN items i ON i.id = e.item_id
		 WHERE e.feed_id = $feed_id ORDER BY i.created_at DESC, i.id DESC`
	);
	const feed_counts_stmt = q<{ feed_id: number; n: number }>(`SELECT feed_id, COUNT(*) AS n FROM items WHERE feed_id IS NOT NULL GROUP BY feed_id`);

	const store = {
		insert_item(fields: Partial<Item> & { kind: Kind }): Item {
			const now = Date.now();
			const { lastInsertRowid } = insert_stmt.run({
				kind: fields.kind,
				title: fields.title ?? '',
				body: fields.body ?? '',
				source_url: fields.source_url ?? null,
				file_blob: fields.file_blob ?? null,
				thumb_blob: fields.thumb_blob ?? null,
				width: fields.width ?? null,
				height: fields.height ?? null,
				duration: fields.duration ?? null,
				status: fields.status ?? 'pending',
				error: fields.error ?? null,
				meta: JSON.stringify(fields.meta ?? {}),
				feed_id: fields.feed_id ?? null,
				// A feed entry keeps its publish date, so the timeline stays chronological.
				created_at: fields.created_at ?? now,
				now
			});
			return store.get_item(Number(lastInsertRowid))!;
		},

		/** Shallow-merges `meta`; other columns are replaced. */
		update_item(id: number, patch: Partial<Item>): Item | null {
			const sets = ['updated_at = $updated_at'];
			const params: Params = { id, updated_at: Date.now() };
			for (const [key, value] of Object.entries(patch)) {
				if (!PATCHABLE.has(key)) continue;
				sets.push(`${key} = $${key}`);
				params[key] = (value ?? null) as Param;
			}
			if (patch.meta) {
				const current = store.get_item(id)?.meta ?? {};
				sets.push('meta = $meta');
				params.meta = JSON.stringify({ ...current, ...patch.meta });
			}
			db.query<never, Params>(`UPDATE items SET ${sets.join(', ')} WHERE id = $id`).run(params);
			return store.get_item(id);
		},

		set_status(id: number, status: Status, { error = null }: { error?: string | null } = {}) {
			if (status === 'error') fail_stmt.run({ id, error, now: Date.now() });
			else status_stmt.run({ id, status, error, now: Date.now() });
		},

		get_item: (id: number): Item | null => to_item(get_stmt.get({ id })),
		get_item_by_url: (url: string): Item | null => to_item(by_url_stmt.get({ url })),

		list_items({ kind = null, limit = 50, before = null }: ListOptions = {}): Item[] {
			return list_stmt.all({ kind, limit, before }).map(to_item) as Item[];
		},

		get_items(ids: number[]): Item[] {
			if (!ids.length) return [];
			const rows = db.query<ItemRow, number[]>(`SELECT ${ITEM_COLS} FROM items WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
			const by_id = new Map(rows.map((r) => [r.id, to_item(r)]));
			return ids.map((id) => by_id.get(id)).filter(Boolean) as Item[];
		},

		unfinished_items: (): Item[] => unfinished_stmt.all().map(to_item) as Item[],
		errored_items: (): Item[] => errored_stmt.all().map(to_item) as Item[],

		/** The blob rows go with the item (ON DELETE CASCADE); their ids come back so the cache can too. */
		delete_item: db.transaction((id: number): { chunk_ids: number[]; blob_ids: number[] } | null => {
			const item = store.get_item(id);
			if (!item) return null;
			const chunk_ids = chunk_ids_stmt.all({ item_id: id }).map((r) => r.id);
			const blob_ids = blob_ids_stmt.all({ item_id: id }).map((r) => r.id);
			delete_stmt.run({ id });
			return { chunk_ids, blob_ids };
		}),

		replace_chunks: db.transaction((item_id: number, chunks: Array<{ text: string; embedding?: Float32Array | null }>): { removed: number[]; chunks: Chunk[] } => {
			const removed = chunk_ids_stmt.all({ item_id }).map((r) => r.id);
			delete_chunks_stmt.run({ item_id });
			const out: Chunk[] = [];
			chunks.forEach((chunk, idx) => {
				const { lastInsertRowid } = insert_chunk_stmt.run({
					item_id,
					idx,
					text: chunk.text,
					embedding: chunk.embedding ? to_blob(chunk.embedding) : null
				});
				out.push({ id: Number(lastInsertRowid), item_id, idx, text: chunk.text });
			});
			return { removed, chunks: out };
		}),

		set_chunk_embedding(chunk_id: number, vec: Float32Array) {
			chunk_embed_stmt.run({ id: chunk_id, embedding: to_blob(vec) });
		},

		chunks_of: (item_id: number): Chunk[] => chunks_stmt.all({ item_id }),
		get_chunk: (id: number): ChunkDetail | null => chunk_stmt.get({ id }) ?? null,
		all_chunk_vectors: () => chunk_vectors_stmt.iterate(),
		items_missing_vectors: (): number[] => missing_vectors_stmt.all().map((r) => r.id),

		set_image_embedding(item_id: number, model: string, vec: Float32Array) {
			image_embed_stmt.run({ item_id, model, embedding: to_blob(vec) });
		},
		has_image_embedding: (item_id: number): boolean => has_image_embed_stmt.get({ item_id }) != null,
		all_image_vectors: () => image_vectors_stmt.iterate(),

		/** bm25 is lower-is-better; the title column counts three times. `match` is an FTS5 query. */
		search_fts(match: string, { limit = 50, kinds = null, feeds = true }: { limit?: number; kinds?: Kind[] | null; feeds?: boolean } = {}): FtsHit[] {
			const kind_filter = kinds?.length ? ` AND items.kind IN (${kinds.map((k) => `'${k}'`).join(',')})` : '';
			const feed_filter = feeds ? '' : ' AND items.feed_id IS NULL';
			try {
				return db
					.query<FtsHit, Params>(
						`SELECT items_fts.rowid AS id, bm25(items_fts, 3.0, 1.0) AS rank,
						        snippet(items_fts, 1, '', '', '…', 14) AS snippet
						 FROM items_fts JOIN items ON items.id = items_fts.rowid
						 WHERE items_fts MATCH $match${kind_filter}${feed_filter}
						 ORDER BY rank LIMIT $limit`
					)
					.all({ match, limit });
			} catch {
				return [];
			}
		},

		rebuild_fts() {
			db.run(`INSERT INTO items_fts(items_fts) VALUES ('rebuild')`);
		},

		/** Hands the pages a deleted image left behind back to the filesystem. */
		reclaim() {
			db.run('PRAGMA incremental_vacuum');
		},

		bytes_used(): number {
			const row = db.query<{ n: number }, []>('SELECT page_count * page_size - freelist_count * page_size AS n FROM pragma_page_count(), pragma_page_size(), pragma_freelist_count()').get();
			return row?.n ?? 0;
		},

		get_setting(key: string): unknown {
			const row = setting_get_stmt.get({ key });
			if (!row) return undefined;
			try {
				return JSON.parse(row.value);
			} catch {
				return undefined;
			}
		},
		set_setting(key: string, value: unknown) {
			setting_set_stmt.run({ key, value: JSON.stringify(value ?? null) });
		},
		all_settings(): Record<string, unknown> {
			const out: Record<string, unknown> = {};
			for (const row of settings_all_stmt.all()) {
				try {
					out[row.key] = JSON.parse(row.value);
				} catch {
					// A row an older build wrote by hand; skipping it beats failing every setting.
				}
			}
			return out;
		},

		counts(): Counts {
			const row = count_stmt.get()!;
			return {
				total: row.total ?? 0,
				by_kind: { text: row.text ?? 0, link: row.link ?? 0, image: row.image ?? 0, audio: row.audio ?? 0 },
				pending: row.pending ?? 0,
				error: row.error ?? 0,
				feeds: row.feeds ?? 0
			};
		},

		list_feeds: (): Feed[] => feeds_stmt.all().map(to_feed) as Feed[],
		get_feed: (id: number): Feed | null => to_feed(feed_stmt.get({ id })),
		get_feed_by_url: (url: string): Feed | null => to_feed(feed_by_url_stmt.get({ url })),

		insert_feed(fields: Partial<Feed> & { url: string }): Feed {
			const { lastInsertRowid } = feed_insert_stmt.run({
				type: fields.type ?? 'rss',
				url: fields.url,
				title: fields.title ?? '',
				site_url: fields.site_url ?? null,
				schedule: fields.schedule ?? DEFAULT_SCHEDULE,
				full_text: fields.full_text === false ? 0 : 1,
				enabled: fields.enabled === false ? 0 : 1,
				retention_days: fields.retention_days ?? null,
				retention_max: fields.retention_max ?? null,
				now: Date.now()
			});
			return store.get_feed(Number(lastInsertRowid))!;
		},

		update_feed(id: number, patch: Partial<Feed>): Feed | null {
			const sets: string[] = [];
			const params: Params = { id };
			for (const [key, value] of Object.entries(patch)) {
				if (!FEED_PATCHABLE.has(key)) continue;
				sets.push(`${key} = $${key}`);
				params[key] = typeof value === 'boolean' ? (value ? 1 : 0) : ((value ?? null) as Param);
			}
			if (!sets.length) return store.get_feed(id);
			db.query<never, Params>(`UPDATE feeds SET ${sets.join(', ')} WHERE id = $id`).run(params);
			return store.get_feed(id);
		},

		/** The items outlive the feed row; their `feed_id` goes null on its own. */
		delete_feed(id: number) {
			feed_delete_stmt.run({ id });
		},
		feed_items: (feed_id: number): number[] => feed_items_stmt.all({ feed_id }).map((r) => r.id),

		seen_entry: (feed_id: number, guid: string): boolean => feed_entry_stmt.get({ feed_id, guid }) != null,
		record_entry(feed_id: number, guid: string, item_id: number | null) {
			feed_entry_insert_stmt.run({ feed_id, guid, item_id, now: Date.now() });
		},
		feed_entry_items: (feed_id: number): Item[] => feed_entry_items_stmt.all({ feed_id }).map(to_item) as Item[],
		feed_counts(): Record<number, number> {
			const out: Record<number, number> = {};
			for (const row of feed_counts_stmt.all()) out[row.feed_id] = row.n;
			return out;
		},

		/** The exclusion set the in-memory vector indexes filter against. */
		feed_item_ids: (): Set<number> => new Set(feed_item_ids_stmt.all().map((r) => r.id))
	};

	return store;
}
