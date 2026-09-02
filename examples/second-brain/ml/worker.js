/**
 * The ML child process: stateless compute over transformers.js. It reads audio and
 * image files by path and returns Float32Arrays; the database is the parent's.
 */

import { decode_wav } from '../lib/wav.js';

const send = (msg) => process.send?.(msg);
const status = (model, state, extra = {}) => send({ type: 'status', model, state, ...extra });

const MODELS = {
	embed: 'nomic-ai/nomic-embed-text-v1.5',
	whisper: 'onnx-community/whisper-base',
	clip: 'Xenova/clip-vit-base-patch32'
};

const tf = await import('@huggingface/transformers');
const { env, pipeline, AutoProcessor, AutoTokenizer, RawImage, CLIPVisionModelWithProjection, CLIPTextModelWithProjection, WhisperTextStreamer } = tf;

env.cacheDir = process.env.GPUIX_BRAIN_MODELS_DIR || new URL('../.data/models/', import.meta.url).pathname;
env.allowLocalModels = false;
env.allowRemoteModels = process.env.GPUIX_BRAIN_OFFLINE !== '1';
env.logLevel = 40;

const device = process.env.GPUIX_BRAIN_ML === 'wasm' ? 'wasm' : undefined;
// ORT-web's threaded workers are the fragile part under Bun; one thread is the safe fallback.
if (device === 'wasm' && env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
const threads = Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)));

const loaded = {};
const loading = {};
const last_used = {};
const IDLE_UNLOAD_MS = 5 * 60_000;

function progress_for(model) {
	const files = new Map();
	return (p) => {
		if (!p.file || (p.status !== 'progress' && p.status !== 'done')) return;
		files.set(p.file, { loaded: p.status === 'done' ? (p.total ?? p.loaded ?? 0) : (p.loaded ?? 0), total: p.total ?? 0 });
		let done = 0;
		let total = 0;
		for (const f of files.values()) {
			done += f.loaded;
			total += f.total;
		}
		// Cached files report progress too; only a partial file is a real download.
		if (p.status === 'progress' && (p.loaded ?? 0) < (p.total ?? 0)) {
			status(model, 'downloading', { progress: total > 0 ? Math.min(100, (done / total) * 100) : null, file: p.file });
		}
	};
}

async function load(model) {
	const progress_callback = progress_for(model);
	// No memory arena: ORT would otherwise keep the largest batch's working set forever.
	const opts = { dtype: 'q8', device, progress_callback, session_options: { intraOpNumThreads: threads, enableCpuMemArena: false } };
	if (model === 'embed') return { extractor: await pipeline('feature-extraction', MODELS.embed, opts) };
	if (model === 'whisper') return { asr: await pipeline('automatic-speech-recognition', MODELS.whisper, opts) };
	if (model === 'clip') {
		const [processor, vision, tokenizer, text] = await Promise.all([
			AutoProcessor.from_pretrained(MODELS.clip, { progress_callback }),
			CLIPVisionModelWithProjection.from_pretrained(MODELS.clip, opts),
			AutoTokenizer.from_pretrained(MODELS.clip, { progress_callback }),
			CLIPTextModelWithProjection.from_pretrained(MODELS.clip, opts)
		]);
		return { processor, vision, tokenizer, text };
	}
	throw new Error(`unknown model ${model}`);
}

function ensure(model) {
	last_used[model] = Date.now();
	if (loaded[model]) return Promise.resolve(loaded[model]);
	if (!loading[model]) {
		status(model, 'loading');
		loading[model] = load(model).then(
			(m) => {
				loaded[model] = m;
				status(model, 'ready', { progress: 100 });
				return m;
			},
			(err) => {
				loading[model] = null;
				status(model, 'error', { error: err.message });
				throw Object.assign(err, { code: 'MODEL_LOAD', transient: /fetch|network|ECONN|timed out/i.test(err.message) });
			}
		);
	}
	return loading[model];
}

const unit = (data) => {
	const vec = Float32Array.from(data);
	let sum = 0;
	for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
	const norm = Math.sqrt(sum) || 1;
	for (let i = 0; i < vec.length; i++) vec[i] /= norm;
	return vec;
};

async function unload(model) {
	const m = loaded[model];
	delete loaded[model];
	loading[model] = null;
	for (const part of Object.values(m ?? {})) await part?.dispose?.();
	status(model, 'unloaded');
	return { model };
}

const handlers = {
	async load({ model }) {
		const started = performance.now();
		await ensure(model);
		return { model, ms: Math.round(performance.now() - started) };
	},

	unload: ({ model }) => unload(model),

	async embedTexts({ texts }) {
		const { extractor } = await ensure('embed');
		const out = await extractor(texts.map((t) => `search_document: ${t}`), { pooling: 'mean', normalize: true });
		return { dim: out.dims[1], count: out.dims[0], vectors: Float32Array.from(out.data) };
	},

	async embedQuery({ text }) {
		const { extractor } = await ensure('embed');
		const out = await extractor([`search_query: ${text}`], { pooling: 'mean', normalize: true });
		return { dim: out.dims[1], vector: Float32Array.from(out.data) };
	},

	async transcribe({ path, language }, id) {
		const { asr } = await ensure('whisper');
		const { samples, duration } = decode_wav(await Bun.file(path).bytes());
		let done_s = 0;
		let partial = '';
		const streamer =
			typeof WhisperTextStreamer === 'function'
				? new WhisperTextStreamer(asr.tokenizer, {
						skip_prompt: true,
						on_chunk_start: (t) => {
							done_s = t;
						},
						callback_function: (text) => {
							partial += text;
							send({ id, type: 'progress', kind: 'transcribe', done_s, total_s: duration, text: partial });
						}
					})
				: undefined;
		const out = await asr(samples, {
			chunk_length_s: 30,
			stride_length_s: 5,
			return_timestamps: true,
			language: language || undefined,
			task: 'transcribe',
			streamer
		});
		const segments = (out.chunks ?? []).map((c) => ({
			start: c.timestamp?.[0] ?? 0,
			end: c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0,
			text: (c.text ?? '').trim()
		}));
		return { text: (out.text ?? '').trim(), segments, language: language ?? null, duration };
	},

	async clipImage({ path }) {
		const { processor, vision } = await ensure('clip');
		const image = await RawImage.read(path);
		const { image_embeds } = await vision(await processor(image));
		return { dim: image_embeds.dims[1], vector: unit(image_embeds.data) };
	},

	async clipText({ text }) {
		const { processor, tokenizer, text: model } = await ensure('clip');
		void processor;
		const { text_embeds } = await model(tokenizer([text], { padding: true, truncation: true }));
		return { dim: text_embeds.dims[1], vector: unit(text_embeds.data) };
	}
};

const queue = [];
let running = false;

async function drain() {
	if (running) return;
	running = true;
	while (queue.length) {
		const msg = queue.shift();
		const handler = handlers[msg.type];
		try {
			if (!handler) throw Object.assign(new Error(`unknown request ${msg.type}`), { code: 'BAD_INPUT' });
			const result = await handler(msg, msg.id);
			send({ id: msg.id, ok: true, result });
		} catch (err) {
			send({
				id: msg.id,
				ok: false,
				error: { message: err?.message ?? String(err), stack: err?.stack, code: err?.code ?? 'INFERENCE', transient: err?.transient ?? false }
			});
		}
	}
	running = false;
}

process.on('message', (msg) => {
	if (msg?.type === 'shutdown') process.exit(0);
	queue.push(msg);
	drain();
});
process.on('disconnect', () => process.exit(0));

// An orphan is reparented to pid 1 — 'disconnect' is not always delivered, and a
// worker with three models loaded must not outlive its window. Whisper and CLIP are
// dropped after a quiet spell; the embedder stays, since every search needs it.
setInterval(() => {
	if (process.ppid === 1) process.exit(0);
	const mem = process.memoryUsage();
	send({ type: 'mem', rss: mem.rss, heap: mem.heapUsed });
	if (running) return;
	for (const model of ['whisper', 'clip']) {
		if (loaded[model] && Date.now() - (last_used[model] ?? 0) > IDLE_UNLOAD_MS) unload(model);
	}
}, 10_000);
process.on('uncaughtException', (err) => {
	send({ type: 'fatal', error: { message: err.message, stack: err.stack } });
	process.exit(1);
});
process.on('unhandledRejection', (err) => {
	send({ type: 'fatal', error: { message: err?.message ?? String(err), stack: err?.stack } });
	process.exit(1);
});

send({ type: 'hello', pid: process.pid, versions: { transformers: env.version, bun: Bun.version }, device: device ?? 'native' });
