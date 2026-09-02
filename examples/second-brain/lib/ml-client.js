/**
 * The models live in a child Bun process: ONNX threads and Whisper's decode loop
 * stay off the frame loop, and a native crash costs one job, not the window.
 */

import { dirname } from 'node:path';
import { on_exit } from './lifecycle.js';
import { log, warn } from './log.js';

export const MODEL_IDS = {
	embed: 'nomic-ai/nomic-embed-text-v1.5',
	whisper: 'onnx-community/whisper-base',
	clip: 'Xenova/clip-vit-base-patch32'
};
export const DIMS = { embed: 768, clip: 512 };
export const MODEL_NAMES = ['embed', 'whisper', 'clip'];

// Measured on this pair of models: nomic scores unrelated text 0.37–0.55 and related
// 0.68+; CLIP scores a matching caption 0.29+ and an unrelated one below 0.23.
export const THRESHOLDS = { vector: 0.56, rag: 0.5, related: 0.6, clip: 0.25, clip_related: 0.75 };

/** @typedef {'unloaded' | 'downloading' | 'loading' | 'ready' | 'error'} ModelState */
/** @typedef {{ state: ModelState, progress: number | null, file: string | null, error: string | null }} ModelStatus */

export class MlError extends Error {
	/** @param {string} message @param {{ code?: string, transient?: boolean, cause?: unknown }} [extra] */
	constructor(message, { code = 'INFERENCE', transient = false, cause } = {}) {
		super(message);
		this.name = 'MlError';
		this.code = code;
		this.transient = transient;
		this.cause = cause;
	}
}

const initial_status = () => ({ state: 'unloaded', progress: null, file: null, error: null });

// Identity today — typed arrays cross Bun IPC — but the one place to switch to base64.
const unpack_vec = (flat, offset, dim) => flat.slice(offset, offset + dim);

export class MlClient {
	#worker_path;
	#models_dir;
	#device;
	#autoload;
	#proc = null;
	#next_id = 1;
	#pending = new Map();
	#queue = { interactive: [], bulk: [] };
	#inflight = 0;
	#exits = [];
	#stopping = false;
	#hello = null;

	status = { embed: initial_status(), whisper: initial_status(), clip: initial_status(), worker: 'down', error: null, memory: null };
	available = true;
	dim = DIMS;
	thresholds = THRESHOLDS;
	/** @type {(status: MlClient['status']) => void} */
	on_status;

	/**
	 * @param {{ worker_path: string, models_dir: string, device?: string | null, autoload?: boolean,
	 *   on_status?: (status: MlClient['status']) => void }} opts
	 */
	constructor({ worker_path, models_dir, device = null, autoload = true, on_status = () => {} }) {
		this.#worker_path = worker_path;
		this.#models_dir = models_dir;
		this.#device = device;
		this.#autoload = autoload;
		this.on_status = on_status;
		on_exit(() => this.stop_sync());
	}

	model_id(model) {
		return MODEL_IDS[model];
	}

	#emit() {
		this.on_status?.(this.status);
	}

	async start() {
		await this.#spawn();
		if (this.#autoload) this.load('embed').catch((err) => warn('embedding model failed to load:', err.message));
	}

	#spawn() {
		this.status.worker = 'starting';
		this.#emit();
		// BUN_BE_BUN makes a compiled app's binary behave as plain `bun`, so the worker
		// runs on the embedded runtime; under a real `bun` the variable does nothing.
		this.#proc = Bun.spawn([process.execPath, this.#worker_path], {
			cwd: dirname(this.#worker_path),
			env: {
				...process.env,
				BUN_BE_BUN: '1',
				GPUIX_BRAIN_MODELS_DIR: this.#models_dir,
				GPUIX_BRAIN_ML: this.#device ?? ''
			},
			stdin: 'ignore',
			stdout: 'inherit',
			stderr: 'inherit',
			ipc: (msg) => this.#receive(msg),
			serialization: 'advanced',
			onExit: (proc, code, signal) => this.#on_exit(proc, code, signal)
		});
		return new Promise((resolve, reject) => {
			this.#hello = { resolve, reject };
		});
	}

	#receive(msg) {
		if (msg.type === 'hello') {
			this.status.worker = 'up';
			this.status.error = null;
			log(`ml worker up (pid ${msg.pid}, ${msg.device}, transformers.js ${msg.versions?.transformers})`);
			this.#hello?.resolve(msg);
			this.#hello = null;
			this.#emit();
			this.#pump();
			return;
		}
		if (msg.type === 'status') {
			this.status[msg.model] = { state: msg.state, progress: msg.progress ?? null, file: msg.file ?? null, error: msg.error ?? null };
			this.#emit();
			return;
		}
		if (msg.type === 'fatal') {
			warn('ml worker fatal:', msg.error?.message);
			return;
		}
		if (msg.type === 'mem') {
			this.status.memory = { rss: msg.rss, heap: msg.heap, at: Date.now() };
			this.#emit();
			return;
		}

		const job = this.#pending.get(msg.id);
		if (!job) return;
		if (msg.type === 'progress') {
			job.on_progress?.(msg);
			return;
		}
		this.#pending.delete(msg.id);
		this.#inflight--;
		if (msg.ok) job.resolve(msg.result);
		else job.reject(new MlError(msg.error?.message ?? 'ml worker error', { code: msg.error?.code, transient: msg.error?.transient }));
		this.#pump();
	}

	#request(type, payload, { lane = 'bulk', on_progress, signal } = {}) {
		return new Promise((resolve, reject) => {
			if (!this.available) return reject(new MlError(this.status.error ?? 'ML worker is down', { code: 'ML_UNAVAILABLE' }));
			const id = this.#next_id++;
			const job = { id, msg: { id, type, ...payload }, resolve, reject, on_progress, lane, sent: false };
			signal?.addEventListener(
				'abort',
				() => {
					if (job.sent) return;
					const at = this.#queue[lane].indexOf(job);
					if (at !== -1) this.#queue[lane].splice(at, 1);
					reject(new MlError('cancelled', { code: 'ABORTED' }));
				},
				{ once: true }
			);
			this.#queue[lane].push(job);
			this.#pump();
		});
	}

	// Interactive jobs go straight out; bulk jobs wait for an empty pipe, so a search
	// query gets ahead of the next embedding batch rather than behind it.
	#pump() {
		if (this.status.worker !== 'up' || !this.#proc) return;
		for (;;) {
			const job = this.#queue.interactive.shift() ?? (this.#inflight === 0 ? this.#queue.bulk.shift() : undefined);
			if (!job) return;
			this.#pending.set(job.id, job);
			this.#inflight++;
			job.sent = true;
			try {
				this.#proc.send(job.msg);
			} catch (err) {
				this.#pending.delete(job.id);
				this.#inflight--;
				job.reject(new MlError(err.message, { code: 'WORKER_CRASHED', transient: true, cause: err }));
			}
		}
	}

	#on_exit(proc, code, signal) {
		if (proc !== this.#proc) return;
		this.#proc = null;
		const message = `ML worker exited (${signal ?? `code ${code}`})`;
		for (const job of this.#pending.values()) job.reject(new MlError(message, { code: 'WORKER_CRASHED', transient: true }));
		this.#pending.clear();
		this.#inflight = 0;
		for (const model of MODEL_NAMES) this.status[model] = initial_status();
		this.status.memory = null;
		if (this.#hello) {
			this.#hello.reject(new MlError(message, { code: 'WORKER_CRASHED', transient: true }));
			this.#hello = null;
		}

		if (this.#stopping) {
			this.status.worker = 'down';
			this.#emit();
			return;
		}

		const now = Date.now();
		this.#exits = this.#exits.filter((t) => now - t < 60_000);
		this.#exits.push(now);
		if (this.#exits.length > 3) {
			this.available = false;
			this.status.worker = 'down';
			this.status.error = 'ML worker keeps crashing (see the terminal); GPUIX_BRAIN_ML=wasm may help';
			for (const lane of Object.values(this.#queue)) {
				for (const job of lane.splice(0)) job.reject(new MlError(this.status.error, { code: 'ML_UNAVAILABLE' }));
			}
			this.#emit();
			return;
		}

		const delay = 1000 * 2 ** (this.#exits.length - 1);
		warn(`${message}; restarting in ${delay / 1000}s`);
		this.status.worker = 'restarting';
		this.#emit();
		setTimeout(() => {
			if (this.#stopping) return;
			this.#spawn()
				.then(() => {
					if (this.#autoload) this.load('embed').catch(() => {});
				})
				.catch(() => {});
		}, delay);
	}

	async restart() {
		this.available = true;
		this.#exits = [];
		this.status.error = null;
		if (this.#proc) {
			this.#stopping = true;
			this.#proc.kill();
			await this.#proc.exited;
			this.#stopping = false;
		}
		await this.start();
	}

	async stop() {
		this.#stopping = true;
		const proc = this.#proc;
		if (!proc) return;
		try {
			proc.send({ type: 'shutdown' });
		} catch {}
		setTimeout(() => proc.kill(), 500);
		await proc.exited;
		this.status.worker = 'down';
		this.#emit();
	}

	stop_sync() {
		this.#stopping = true;
		this.#proc?.kill();
	}

	load(model) {
		return this.#request('load', { model }, { lane: 'interactive' });
	}

	/**
	 * @param {string[]} texts
	 * @param {{ signal?: AbortSignal, batch?: number }} [opts]
	 * @returns {Promise<Float32Array[]>}
	 */
	async embed_texts(texts, { signal, batch = 8 } = {}) {
		const out = [];
		for (let i = 0; i < texts.length; i += batch) {
			const slice = texts.slice(i, i + batch);
			const { dim, vectors } = await this.#request('embedTexts', { texts: slice }, { lane: 'bulk', signal });
			for (let j = 0; j < slice.length; j++) out.push(unpack_vec(vectors, j * dim, dim));
		}
		return out;
	}

	async embed_query(text) {
		const { dim, vector } = await this.#request('embedQuery', { text }, { lane: 'interactive' });
		return unpack_vec(vector, 0, dim);
	}

	/**
	 * @param {string} path 16 kHz mono WAV
	 * @param {{ language?: string | null, on_progress?: (p: any) => void, signal?: AbortSignal }} [opts]
	 * @returns {Promise<{ text: string, segments: Array<{ start: number, end: number, text: string }>, language: string | null, duration: number }>}
	 */
	transcribe(path, { language = null, on_progress, signal } = {}) {
		return this.#request('transcribe', { path, language }, { lane: 'bulk', on_progress, signal });
	}

	async clip_image(path) {
		const { dim, vector } = await this.#request('clipImage', { path }, { lane: 'bulk' });
		return unpack_vec(vector, 0, dim);
	}

	async clip_text(text) {
		const { dim, vector } = await this.#request('clipText', { text }, { lane: 'interactive' });
		return unpack_vec(vector, 0, dim);
	}
}
