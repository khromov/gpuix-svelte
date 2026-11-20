import assert from 'node:assert/strict';
import { resolve } from 'node:path';

interface Operation { op: string; path: string; dest?: string; [key: string]: unknown }
const calls: Operation[] = [];
const jobs = new Map<number, Operation>();
const methods: string[] = [];
let reads = 0;
function perform(op: Operation): string {
	calls.push(op);
	if (op.path.endsWith('/missing')) return JSON.stringify({ error: { code: 'ENOENT', message: 'missing' } });
	let value: unknown = null;
	if (op.op === 'read') { reads++; value = [...new TextEncoder().encode('hello')]; }
	if (op.op === 'mkdtemp') value = [...Buffer.from(`${op.path}ABC123`)];
	if (op.op === 'readdir') {
		const names = ['file.txt', 'dir', 'link'].map(name => [...Buffer.from(name)]);
		value = op.withFileTypes ? names.map((name, index) => ({ name, kind: ['file', 'directory', 'symlink'][index] })) : names;
	}
	if (op.op === 'stat') value = { kind: 'file', size: 5, mtimeMs: 1000, atimeMs: 2000, ctimeMs: 3000, birthtimeMs: 0, mode: 0o100644 };
	return JSON.stringify({ value });
}
globalThis.__gpuixCall = request => {
	const { method, args } = JSON.parse(request);
	methods.push(method);
	if (method === 'fs') return JSON.stringify({ value: perform(args[0]) });
	if (method === 'beginFs') {
		if (jobs.size >= 16) return JSON.stringify({ error: 'Too many pending filesystem jobs' });
		jobs.set(args[0], args[1]); return JSON.stringify({ value: null });
	}
	if (method === 'pollFs') {
		const op = jobs.get(args[0])!;
		jobs.delete(args[0]);
		return JSON.stringify({ value: { done: true, value: perform(op) } });
	}
	throw new Error(`Unexpected method ${method}`);
};
const fs = await import('../src/txiki/fs.ts');
fs.renameSync('from', 'nested/to');
fs.copyFileSync('/absolute/source', 'copy');
fs.renameSync(new URL('file:///tmp/with%20space'), new URL('file:///tmp/target'));
assert.throws(() => fs.accessSync(new URL('https://example.com/file')), /local file URL/);
assert.throws(() => fs.accessSync(new URL('file:///tmp/a%2fb')), /local file URL/);
assert.deepEqual(calls.slice(), [
	{ op: 'rename', path: resolve('from'), dest: resolve('nested/to') },
	{ op: 'copy', path: '/absolute/source', dest: resolve('copy'), exclusive: false },
	{ op: 'rename', path: '/tmp/with space', dest: '/tmp/target' }
]);
const bytes = fs.readFileSync('file');
assert.ok(Buffer.isBuffer(bytes));
assert.equal(bytes.toString('base64'), 'aGVsbG8=');
assert.equal(fs.readFileSync('file', 'hex'), '68656c6c6f');
assert.equal(fs.readFileSync('file', { encoding: 'utf8', flag: 'r' }), 'hello');
fs.writeFileSync('file', 'aGVsbG8=', 'base64');
assert.deepEqual(calls.at(-1)?.data, [104, 101, 108, 108, 111]);
fs.writeFileSync('file', new Uint8Array(65537), { flag: 'wx', mode: 0o600 });
assert.deepEqual(calls.slice(-2).map(op => [op.flag, op.offset, op.mode, (op.data as number[]).length]), [['wx', 0, 0o600, 65536], ['wx', 65536, 0o600, 1]]);
fs.writeFileSync('file', 'x', { flag: 'wx+' });
assert.equal(calls.at(-1)?.flag, 'wx+');
assert.throws(() => fs.writeFileSync('file', 'x', { flag: 'invalid' }), /Unsupported writeFile flag/);
const entries = fs.readdirSync('dir', { withFileTypes: true });
assert.deepEqual(entries.map(e => typeof e !== 'string' && !Buffer.isBuffer(e) && [e.name, e.parentPath, e.isFile(), e.isDirectory(), e.isSymbolicLink()]), [['file.txt', 'dir', true, false, false], ['dir', 'dir', false, true, false], ['link', 'dir', false, false, true]]);
assert.deepEqual(fs.readdirSync('dir'), ['file.txt', 'dir', 'link']);
assert.deepEqual(fs.readdirSync('dir', 'hex'), ['66696c652e747874', '646972', '6c696e6b']);
const buffers = fs.readdirSync('dir', 'buffer');
assert.ok(buffers.every(Buffer.isBuffer));
assert.deepEqual(buffers.map(String), ['file.txt', 'dir', 'link']);
const bufferEntries = fs.readdirSync('dir', { encoding: 'buffer', withFileTypes: true });
assert.ok(bufferEntries.every(entry => typeof entry === 'object' && !Buffer.isBuffer(entry) && Buffer.isBuffer(entry.name)));
assert.throws(() => fs.readFileSync('file', 'buffer'), /Unsupported encoding/);
const stat = fs.statSync('file');
assert.ok(stat.mtime instanceof Date);
assert.equal(stat.mtime.getTime(), 1000);
assert.equal(stat.mode, 0o100644);
assert.equal(stat.isFile(), true);
assert.equal(stat.isDirectory(), false);
methods.length = 0;
const previous = reads;
const pending = fs.promises.readFile('file', 'utf8');
assert.equal(reads, previous);
assert.deepEqual(methods, ['beginFs']);
assert.equal(await pending, 'hello');
assert.deepEqual(methods, ['beginFs', 'pollFs']);
await assert.rejects(fs.promises.readFile('missing'), { code: 'ENOENT' });
await new Promise<void>((resolve, reject) => fs.readFile('file', 'utf8', (error, value) => {
	if (error) return reject(error);
	assert.equal(value, 'hello'); resolve();
}));
assert.equal(jobs.size, 0);
assert.equal(fs.mkdtempSync('prefix-'), 'prefix-ABC123');
assert.equal(calls.at(-1)?.path, resolve('prefix-'));
assert.equal(fs.mkdtempSync('dir/'), 'dir/ABC123');
assert.equal(calls.at(-1)?.path, `${resolve('dir')}/`);
assert.equal(fs.mkdtempSync(''), 'ABC123');
assert.equal(calls.at(-1)?.path, `${resolve('.')}/`);
assert.equal((await fs.promises.mkdtemp('prefix-', 'buffer')).toString(), 'prefix-ABC123');
const mkdtempCallback = fs.mkdtemp as unknown as (path: string, callback: (error: unknown, value?: unknown) => void) => void;
await new Promise<void>((resolve, reject) => mkdtempCallback('prefix-', (error, value) => {
	if (error) return reject(error);
	assert.equal(value, 'prefix-ABC123'); resolve();
}));
assert.equal(fs.mkdtempSync('a-', 'hex'), Buffer.from('a-ABC123').toString('hex'));
fs.rmdirSync('empty');
assert.deepEqual(calls.at(-1), { op: 'rmdir', path: resolve('empty'), recursive: false });
await fs.promises.rmdir('tree', { recursive: true });
assert.deepEqual(calls.at(-1), { op: 'rmdir', path: resolve('tree'), recursive: true });
assert.throws(() => fs.rmdirSync('dir', { maxRetries: 1 }), /retries are not supported/);
const concurrent = await Promise.all(Array.from({ length: 40 }, () => fs.promises.readFile('file', 'utf8')));
assert.deepEqual(concurrent, Array(40).fill('hello'));
assert.equal(jobs.size, 0);
await Promise.all(Array.from({ length: 24 }, () => fs.promises.readFile('missing').catch(() => undefined)));
assert.equal(await fs.promises.readFile('file', 'utf8'), 'hello');
assert.equal(jobs.size, 0);
const update = await import('../src/update-txiki.ts');
assert.equal(await update.check_for_update(), null);
assert.equal(update.finish_update(), undefined);
console.log('txiki-fs ok');
