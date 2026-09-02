/**
 * The whole vector store: unit vectors in one flat Float32Array, scanned with a dot
 * product. This is the seam to replace with PGlite + pgvector if a corpus ever
 * outgrows a brute-force scan — nothing outside this file knows vectors live in memory.
 */

export interface VectorRow {
	id: number;
	group: number;
	embedding: Uint8Array;
}

export interface VectorHit {
	id: number;
	group: number;
	score: number;
}

export interface TopKOptions {
	min_score?: number;
	exclude_group?: number | null;
	filter?: ((group: number) => boolean) | null;
}

export class VectorIndex {
	#dim: number;
	#data: Float32Array;
	#ids: Int32Array;
	#groups: Int32Array;
	#rows = new Map<number, number>();
	#size = 0;

	constructor(dim: number, capacity = 1024) {
		this.#dim = dim;
		this.#data = new Float32Array(dim * capacity);
		this.#ids = new Int32Array(capacity);
		this.#groups = new Int32Array(capacity);
	}

	get size() {
		return this.#size;
	}

	get dim() {
		return this.#dim;
	}

	#grow() {
		const capacity = this.#ids.length * 2;
		const data = new Float32Array(this.#dim * capacity);
		data.set(this.#data);
		this.#data = data;
		const ids = new Int32Array(capacity);
		ids.set(this.#ids);
		this.#ids = ids;
		const groups = new Int32Array(capacity);
		groups.set(this.#groups);
		this.#groups = groups;
	}

	load(rows: Iterable<VectorRow>) {
		for (const row of rows) this.add(row.id, row.group, from_blob(row.embedding, this.#dim));
	}

	has(id: number) {
		return this.#rows.has(id);
	}

	/** Upsert; `vec` must be unit length. */
	add(id: number, group: number, vec: Float32Array) {
		if (vec.length !== this.#dim) throw new Error(`expected a ${this.#dim}-d vector, got ${vec.length}`);
		let row = this.#rows.get(id);
		if (row === undefined) {
			if (this.#size === this.#ids.length) this.#grow();
			row = this.#size++;
			this.#rows.set(id, row);
		}
		this.#data.set(vec, row * this.#dim);
		this.#ids[row] = id;
		this.#groups[row] = group;
	}

	/** Swap-remove, so every removal is O(dim). */
	remove(ids: Iterable<number>) {
		const dim = this.#dim;
		for (const id of ids) {
			const row = this.#rows.get(id);
			if (row === undefined) continue;
			const last = this.#size - 1;
			if (row !== last) {
				this.#data.copyWithin(row * dim, last * dim, (last + 1) * dim);
				this.#ids[row] = this.#ids[last];
				this.#groups[row] = this.#groups[last];
				this.#rows.set(this.#ids[row], row);
			}
			this.#rows.delete(id);
			this.#size--;
		}
	}

	remove_group(group: number) {
		const ids: number[] = [];
		for (let r = 0; r < this.#size; r++) if (this.#groups[r] === group) ids.push(this.#ids[r]);
		this.remove(ids);
	}

	/** `query` must be unit length. */
	top_k(query: Float32Array, k: number, { min_score = -1, exclude_group = null, filter = null }: TopKOptions = {}): VectorHit[] {
		const dim = this.#dim;
		const data = this.#data;
		const hits: VectorHit[] = [];
		for (let r = 0; r < this.#size; r++) {
			const group = this.#groups[r];
			if (group === exclude_group || (filter && !filter(group))) continue;
			let dot = 0;
			const at = r * dim;
			for (let i = 0; i < dim; i++) dot += data[at + i] * query[i];
			if (dot >= min_score) hits.push({ id: this.#ids[r], group, score: dot });
		}
		hits.sort((a, b) => b.score - a.score);
		return hits.slice(0, k);
	}

	/** Mean of a group's rows, renormalised. */
	centroid(group: number): Float32Array | null {
		const dim = this.#dim;
		const sum = new Float32Array(dim);
		let n = 0;
		for (let r = 0; r < this.#size; r++) {
			if (this.#groups[r] !== group) continue;
			const at = r * dim;
			for (let i = 0; i < dim; i++) sum[i] += this.#data[at + i];
			n++;
		}
		return n === 0 ? null : normalize(sum);
	}
}

export function to_blob(vec: Float32Array): Uint8Array {
	return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function from_blob(u8: Uint8Array, dim: number): Float32Array {
	if (u8.byteLength < dim * 4) throw new Error(`embedding blob too short for ${dim} floats`);
	// A Float32Array view needs 4-byte alignment; a BLOB handed back by SQLite may not have it.
	if (u8.byteOffset % 4 !== 0) u8 = u8.slice();
	return new Float32Array(u8.buffer, u8.byteOffset, dim);
}

/** In place. */
export function normalize(vec: Float32Array): Float32Array {
	let sum = 0;
	for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
	const norm = Math.sqrt(sum) || 1;
	for (let i = 0; i < vec.length; i++) vec[i] /= norm;
	return vec;
}
