/**
 * The whole vector store: unit vectors in one flat Float32Array, scanned with a dot
 * product. This is the seam to replace with PGlite + pgvector if a corpus ever
 * outgrows a brute-force scan — nothing outside this file knows vectors live in memory.
 */

export class VectorIndex {
	#dim;
	#data;
	#ids;
	#groups;
	#rows = new Map();
	#size = 0;

	/** @param {number} dim @param {number} [capacity] */
	constructor(dim, capacity = 1024) {
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

	/** @param {Iterable<{ id: number, group: number, embedding: Uint8Array }>} rows */
	load(rows) {
		for (const row of rows) this.add(row.id, row.group, from_blob(row.embedding, this.#dim));
	}

	has(id) {
		return this.#rows.has(id);
	}

	/** Upsert. @param {number} id @param {number} group @param {Float32Array} vec unit length */
	add(id, group, vec) {
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

	/** Swap-remove, so every removal is O(dim). @param {Iterable<number>} ids */
	remove(ids) {
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

	remove_group(group) {
		const ids = [];
		for (let r = 0; r < this.#size; r++) if (this.#groups[r] === group) ids.push(this.#ids[r]);
		this.remove(ids);
	}

	/**
	 * @param {Float32Array} query unit length
	 * @param {number} k
	 * @param {{ min_score?: number, exclude_group?: number | null, filter?: ((group: number) => boolean) | null }} [opts]
	 * @returns {Array<{ id: number, group: number, score: number }>}
	 */
	top_k(query, k, { min_score = -1, exclude_group = null, filter = null } = {}) {
		const dim = this.#dim;
		const data = this.#data;
		const hits = [];
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

	/** Mean of a group's rows, renormalised. @returns {Float32Array | null} */
	centroid(group) {
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

/** @param {Float32Array} vec */
export function to_blob(vec) {
	return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

/** @param {Uint8Array} u8 @param {number} dim */
export function from_blob(u8, dim) {
	if (u8.byteLength < dim * 4) throw new Error(`embedding blob too short for ${dim} floats`);
	// A Float32Array view needs 4-byte alignment; a BLOB handed back by SQLite may not have it.
	if (u8.byteOffset % 4 !== 0) u8 = u8.slice();
	return new Float32Array(u8.buffer, u8.byteOffset, dim);
}

/** In place. @param {Float32Array} vec */
export function normalize(vec) {
	let sum = 0;
	for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
	const norm = Math.sqrt(sum) || 1;
	for (let i = 0; i < vec.length; i++) vec[i] /= norm;
	return vec;
}
