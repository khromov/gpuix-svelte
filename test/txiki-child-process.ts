import assert from 'node:assert/strict';
import { spawn } from '../src/txiki/child-process.ts';

const opened: string[] = [];
Object.assign(globalThis, { gpuixHost: { openUrl: (url: string) => opened.push(url) } });
const done = (cmd: string, args: string[]) => new Promise<void>((resolve, reject) => {
	const child = spawn(cmd, args);
	child.on('error', reject);
	child.on('close', code => { assert.equal(code, 0); resolve(); });
	assert.equal(child.unref(), child);
});
await done('open', ['https://example.com/']);
await done('xdg-open', ['http://localhost/test']);
await done('cmd', ['/c', 'start', '', 'https://example.org/']);
assert.deepEqual(opened, ['https://example.com/', 'http://localhost/test', 'https://example.org/']);
await new Promise<void>(resolve => {
	spawn('sh', ['-c', 'echo hello']).on('error', (error: NodeJS.ErrnoException) => { assert.equal(error.code, 'ENOSYS'); resolve(); });
});
await new Promise<void>(resolve => {
	spawn('xdg-open', ['file:///tmp/x']).on('error', (error: NodeJS.ErrnoException) => { assert.equal(error.code, 'ENOSYS'); resolve(); });
});
console.log('txiki-child-process ok');
