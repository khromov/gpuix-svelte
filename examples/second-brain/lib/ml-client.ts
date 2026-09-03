/**
 * The models live in a child Bun process: ONNX threads and Whisper's decode loop
 * stay off the frame loop, and a native crash costs one job, not the window.
 */

import type { Subprocess } from 'bun';
import { dirname } from 'node:path';
import { on_exit } from './lifecycle.ts';
import { log, warn } from './log.ts';

export type ModelName = 'embed' | 'whisper' | 'clip';

export const MODEL_IDS: Record<ModelName, string> = {
	embed: 'nomic-ai/nomic-embed-text-v1.5',
	whisper: 'onnx-community/whisper-base',
	clip: 'Xenova/clip-vit-base-patch32'
};
export const DIMS = { embed: 768, clip: 512 };
export const MODEL_NAMES: ModelName[] = ['embed', 'whisper', 'clip'];

export interface Thresholds {
	vector: number;
	rag: number;
	related: number;
	clip: number;
	clip_related: number;
}

// Measured on this pair of models: nomic scores unrelated text 0.37–0.55 and related
// 0.68+; CLIP scores a matching caption 0.29+ and an unrelated one below 0.23.
export const THRESHOLDS: Thresholds = { vector: 0.56, rag: 0.5, related: 0.6, clip: 0.25, clip_related: 0.75 };

export type ModelState = 'unloaded' | 'downloading' | 'loading' | 'ready' | 'error';
export interface ModelStatus {
	state: ModelState;
	progress: number | null;
	file: string | null;
	error: string | null;
}
export type WorkerState = 'down' | 'starting' | 'up' | 'restarting';
export interface MlStatus {
	embed: ModelStatus;
	whisper: ModelStatus;
	clip: ModelStatus;
	worker: WorkerState;
	error: string | null;
	memory?: { rss: number; heap: number; at: number } | null;
}

export interface TranscribeSegment {
	start: number;
	end: number;
	text: string;
}
export interface TranscribeResult {
	text: string;
	segments: TranscribeSegment[];
	language: string | null;
	duration: number;
}
export interface TranscribeProgress {
	kind: 'transcribe';
	done_s: number;
	total_s: number;
	text: string;
}
export interface EmbedProgress {
	kind: 'embed';
	done: number;
}
export type Progress = TranscribeProgress | EmbedProgress;
export interface TranscribeOptions {
	language?: string | null;
	on_progress?: (p: TranscribeProgress) => void;
	signal?: AbortSignal;
}
export interface EmbedOptions {
	signal?: AbortSignal;
	batch?: number;
}

export interface WorkerPayloads {
	load: { model: ModelName };
	unload: { model: ModelName };
	embedTexts: { texts: string[] };
	embedQuery: { text: string };
	transcribe: { path: string; language: string | null };
	clipImage: { path: string };
	clipText: { text: string };
}
export type JobType = keyof WorkerPayloads;
export type WorkerJob = { [T in JobType]: { id: number; type: T } & WorkerPayloads[T] }[JobType];
/** Parent → worker. */
export type WorkerRequest = WorkerJob | { type: 'shutdown' };

export interface WorkerResults {
	load: { model: ModelName; ms: number };
	unload: { model: ModelName };
	embedTexts: { dim: number; count: number; vectors: Float32Array };
	embedQuery: { dim: number; vector: Float32Array };
	transcribe: TranscribeResult;
	clipImage: { dim: number; vector: Float32Array };
	clipText: { dim: number; vector: Float32Array };
}
export type WorkerHandlers = {
	[T in JobType]: (msg: Extract<WorkerJob, { type: T }>, id: number) => WorkerResults[T] | Promise<WorkerResults[T]>;
};

export interface WorkerError {
	message: string;
	stack?: string;
	code?: string;
	transient?: boolean;
}
export interface HelloMessage {
	type: 'hello';
	pid: number;
	versions: { transformers?: string; bun?: string };
}
export type ProgressMessage = { id: number; type: 'progress' } & (TranscribeProgress | EmbedProgress);

/** Worker → parent; replies carry no `type`, so it is declared absent for narrowing. */
export type WorkerMessage =
	| HelloMessage
	| { type: 'status'; model: ModelName; state: ModelState; progress?: number | null; file?: string | null; error?: string | null }
	| { type: 'fatal'; error: WorkerError }
	| { type: 'mem'; rss: number; heap: number }
	| ProgressMessage
	| { id: number; type?: undefined; ok: true; result: unknown }
	| { id: number; type?: undefined; ok: false; error: WorkerError };

/** What the data layer needs from an ML backend; MlClient and MlStub both provide it. */
export interface MlLike {
	status: MlStatus;
	available: boolean;
	dim: { embed: number; clip: number };
	thresholds: Thresholds;
	on_status: (status: MlStatus) => void;
	model_id(model: ModelName): string;
	start(): Promise<void>;
	stop(): Promise<void>;
	stop_sync(): void;
	restart(): Promise<void>;
	load(model: ModelName): Promise<WorkerResults['load']>;
	embed_texts(texts: string[], opts?: EmbedOptions): Promise<Float32Array[]>;
	embed_query(text: string): Promise<Float32Array>;
	transcribe(path: string, opts?: TranscribeOptions): Promise<TranscribeResult>;
	clip_image(path: string): Promise<Float32Array>;
	clip_text(text: string): Promise<Float32Array>;
}

type Lane = 'interactive' | 'bulk';
interface Job {
	id: number;
	msg: WorkerJob;
	resolve(value: unknown): void;
	reject(reason: Error): void;
	on_progress?(p: Progress): void;
	lane: Lane;
	sent: boolean;
}
interface RequestOptions {
	lane?: Lane;
	on_progress?(p: Progress): void;
	signal?: AbortSignal;
}
type WorkerProcess = Subprocess<'ignore', 'inherit', 'inherit'>;

export class MlError extends Error {
	declare code: string;
	declare transient: boolean;
	constructor(message: string, { code = 'INFERENCE', transient = false, cause }: { code?: string; transient?: boolean; cause?: unknown } = {}) {
		super(message);
		this.name = 'MlError';
		this.code = code;
		this.transient = transient;
		this.cause = cause;
	}
}

const initial_status = (): ModelStatus => ({ state: 'unloaded', progress: null, file: null, error: null });

// Identity today — typed arrays cross Bun IPC — but the one place to switch to base64.
const unpack_vec = (flat: Float32Array, offset: number, dim: number) => flat.slice(offset, offset + dim);

export class MlClient implements MlLike {
	#worker_path: string;
	#models_dir: string;
	#autoload: boolean;
	#proc: WorkerProcess | null = null;
	#next_id = 1;
	#pending = new Map<number, Job>();
	#queue: Record<Lane, Job[]> = { interactive: [], bulk: [] };
	#inflight = 0;
	#exits: number[] = [];
	#stopping = false;
	#hello: { resolve: (msg: HelloMessage) => void; reject: (err: Error) => void } | null = null;

	status: MlStatus = { embed: initial_status(), whisper: initial_status(), clip: initial_status(), worker: 'down', error: null, memory: null };
	available = true;
	dim = DIMS;
	thresholds = THRESHOLDS;
	on_status: (status: MlStatus) => void;

	constructor({
		worker_path,
		models_dir,
		autoload = true,
		on_status = () => {}
	}: {
		worker_path: string;
		models_dir: string;
		autoload?: boolean;
		on_status?: (status: MlStatus) => void;
	}) {
		this.#worker_path = worker_path;
		this.#models_dir = models_dir;
		this.#autoload = autoload;
		this.on_status = on_status;
		on_exit(() => this.stop_sync());
	}

	model_id(model: ModelName) {
		return MODEL_IDS[model];
	}

	#emit() {
		this.on_status?.(this.status);
	}

	async start() {
		await this.#spawn();
		if (this.#autoload) this.load('embed').catch((err: Error) => warn('embedding model failed to load:', err.message));
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
				GPUIX_BRAIN_MODELS_DIR: this.#models_dir
			},
			stdin: 'ignore',
			stdout: 'inherit',
			stderr: 'inherit',
			ipc: (msg: WorkerMessage) => this.#receive(msg),
			serialization: 'advanced',
			onExit: (proc, code, signal) => this.#on_exit(proc, code, signal)
		});
		return new Promise<HelloMessage>((resolve, reject) => {
			this.#hello = { resolve, reject };
		});
	}

	#receive(msg: WorkerMessage) {
		if (msg.type === 'hello') {
			this.status.worker = 'up';
			this.status.error = null;
			log(`ml worker up (pid ${msg.pid}, transformers.js ${msg.versions?.transformers})`);
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

	#request<T extends JobType>(type: T, payload: WorkerPayloads[T], { lane = 'bulk', on_progress, signal }: RequestOptions = {}) {
		return new Promise<WorkerResults[T]>((resolve, reject) => {
			if (!this.available) return reject(new MlError(this.status.error ?? 'ML worker is down', { code: 'ML_UNAVAILABLE' }));
			const id = this.#next_id++;
			const job: Job = { id, msg: { id, type, ...payload } as WorkerJob, resolve, reject, on_progress, lane, sent: false };
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
				job.reject(new MlError((err as Error).message, { code: 'WORKER_CRASHED', transient: true, cause: err }));
			}
		}
	}

	#on_exit(proc: WorkerProcess, code: number | null, signal: number | null) {
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
			this.status.error = 'ML worker keeps crashing (see the terminal); GPUIX_BRAIN_ML=off runs the app without it';
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
		} catch {
			// The channel closes with the worker; the kill below covers it.
		}
		setTimeout(() => proc.kill(), 500);
		await proc.exited;
		this.status.worker = 'down';
		this.#emit();
	}

	stop_sync() {
		this.#stopping = true;
		this.#proc?.kill();
	}

	load(model: ModelName) {
		return this.#request('load', { model }, { lane: 'interactive' });
	}

	async embed_texts(texts: string[], { signal, batch = 8 }: EmbedOptions = {}): Promise<Float32Array[]> {
		const out: Float32Array[] = [];
		for (let i = 0; i < texts.length; i += batch) {
			const slice = texts.slice(i, i + batch);
			const { dim, vectors } = await this.#request('embedTexts', { texts: slice }, { lane: 'bulk', signal });
			for (let j = 0; j < slice.length; j++) out.push(unpack_vec(vectors, j * dim, dim));
		}
		return out;
	}

	async embed_query(text: string) {
		const { dim, vector } = await this.#request('embedQuery', { text }, { lane: 'interactive' });
		return unpack_vec(vector, 0, dim);
	}

	/** `path` is a 16 kHz mono WAV. */
	transcribe(path: string, { language = null, on_progress, signal }: TranscribeOptions = {}): Promise<TranscribeResult> {
		return this.#request('transcribe', { path, language }, { lane: 'bulk', on_progress, signal });
	}

	async clip_image(path: string) {
		const { dim, vector } = await this.#request('clipImage', { path }, { lane: 'bulk' });
		return unpack_vec(vector, 0, dim);
	}

	async clip_text(text: string) {
		const { dim, vector } = await this.#request('clipText', { text }, { lane: 'interactive' });
		return unpack_vec(vector, 0, dim);
	}
}
