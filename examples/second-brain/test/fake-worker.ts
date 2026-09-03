/**
 * Speaks ml/worker.ts's protocol with hash vectors, so the client's spawn, IPC,
 * typed-array transport and crash recovery run for real without a model.
 */

import type { ModelName, WorkerHandlers, WorkerJob, WorkerMessage, WorkerRequest } from '../lib/ml-client.ts';
import { hash_vec } from '../lib/ml-stub.ts';

type Handler = (msg: WorkerJob, id: number) => unknown;

const send = (msg: WorkerMessage) => process.send?.(msg);
const ready = new Set<ModelName>();

const handlers: Omit<WorkerHandlers, 'unload'> = {
	load({ model }) {
		send({ type: 'status', model, state: 'downloading', progress: 50, file: 'fake.onnx' });
		ready.add(model);
		send({ type: 'status', model, state: 'ready', progress: 100 });
		return { model, ms: 1 };
	},
	embedTexts({ texts }, id) {
		if (texts.some((t) => t.includes('__crash__'))) process.exit(1);
		send({ id, type: 'progress', kind: 'embed', done: texts.length });
		const dim = 768;
		const vectors = new Float32Array(dim * texts.length);
		texts.forEach((t, i) => vectors.set(hash_vec(t, dim), i * dim));
		return { dim, count: texts.length, vectors };
	},
	embedQuery({ text }) {
		return { dim: 768, vector: hash_vec(text, 768) };
	},
	transcribe({ path }, id) {
		send({ id, type: 'progress', kind: 'transcribe', done_s: 0.5, total_s: 1, text: 'fake' });
		return { text: `fake transcript of ${path}`, segments: [{ start: 0, end: 1, text: 'fake' }], language: 'en', duration: 1 };
	},
	clipImage({ path }) {
		return { dim: 512, vector: hash_vec(path, 512) };
	},
	clipText({ text }) {
		return { dim: 512, vector: hash_vec(text, 512) };
	}
};

process.on('message', async (msg: WorkerRequest) => {
	if (msg?.type === 'shutdown') process.exit(0);
	try {
		const result = await (handlers[msg.type as keyof typeof handlers] as Handler)(msg, msg.id);
		send({ id: msg.id, ok: true, result });
	} catch (err) {
		send({ id: msg.id, ok: false, error: { message: (err as Error).message, code: 'INFERENCE', transient: false } });
	}
});
process.on('disconnect', () => process.exit(0));

send({ type: 'hello', pid: process.pid, versions: { transformers: 'fake' } });
