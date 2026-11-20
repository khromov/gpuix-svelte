import { Buffer } from 'buffer';
import { resolve } from './path.ts';

export interface Options { encoding?: BufferEncoding | 'buffer' | null; flag?: string; recursive?: boolean; force?: boolean; mode?: number; maxRetries?: number; retryDelay?: number; withFileTypes?: boolean }
type Encoding = BufferEncoding | 'buffer' | Options | null;
type Bytes = string | ArrayBuffer | ArrayBufferView;
type Path = string | URL;
type Callback = (error: unknown, value?: unknown) => void;
export interface Metadata { kind: string; size: number; atimeMs: number; mtimeMs: number; ctimeMs: number; birthtimeMs: number; mode: number; uid: number; gid: number; ino: number; dev: number; nlink: number; blocks: number; blksize: number }
interface Operation { op: string; path: string; [key: string]: unknown }
type Work<T> = Generator<Operation, T, unknown>;
const CHUNK = 64 * 1024;
const MAX_FILE = 32 * 1024 * 1024;
let next_job = 0;
let active_jobs = 0;
const waiting_jobs: Array<() => void> = [];

function options(value: Encoding | undefined, allowed: string[], allowBuffer = false): Options {
	if (value == null) return {};
	const result = typeof value === 'string' ? { encoding: value } : value;
	for (const key of Object.keys(result)) if (!allowed.includes(key)) throw new TypeError(`Unsupported filesystem option: ${key}`);
	if (result.encoding != null && !(allowBuffer && result.encoding === 'buffer') && !Buffer.isEncoding(result.encoding)) throw new TypeError(`Unsupported encoding: ${result.encoding}`);
	return result;
}
function filename(path: Path): string {
	if (typeof path === 'string') return path === '' ? path : resolve(path);
	if (!(path instanceof URL) || path.protocol !== 'file:' || (path.hostname && path.hostname !== 'localhost') || /%2f/i.test(path.pathname)) {
		throw new TypeError('path must be a string or a local file URL');
	}
	return decodeURIComponent(path.pathname);
}
function rpc<T>(method: string, ...args: unknown[]): T {
	const reply = JSON.parse(globalThis.__gpuixCall(JSON.stringify({ method, args })));
	if (reply.error || reply.closed) throw new Error(reply.error ?? 'GPUI session closed');
	return reply.value;
}
function result(value: string): unknown {
	const reply = JSON.parse(value);
	if (reply.error) throw Object.assign(new Error(reply.error.message), reply.error);
	return reply.value;
}
function run<T>(work: Work<T>): T {
	let step = work.next();
	while (!step.done) step = work.next(result(rpc('fs', step.value)));
	return step.value;
}
async function runAsync<T>(work: Work<T>): Promise<T> {
	let step = work.next();
	while (!step.done) {
		if (active_jobs >= 16) await new Promise<void>(resolve => waiting_jobs.push(resolve));
		else active_jobs++;
		try {
			const id = ++next_job;
			rpc('beginFs', id, step.value);
			for (;;) {
				await new Promise(resolve => setTimeout(resolve, 4));
				const reply = rpc<{ done: boolean; value?: string }>('pollFs', id);
				if (reply.done) {
					step = work.next(result(reply.value!));
					break;
				}
			}
		} finally {
			const next = waiting_jobs.shift();
			if (next) next();
			else active_jobs--;
		}
	}
	return step.value;
}
function operation(op: string, path: Path, extra: Record<string, unknown> = {}): Operation {
	return { op, ...extra, path: filename(path), ...(extra.dest !== undefined && { dest: filename(extra.dest as Path) }) };
}
function bytesOf(data: Bytes, encoding?: BufferEncoding | null): Uint8Array {
	if (typeof data === 'string') return Buffer.from(data, encoding ?? 'utf8');
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	throw new TypeError('data must be a string, ArrayBuffer, or ArrayBufferView');
}
function* readWork(path: Path, value?: Encoding): Work<string | Buffer> {
	const { encoding, flag = 'r' } = options(value, ['encoding', 'flag']);
	if (flag !== 'r') throw new TypeError(`Unsupported readFile flag: ${flag}`);
	const chunks: Buffer[] = [];
	let length = 0;
	for (;;) {
		const chunk = Buffer.from((yield operation('read', path, { offset: length })) as number[]);
		chunks.push(chunk); length += chunk.length;
		if (length > MAX_FILE) throw new RangeError('readFile exceeds the mobile 32 MiB limit');
		if (chunk.length < CHUNK) break;
	}
	const bytes = Buffer.concat(chunks, length);
	return encoding ? bytes.toString(encoding as BufferEncoding) : bytes;
}
function* writeWork(path: Path, data: Bytes, value?: Encoding, append = false): Work<void> {
	const { encoding, flag = append ? 'a' : 'w', mode = 0o666 } = options(value, ['encoding', 'flag', 'mode']);
	if (!['w', 'w+', 'wx', 'wx+', 'xw', 'xw+', 'a', 'a+', 'ax', 'ax+', 'xa', 'xa+', 'r+'].includes(flag)) throw new TypeError(`Unsupported writeFile flag: ${flag}`);
	const bytes = bytesOf(data, encoding as BufferEncoding | null | undefined);
	for (let offset = 0; offset < bytes.length || offset === 0; offset += CHUNK) {
		yield operation('write', path, { data: Array.from(bytes.subarray(offset, offset + CHUNK)), flag, offset, mode });
	}
}
function* mkdtempWork(path: Path, value?: Encoding): Work<string | Buffer> {
	const opts = options(value, ['encoding'], true);
	const prefix = typeof path === 'string' ? path : filename(path);
	let absolute = resolve(prefix);
	if ((prefix === '' || prefix.endsWith('/')) && !absolute.endsWith('/')) absolute += '/';
	const bytes = (yield { op: 'mkdtemp', path: absolute }) as number[];
	const result = Buffer.concat([Buffer.from(prefix), Buffer.from(bytes.slice(-6))]);
	return opts.encoding === 'buffer' ? result : result.toString(opts.encoding ?? 'utf8');
}
function* mkdirWork(path: Path, value?: Options): Work<string | undefined> {
	const opts = options(value, ['recursive', 'mode']);
	return ((yield operation('mkdir', path, { recursive: opts.recursive ?? false, mode: opts.mode ?? 0o777 })) ?? undefined) as string | undefined;
}
function kindInfo(metadata: { kind: string }) {
	return {
		isFile: () => metadata.kind === 'file', isDirectory: () => metadata.kind === 'directory', isSymbolicLink: () => metadata.kind === 'symlink',
		isBlockDevice: () => metadata.kind === 'block', isCharacterDevice: () => metadata.kind === 'character', isFIFO: () => metadata.kind === 'fifo', isSocket: () => metadata.kind === 'socket'
	};
}
function* readdirWork(path: Path, value?: Encoding): Work<Array<string | Buffer | ({ name: string | Buffer; parentPath: string } & ReturnType<typeof kindInfo>)>> {
	const opts = options(value, ['encoding', 'withFileTypes'], true);
	const entries = (yield operation('readdir', path, { withFileTypes: opts.withFileTypes ?? false })) as Array<number[] | { name: number[]; kind: string }>;
	const name = (bytes: number[]) => opts.encoding === 'buffer' ? Buffer.from(bytes) : Buffer.from(bytes).toString(opts.encoding ?? 'utf8');
	return entries.map(entry => Array.isArray(entry) ? name(entry) : { name: name(entry.name), parentPath: typeof path === 'string' ? path : filename(path), ...kindInfo(entry) });
}
function* statWork(path: Path, op: string): Work<Metadata & ReturnType<typeof kindInfo> & { atime: Date; mtime: Date; ctime: Date; birthtime: Date }> {
	const metadata = (yield operation(op, path)) as Metadata;
	return { ...metadata, ...kindInfo(metadata), atime: new Date(metadata.atimeMs), mtime: new Date(metadata.mtimeMs), ctime: new Date(metadata.ctimeMs), birthtime: new Date(metadata.birthtimeMs) };
}
function* single<T = void>(op: string, path: Path, extra?: Record<string, unknown>): Work<T> { return (yield operation(op, path, extra)) as T; }
function* rmWork(path: Path, value?: Options): Work<void> {
	const opts = options(value, ['recursive', 'force', 'maxRetries', 'retryDelay']);
	if (opts.maxRetries || opts.retryDelay) throw new TypeError('rm retries are not supported');
	yield operation('rm', path, { recursive: opts.recursive ?? false, force: opts.force ?? false });
}
function* rmdirWork(path: Path, value?: Options): Work<void> {
	const opts = options(value, ['recursive', 'maxRetries', 'retryDelay']);
	if (opts.maxRetries || opts.retryDelay) throw new TypeError('rmdir retries are not supported');
	yield operation('rmdir', path, { recursive: opts.recursive ?? false });
}
function* copyWork(path: Path, dest: Path, mode = 0): Work<void> {
	if (mode !== 0 && mode !== constants.COPYFILE_EXCL) throw new TypeError('copyFile cloning is not supported');
	yield operation('copy', path, { dest, exclusive: mode === constants.COPYFILE_EXCL });
}
function* accessWork(path: Path, mode = 0): Work<void> { yield operation('access', path, { mode }); }
const sync = <A extends unknown[], R>(method: (...args: A) => Work<R>) => (...args: A): R => run(method(...args));
const promised = <A extends unknown[], R>(method: (...args: A) => Work<R>) => async (...args: A): Promise<R> => runAsync(method(...args));
export const readFileSync = sync(readWork);
export const writeFileSync = sync(writeWork);
export const appendFileSync = (path: Path, data: Bytes, value?: Encoding) => run(writeWork(path, data, value, true));
export const mkdirSync = sync(mkdirWork);
export const mkdtempSync = sync(mkdtempWork);
export const readdirSync = sync(readdirWork);
export const statSync = (path: Path) => run(statWork(path, 'stat'));
export const lstatSync = (path: Path) => run(statWork(path, 'lstat'));
export const unlinkSync = (path: Path) => run(single('unlink', path));
export const renameSync = (path: Path, dest: Path) => run(single('rename', path, { dest }));
export const rmSync = sync(rmWork);
export const rmdirSync = sync(rmdirWork);
export const copyFileSync = sync(copyWork);
export const accessSync = sync(accessWork);
export function existsSync(path: Path): boolean { try { accessSync(path); return true; } catch { return false; } }
export const realpathSync = (path: Path) => run(single<string>('realpath', path));
export const constants = Object.freeze({ F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1, COPYFILE_EXCL: 1, COPYFILE_FICLONE: 2, COPYFILE_FICLONE_FORCE: 4 });
export const promises = Object.freeze({
	readFile: promised(readWork), writeFile: promised(writeWork), appendFile: (path: Path, data: Bytes, value?: Encoding) => runAsync(writeWork(path, data, value, true)),
	mkdir: promised(mkdirWork), mkdtemp: promised(mkdtempWork), readdir: promised(readdirWork), stat: (path: Path) => runAsync(statWork(path, 'stat')), lstat: (path: Path) => runAsync(statWork(path, 'lstat')),
	unlink: (path: Path) => runAsync(single('unlink', path)), rename: (path: Path, dest: Path) => runAsync(single('rename', path, { dest })),
	rm: promised(rmWork), rmdir: promised(rmdirWork), copyFile: promised(copyWork), access: promised(accessWork), realpath: (path: Path) => runAsync(single<string>('realpath', path))
});
function callbackMethod<A extends unknown[], R>(method: (...args: A) => Promise<R>) {
	return (...args: [...A, Callback]): void => {
		const callback = args.pop() as Callback;
		if (typeof callback !== 'function') throw new TypeError('callback must be a function');
		Promise.resolve().then(() => method(...args as unknown as A)).then(value => callback(null, value), error => callback(error));
	};
}
export const readFile = callbackMethod(promises.readFile);
export const writeFile = callbackMethod(promises.writeFile);
export const appendFile = callbackMethod(promises.appendFile);
export const mkdir = callbackMethod(promises.mkdir);
export const mkdtemp = callbackMethod(promises.mkdtemp);
export const readdir = callbackMethod(promises.readdir);
export const stat = callbackMethod(promises.stat);
export const lstat = callbackMethod(promises.lstat);
export const unlink = callbackMethod(promises.unlink);
export const rename = callbackMethod(promises.rename);
export const rm = callbackMethod(promises.rm);
export const rmdir = callbackMethod(promises.rmdir);
export const copyFile = callbackMethod(promises.copyFile);
export const access = callbackMethod(promises.access);
export const realpath = callbackMethod(promises.realpath);
export function exists(path: Path, callback: (exists: boolean) => void) {
	if (typeof callback !== 'function') throw new TypeError('callback must be a function');
	promises.access(path).then(() => callback(true), () => callback(false));
}
export default { readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync, readdirSync, statSync, lstatSync, unlinkSync, renameSync, rmSync, rmdirSync, copyFileSync, accessSync, existsSync, realpathSync, readFile, writeFile, appendFile, mkdir, mkdtemp, readdir, stat, lstat, unlink, rename, rm, rmdir, copyFile, access, realpath, exists, constants, promises };
