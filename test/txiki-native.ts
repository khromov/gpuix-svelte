import assert from 'node:assert/strict';

const calls: { method: string; args: unknown[] }[] = [];
let polls = 0;
globalThis.__gpuixCall = (request) => {
	const call = JSON.parse(request) as { method: string; args: unknown[] };
	calls.push(call);
	if (call.method === 'readClipboardText') return JSON.stringify({ value: 'copied' });
	if (call.method === 'applyBatch' || (call.method === 'finishUpload' && call.args[1] === 'batch')) return JSON.stringify({ value: [42] });
	if (call.method === 'finishUpload' && call.args[1] === 'font') return JSON.stringify({ error: 'invalid font' });
	if (call.method === 'pollPrompt') return JSON.stringify({ value: ++polls === 1 ? { done: false } : { done: true, value: ['/tmp/file'] } });
	return JSON.stringify({ value: null });
};
const { GpuixRenderer } = await import('../src/txiki-native.ts');
const renderer = new GpuixRenderer(() => {});
renderer.init({ autoInsets: false });
assert.deepEqual(calls.splice(0), [{ method: 'setAutoInsets', args: [false] }, { method: 'init', args: [{ autoInsets: false }] }]);
renderer.setImage(4, new Uint8Array([0, 127, 255]));
renderer.setImagePixels(5, 1, 1, new Uint8Array([1, 2, 3, 255]));
assert.throws(() => renderer.registerFont(new Uint8Array([0])), /invalid font/);
const host = (globalThis as unknown as { gpuixHost: { openUrl(url: string): void; readClipboardText(): string | null; writeClipboardText(text: string): void } }).gpuixHost;
host.openUrl('https://example.com');
host.writeClipboardText('copied');
assert.equal(host.readClipboardText(), 'copied');
assert.deepEqual(await renderer.promptForPaths({ files: true }), ['/tmp/file']);
assert.deepEqual(calls, [
	{ method: 'beginUpload', args: [1, 3] },
	{ method: 'uploadChunk', args: [1, [0, 127, 255]] },
	{ method: 'finishUpload', args: [1, 'image', 4] },
	{ method: 'beginUpload', args: [2, 4] },
	{ method: 'uploadChunk', args: [2, [1, 2, 3, 255]] },
	{ method: 'finishUpload', args: [2, 'pixels', 5, 1, 1, null] },
	{ method: 'beginUpload', args: [3, 1] },
	{ method: 'uploadChunk', args: [3, [0]] },
	{ method: 'finishUpload', args: [3, 'font'] },
	{ method: 'cancelUpload', args: [3] },
	{ method: 'openUrl', args: ['https://example.com'] },
	{ method: 'writeClipboardText', args: ['copied'] },
	{ method: 'readClipboardText', args: [] },
	{ method: 'beginPrompt', args: [1, { files: true }] },
	{ method: 'pollPrompt', args: [1] },
	{ method: 'pollPrompt', args: [1] }
]);
calls.length = 0;
assert.deepEqual(renderer.applyBatch('[]'), [42]);
assert.equal(calls[0]?.method, 'applyBatch');
calls.length = 0;
const batch = JSON.stringify([['setText', 1, 'x'.repeat(2 * 1024 * 1024)]]);
assert.deepEqual(renderer.applyBatch(batch), [42]);
assert.equal(calls[0]?.method, 'beginUpload');
assert.equal(calls.at(-1)?.method, 'finishUpload');
assert.equal(calls.at(-1)?.args[1], 'batch');
assert.equal(calls.filter(call => call.method === 'uploadChunk').flatMap(call => call.args[1] as number[]).length, new TextEncoder().encode(batch).length);
console.log('txiki-native ok');
