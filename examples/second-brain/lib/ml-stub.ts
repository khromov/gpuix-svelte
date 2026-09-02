/**
 * The same surface as MlClient with deterministic hash vectors, so tests and
 * screenshot runs never touch a model, and the app still opens when the ML
 * dependencies are missing.
 */

import { basename } from 'node:path';
import { DIMS, MODEL_IDS, MODEL_NAMES, MlError } from './ml-client.ts';
import type { MlLike, MlStatus, ModelName, ModelState, ModelStatus, Thresholds, TranscribeOptions, TranscribeResult, WorkerResults } from './ml-client.ts';
import { normalize } from './vectors.ts';

export function hash_vec(text: string, dim: number): Float32Array {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	let x = h || 1;
	const vec = new Float32Array(dim);
	for (let i = 0; i < dim; i++) {
		x ^= x << 13;
		x >>>= 0;
		x ^= x >>> 17;
		x ^= x << 5;
		x >>>= 0;
		vec[i] = x / 4294967296 - 0.5;
	}
	return normalize(vec);
}

/** Text embeddings share tokens, so similar sentences get similar vectors. */
function bag_vec(text: string, dim: number): Float32Array {
	const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
	if (!words.length) return hash_vec(text, dim);
	const sum = new Float32Array(dim);
	for (const word of words) {
		const v = hash_vec(word, dim);
		for (let i = 0; i < dim; i++) sum[i] += v[i];
	}
	return normalize(sum);
}

const status_of = (state: ModelState): ModelStatus => ({ state, progress: state === 'ready' ? 100 : null, file: null, error: null });

export class MlStub implements MlLike {
	#failures = new Map<string, { transient: boolean; message: string }>();
	#latency: number;

	status: MlStatus;
	available: boolean;
	reason: string | null;
	dim = DIMS;
	// Bag-of-words cosines run lower than a real model's.
	thresholds: Thresholds = { vector: 0.3, rag: 0.3, related: 0.3, clip: 0.2, clip_related: 0.5 };
	on_status: (status: MlStatus) => void;

	constructor({
		available = true,
		reason = null,
		latency = 0,
		on_status = () => {}
	}: { available?: boolean; reason?: string | null; latency?: number; on_status?: (s: MlStatus) => void } = {}) {
		this.available = available;
		this.reason = reason;
		this.#latency = latency;
		this.on_status = on_status;
		const state = available ? 'ready' : 'error';
		this.status = {
			embed: { ...status_of(state), error: reason },
			whisper: { ...status_of(state), error: reason },
			clip: { ...status_of(state), error: reason },
			worker: available ? 'up' : 'down',
			error: reason
		};
	}

	model_id(model: ModelName) {
		return `${MODEL_IDS[model]}#stub`;
	}

	async start() {
		this.on_status?.(this.status);
	}
	async stop() {}
	stop_sync() {}
	async restart() {
		this.on_status?.(this.status);
	}

	fail_next(kind: string, { transient = false, message = `stub ${kind} failure` }: { transient?: boolean; message?: string } = {}) {
		this.#failures.set(kind, { transient, message });
	}

	async #run<T>(kind: string, fn: () => T): Promise<T> {
		if (!this.available) throw new MlError(this.reason ?? 'ML unavailable', { code: 'ML_UNAVAILABLE' });
		const failure = this.#failures.get(kind);
		if (failure) {
			this.#failures.delete(kind);
			throw new MlError(failure.message, { code: 'INFERENCE', transient: failure.transient });
		}
		if (this.#latency) await new Promise((r) => setTimeout(r, this.#latency));
		return fn();
	}

	load(model: ModelName): Promise<WorkerResults['load']> {
		return this.#run('load', () => {
			this.status[model] = status_of('ready');
			this.on_status?.(this.status);
			return { model, ms: 0 };
		});
	}

	embed_texts(texts: string[]) {
		return this.#run('embed', () => texts.map((t) => bag_vec(t, DIMS.embed)));
	}

	embed_query(text: string) {
		return this.#run('embed', () => bag_vec(text, DIMS.embed));
	}

	transcribe(path: string, { on_progress }: TranscribeOptions = {}): Promise<TranscribeResult> {
		return this.#run('transcribe', () => {
			const text = `Stub transcript of ${basename(path)}.`;
			on_progress?.({ kind: 'transcribe', done_s: 1, total_s: 1, text });
			return { text, segments: [{ start: 0, end: 1, text }], language: 'en', duration: 1 };
		});
	}

	clip_image(path: string) {
		return this.#run('clip', () => hash_vec(basename(path), DIMS.clip));
	}

	/** Hashes the whole query, so searching an image's file name finds it exactly. */
	clip_text(text: string) {
		return this.#run('clip', () => hash_vec(text.trim(), DIMS.clip));
	}
}

export { MODEL_NAMES };
