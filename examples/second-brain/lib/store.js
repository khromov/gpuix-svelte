import { to_blob } from './vectors.js';

/**
 * @typedef {'text' | 'link' | 'image' | 'audio'} Kind
 * @typedef {'pending' | 'processing' | 'ready' | 'error'} Status
 * @typedef {{ id: number, kind: Kind, title: string, body: string, source_url: string | null,
 *   file_path: string | null, thumb_path: string | null, width: number | null, height: number | null,
 *   duration: number | null, status: Status, error: string | null, attempts: number,
 *   meta: Record<string, any>, created_at: number, updated_at: number }} Item
 * @typedef {{ id: number, item_id: number, idx: number, text: string }} Chunk
 */

const ITEM_COLS =
	'id, kind, title, body, source_url, file_path, thumb_path, width, height, duration, status, error, attempts, meta, created_at, updated_at';
const PATCHABLE = new Set(['kind', 'title', 'body', 'source_url', 'file_path', 'thumb_path', 'width', 'height', 'duration', 'status', 'error', 'attempts']);

const parse_meta = (s) => {
	try {
		return JSON.parse(s) ?? {};
	} catch {
		return {};
	}
};

/** @param {any} row @returns {Item | null} */
const to_item = (row) => (row ? { ...row, meta: parse_meta(row.meta) } : null);

/** @param {import('bun:sqlite').Database} db */
export function create_store(db) {
	const q = (sql) => db.query(sql);

	const insert_stmt = q(
		`INSERT INTO items (kind, title, body, source_url, file_path, thumb_path, width, height, duration, status, error, meta, created_at, updated_at)
		 VALUES ($kind, $title, $body, $source_url, $file_path, $thumb_path, $width, $height, $duration, $status, $error, $meta, $now, $now)`
	);
	const get_stmt = q(`SELECT ${ITEM_COLS} FROM items WHERE id = $id`);
	const by_url_stmt = q(`SELECT ${ITEM_COLS} FROM items WHERE source_url = $url`);
	const list_stmt = q(
		`SELECT ${ITEM_COLS} FROM items
		 WHERE ($kind IS NULL OR kind = $kind) AND ($before IS NULL OR created_at < $before)
		 ORDER BY created_at DESC, id DESC LIMIT $limit`
	);
	const unfinished_stmt = q(`SELECT ${ITEM_COLS} FROM items WHERE status IN ('pending', 'processing') ORDER BY created_at ASC`);
	const errored_stmt = q(`SELECT ${ITEM_COLS} FROM items WHERE status = 'error' ORDER BY created_at ASC`);
	const status_stmt = q(`UPDATE items SET status = $status, error = $error, updated_at = $now WHERE id = $id`);
	const fail_stmt = q(`UPDATE items SET status = 'error', error = $error, attempts = attempts + 1, updated_at = $now WHERE id = $id`);
	const delete_stmt = q(`DELETE FROM items WHERE id = $id`);

	const chunk_ids_stmt = q(`SELECT id FROM chunks WHERE item_id = $item_id`);
	const chunks_stmt = q(`SELECT id, item_id, idx, text FROM chunks WHERE item_id = $item_id ORDER BY idx`);
	const chunk_stmt = q(
		`SELECT c.id, c.item_id, c.idx, c.text, i.title, i.kind, i.status AS item_status
		 FROM chunks c JOIN items i ON i.id = c.item_id WHERE c.id = $id`
	);
	const delete_chunks_stmt = q(`DELETE FROM chunks WHERE item_id = $item_id`);
	const insert_chunk_stmt = q(`INSERT INTO chunks (item_id, idx, text, embedding) VALUES ($item_id, $idx, $text, $embedding)`);
	const chunk_embed_stmt = q(`UPDATE chunks SET embedding = $embedding WHERE id = $id`);
	const chunk_vectors_stmt = q(`SELECT id, item_id AS "group", embedding FROM chunks WHERE embedding IS NOT NULL`);
	const missing_vectors_stmt = q(
		`SELECT id FROM items WHERE status = 'ready' AND (
		   (body <> '' AND NOT EXISTS (SELECT 1 FROM chunks WHERE chunks.item_id = items.id AND embedding IS NOT NULL))
		   OR (kind = 'image' AND file_path IS NOT NULL AND NOT EXISTS (SELECT 1 FROM image_embeddings WHERE item_id = items.id))
		 )`
	);

	const image_embed_stmt = q(`INSERT OR REPLACE INTO image_embeddings (item_id, model, embedding) VALUES ($item_id, $model, $embedding)`);
	const has_image_embed_stmt = q(`SELECT 1 FROM image_embeddings WHERE item_id = $item_id`);
	const image_vectors_stmt = q(`SELECT item_id AS id, item_id AS "group", embedding FROM image_embeddings`);

	const setting_get_stmt = q(`SELECT value FROM settings WHERE key = $key`);
	const setting_set_stmt = q(`INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
	const settings_all_stmt = q(`SELECT key, value FROM settings`);

	const count_stmt = q(
		`SELECT COUNT(*) AS total,
		        SUM(kind = 'text') AS text, SUM(kind = 'link') AS link, SUM(kind = 'image') AS image, SUM(kind = 'audio') AS audio,
		        SUM(status IN ('pending', 'processing')) AS pending, SUM(status = 'error') AS error
		 FROM items`
	);

	const store = {
		/** @param {Partial<Item> & { kind: Kind }} fields */
		insert_item(fields) {
			const now = Date.now();
			const { lastInsertRowid } = insert_stmt.run({
				kind: fields.kind,
				title: fields.title ?? '',
				body: fields.body ?? '',
				source_url: fields.source_url ?? null,
				file_path: fields.file_path ?? null,
				thumb_path: fields.thumb_path ?? null,
				width: fields.width ?? null,
				height: fields.height ?? null,
				duration: fields.duration ?? null,
				status: fields.status ?? 'pending',
				error: fields.error ?? null,
				meta: JSON.stringify(fields.meta ?? {}),
				now
			});
			return store.get_item(Number(lastInsertRowid));
		},

		/** Shallow-merges `meta`; other columns are replaced. @param {number} id @param {Partial<Item>} patch */
		update_item(id, patch) {
			const sets = ['updated_at = $updated_at'];
			const params = { id, updated_at: Date.now() };
			for (const [key, value] of Object.entries(patch)) {
				if (!PATCHABLE.has(key)) continue;
				sets.push(`${key} = $${key}`);
				params[key] = value ?? null;
			}
			if (patch.meta) {
				const current = store.get_item(id)?.meta ?? {};
				sets.push('meta = $meta');
				params.meta = JSON.stringify({ ...current, ...patch.meta });
			}
			db.query(`UPDATE items SET ${sets.join(', ')} WHERE id = $id`).run(params);
			return store.get_item(id);
		},

		/** @param {number} id @param {Status} status @param {{ error?: string | null }} [opts] */
		set_status(id, status, { error = null } = {}) {
			if (status === 'error') fail_stmt.run({ id, error, now: Date.now() });
			else status_stmt.run({ id, status, error, now: Date.now() });
		},

		get_item: (id) => to_item(get_stmt.get({ id })),
		get_item_by_url: (url) => to_item(by_url_stmt.get({ url })),

		/** @param {{ kind?: Kind | null, limit?: number, before?: number | null }} [opts] @returns {Item[]} */
		list_items({ kind = null, limit = 50, before = null } = {}) {
			return list_stmt.all({ kind, limit, before }).map(to_item);
		},

		get_items(ids) {
			if (!ids.length) return [];
			const rows = db.query(`SELECT ${ITEM_COLS} FROM items WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
			const by_id = new Map(rows.map((r) => [r.id, to_item(r)]));
			return ids.map((id) => by_id.get(id)).filter(Boolean);
		},

		unfinished_items: () => unfinished_stmt.all().map(to_item),
		errored_items: () => errored_stmt.all().map(to_item),

		/** @returns {{ chunk_ids: number[], file_path: string | null, thumb_path: string | null, meta: Record<string, any> } | null} */
		delete_item: db.transaction((id) => {
			const item = store.get_item(id);
			if (!item) return null;
			const chunk_ids = chunk_ids_stmt.all({ item_id: id }).map((r) => r.id);
			delete_stmt.run({ id });
			return { chunk_ids, file_path: item.file_path, thumb_path: item.thumb_path, meta: item.meta };
		}),

		/**
		 * @param {number} item_id
		 * @param {Array<{ text: string, embedding?: Float32Array | null }>} chunks
		 * @returns {{ removed: number[], chunks: Chunk[] }}
		 */
		replace_chunks: db.transaction((item_id, chunks) => {
			const removed = chunk_ids_stmt.all({ item_id }).map((r) => r.id);
			delete_chunks_stmt.run({ item_id });
			const out = [];
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

		set_chunk_embedding(chunk_id, vec) {
			chunk_embed_stmt.run({ id: chunk_id, embedding: to_blob(vec) });
		},

		chunks_of: (item_id) => chunks_stmt.all({ item_id }),
		get_chunk: (id) => chunk_stmt.get({ id }) ?? null,
		all_chunk_vectors: () => chunk_vectors_stmt.iterate(),
		items_missing_vectors: () => missing_vectors_stmt.all().map((r) => r.id),

		set_image_embedding(item_id, model, vec) {
			image_embed_stmt.run({ item_id, model, embedding: to_blob(vec) });
		},
		has_image_embedding: (item_id) => has_image_embed_stmt.get({ item_id }) != null,
		all_image_vectors: () => image_vectors_stmt.iterate(),

		/**
		 * bm25 is lower-is-better; the title column counts three times.
		 * @param {string} match an FTS5 query
		 * @param {{ limit?: number, kinds?: Kind[] | null }} [opts]
		 * @returns {Array<{ id: number, rank: number, snippet: string }>}
		 */
		search_fts(match, { limit = 50, kinds = null } = {}) {
			const kind_filter = kinds?.length ? ` AND items.kind IN (${kinds.map((k) => `'${k}'`).join(',')})` : '';
			try {
				return db
					.query(
						`SELECT items_fts.rowid AS id, bm25(items_fts, 3.0, 1.0) AS rank,
						        snippet(items_fts, 1, '', '', '…', 14) AS snippet
						 FROM items_fts JOIN items ON items.id = items_fts.rowid
						 WHERE items_fts MATCH $match${kind_filter}
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

		get_setting(key) {
			const row = setting_get_stmt.get({ key });
			if (!row) return undefined;
			try {
				return JSON.parse(row.value);
			} catch {
				return undefined;
			}
		},
		set_setting(key, value) {
			setting_set_stmt.run({ key, value: JSON.stringify(value ?? null) });
		},
		all_settings() {
			const out = {};
			for (const row of settings_all_stmt.all()) {
				try {
					out[row.key] = JSON.parse(row.value);
				} catch {}
			}
			return out;
		},

		counts() {
			const row = count_stmt.get();
			return {
				total: row.total ?? 0,
				by_kind: { text: row.text ?? 0, link: row.link ?? 0, image: row.image ?? 0, audio: row.audio ?? 0 },
				pending: row.pending ?? 0,
				error: row.error ?? 0
			};
		}
	};

	return store;
}
