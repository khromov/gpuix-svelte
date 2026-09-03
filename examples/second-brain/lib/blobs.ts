/**
 * Every byte the app owns lives in the `blobs` table; the database is the master copy.
 * GPUI's `<img src>`, afplay, ffmpeg and the ML worker all want a real path, so a blob is
 * written into `<data-dir>/cache/` the first time one is asked for. The cache is
 * disposable — deleting it costs one re-extract — which is what makes the .sqlite file
 * movable on its own.
 */

import type { Database } from 'bun:sqlite';
import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from './log.ts';
import { cache_path, type DataDirs } from './paths.ts';

export type BlobRole = 'original' | 'display' | 'thumb' | 'pcm';

export interface BlobInfo {
	id: number;
	item_id: number;
	role: BlobRole;
	ext: string;
	size: number;
}
export type BlobRecord = BlobInfo & { bytes: Uint8Array };

/** bun:sqlite materialises a whole blob in memory, so a stray video should fail loudly. */
export const MAX_BLOB_BYTES = 64 * 1024 * 1024;

const INFO_COLS = 'id, item_id, role, ext, size';

type Param = string | number | bigint | boolean | null | Uint8Array;
type Params = Record<string, Param>;

export type Blobs = ReturnType<typeof create_blobs>;

export function create_blobs(db: Database, dirs: DataDirs) {
	const q = <Row>(sql: string) => db.query<Row, Params[]>(sql);

	const insert_stmt = q<never>(
		`INSERT INTO blobs (item_id, role, ext, size, bytes, created_at) VALUES ($item_id, $role, $ext, $size, $bytes, $now)`
	);
	const info_stmt = q<BlobInfo>(`SELECT ${INFO_COLS} FROM blobs WHERE id = $id`);
	const record_stmt = q<BlobRecord>(`SELECT ${INFO_COLS}, bytes FROM blobs WHERE id = $id`);
	const bytes_stmt = q<{ bytes: Uint8Array }>(`SELECT bytes FROM blobs WHERE id = $id`);
	const by_role_stmt = q<BlobInfo>(`SELECT ${INFO_COLS} FROM blobs WHERE item_id = $item_id AND role = $role`);
	const of_item_stmt = q<BlobInfo>(`SELECT ${INFO_COLS} FROM blobs WHERE item_id = $item_id`);
	const delete_stmt = q<never>(`DELETE FROM blobs WHERE id = $id`);
	const all_ids_stmt = q<{ id: number }>(`SELECT id FROM blobs`);

	/** Materialised paths, so a repeat call costs no query at all. */
	const materialised = new Map<number, string>();

	const normalize_ext = (ext: string) => String(ext ?? '').replace(/^\./, '').toLowerCase() || 'bin';

	function unlink_cached(ids: Set<number>) {
		if (!ids.size) return;
		for (const id of ids) materialised.delete(id);
		let entries: string[];
		try {
			entries = readdirSync(dirs.cache);
		} catch {
			return;
		}
		// By name rather than by remembered path: a file this process never materialised
		// (an earlier run, a different ext) still has to go.
		for (const name of entries) {
			const id = Number(name.slice(0, name.indexOf('.')));
			if (!ids.has(id)) continue;
			try {
				unlinkSync(join(dirs.cache, name));
			} catch (err) {
				warn(`could not remove cached ${name}:`, (err as Error).message);
			}
		}
	}

	const blobs = {
		/** Replaces any blob this item already has in `role`; the new row gets a new id. */
		put(item_id: number, role: BlobRole, bytes: Uint8Array, ext: string): number {
			if (!bytes?.length) throw new Error(`refusing to store an empty ${role} blob`);
			if (bytes.length > MAX_BLOB_BYTES) {
				throw Object.assign(new Error(`${(bytes.length / 1e6).toFixed(1)} MB is over the ${MAX_BLOB_BYTES / 1e6} MB limit for one file`), {
					transient: false
				});
			}
			const replaced = by_role_stmt.get({ item_id, role })?.id ?? null;
			const id = db.transaction(() => {
				if (replaced !== null) delete_stmt.run({ id: replaced });
				const { lastInsertRowid } = insert_stmt.run({
					item_id,
					role,
					ext: normalize_ext(ext),
					size: bytes.length,
					bytes,
					now: Date.now()
				});
				return Number(lastInsertRowid);
			})();
			if (replaced !== null) unlink_cached(new Set([replaced]));
			return id;
		},

		info: (id: number): BlobInfo | null => info_stmt.get({ id }) ?? null,
		get: (id: number): BlobRecord | null => record_stmt.get({ id }) ?? null,
		bytes: (id: number | null | undefined): Uint8Array | null => (id == null ? null : (bytes_stmt.get({ id })?.bytes ?? null)),
		of_item: (item_id: number): BlobInfo[] => of_item_stmt.all({ item_id }),

		drop(id: number | null | undefined) {
			if (id == null) return;
			delete_stmt.run({ id });
			unlink_cached(new Set([id]));
		},

		/**
		 * Synchronous because `<img src={...}>` is evaluated during render — bun:sqlite and
		 * writeFileSync both are, so no async plumbing reaches the components.
		 */
		file(id: number | null | undefined): string | undefined {
			if (id == null) return undefined;
			const hit = materialised.get(id);
			if (hit) return hit;
			const info = info_stmt.get({ id });
			if (!info) return undefined;
			const path = cache_path(dirs, info.id, info.ext);
			try {
				if (!existsSync(path) || statSync(path).size !== info.size) {
					const bytes = bytes_stmt.get({ id })?.bytes;
					if (!bytes) return undefined;
					writeFileSync(path, bytes);
				}
			} catch (err) {
				warn(`could not cache blob ${id}:`, (err as Error).message);
				return undefined;
			}
			materialised.set(id, path);
			return path;
		},

		forget: (ids: Array<number | null | undefined>) => unlink_cached(new Set(ids.filter((id): id is number => id != null))),

		/** Cached files whose blob is gone — a delete from another process, or a crash mid-write. */
		prune_cache() {
			let entries: string[];
			try {
				entries = readdirSync(dirs.cache);
			} catch {
				return 0;
			}
			const live = new Set(all_ids_stmt.all().map((r) => r.id));
			let removed = 0;
			for (const name of entries) {
				const id = Number(name.slice(0, name.indexOf('.')));
				if (Number.isInteger(id) && live.has(id)) continue;
				try {
					unlinkSync(join(dirs.cache, name));
					removed++;
				} catch (err) {
					warn(`could not prune cached ${name}:`, (err as Error).message);
				}
			}
			return removed;
		}
	};

	return blobs;
}
