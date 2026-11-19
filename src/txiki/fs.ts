export interface Options { encoding?: string; flag?: string; recursive?: boolean; force?: boolean; mode?: number; maxRetries?: number; retryDelay?: number }
type Encoding = string | Options | null;
type Bytes = string | ArrayBuffer | ArrayBufferView;
type Callback = (error: unknown, value?: unknown) => void;
interface Metadata { kind: string; size: number }

function options(value: Encoding | undefined, allowed: string[]): Options {
	if (value == null) return {};
	const result = typeof value === 'string' ? { encoding: value } : value;
	for (const key of Object.keys(result)) if (!allowed.includes(key)) throw new TypeError(`Unsupported filesystem option: ${key}`);
	if (result.encoding !== undefined && !['utf8', 'utf-8'].includes(result.encoding)) throw new TypeError(`Unsupported encoding: ${result.encoding}`);
	return result;
}
function call<T = unknown>(op: string, path: string, extra: Record<string, unknown> = {}): T {
	if (typeof path !== 'string') throw new TypeError('path must be a string');
	const reply = JSON.parse(globalThis.__gpuixCall(JSON.stringify({ method: 'fs', args: [{ op, path, ...extra }] })));
	if (reply.error || reply.closed) throw new Error(reply.error ?? 'GPUI session closed');
	const result = JSON.parse(reply.value);
	if (result.error) throw Object.assign(new Error(result.error.message), result.error);
	return result.value;
}
function bytesOf(data: Bytes): Uint8Array {
	if (typeof data === 'string') return new TextEncoder().encode(data);
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	throw new TypeError('data must be a string, ArrayBuffer, or ArrayBufferView');
}
function writeBytes(path: string, data: Bytes, flag: string) {
	const bytes = bytesOf(data);
	for (let offset = 0; offset < bytes.length || offset === 0; offset += 64 * 1024) {
		call('write', path, { data: Array.from(bytes.subarray(offset, offset + 64 * 1024)), flag: offset ? 'a' : flag });
	}
}
export function readFileSync(path: string, value?: Encoding): string | Uint8Array {
	const { encoding } = options(value, ['encoding']);
	const chunks: Uint8Array[] = [];
	let length = 0;
	for (;;) {
		const chunk = Uint8Array.from(call<number[]>('read', path, { offset: length }));
		chunks.push(chunk); length += chunk.length;
		if (chunk.length < 64 * 1024) break;
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
	return encoding ? new TextDecoder().decode(bytes) : bytes;
}
export function writeFileSync(path: string, data: Bytes, value?: Encoding): void {
	const { flag = 'w' } = options(value, ['encoding', 'flag']);
	if (!['w', 'a'].includes(flag)) throw new TypeError(`Unsupported writeFile flag: ${flag}`);
	writeBytes(path, data, flag);
}
export function appendFileSync(path: string, data: Bytes, value?: Encoding): void {
	const { flag = 'a' } = options(value, ['encoding', 'flag']);
	if (flag !== 'a') throw new TypeError(`Unsupported appendFile flag: ${flag}`);
	writeBytes(path, data, flag);
}
export function mkdirSync(path: string, value?: Options): void {
	const opts = options(value, ['recursive', 'mode']);
	if (opts.mode !== undefined) throw new TypeError('mkdir mode is not supported');
	call('mkdir', path, { recursive: opts.recursive ?? false });
}
export function readdirSync(path: string, value?: Encoding): string[] {
	options(value, ['encoding']);
	return call('readdir', path);
}
function statInfo(path: string, op: string) {
	const metadata = call<Metadata>(op, path);
	return { ...metadata, isFile: () => metadata.kind === 'file', isDirectory: () => metadata.kind === 'directory', isSymbolicLink: () => metadata.kind === 'symlink' };
}
export const statSync = (path: string) => statInfo(path, 'stat');
export const lstatSync = (path: string) => statInfo(path, 'lstat');
export function unlinkSync(path: string): void { call('unlink', path); }
export function renameSync(path: string, dest: string): void { call('rename', path, { dest }); }
export function rmSync(path: string, value?: Options): void {
	const opts = options(value, ['recursive', 'force', 'maxRetries', 'retryDelay']);
	if (opts.maxRetries || opts.retryDelay) throw new TypeError('rm retries are not supported');
	call('rm', path, { recursive: opts.recursive ?? false, force: opts.force ?? false });
}
export function copyFileSync(path: string, dest: string, mode = 0): void {
	if (mode !== 0) throw new TypeError('copyFile flags are not supported');
	call('copy', path, { dest });
}
export function accessSync(path: string, mode = 0): void {
	if (mode !== 0) throw new TypeError('access permission checks are not supported; only F_OK is supported');
	call('access', path);
}
export function existsSync(path: string): boolean {
	try { accessSync(path); return true; } catch { return false; }
}
export const realpathSync = (path: string): string => call('realpath', path);
export const constants = Object.freeze({ F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1, COPYFILE_EXCL: 1, COPYFILE_FICLONE: 2, COPYFILE_FICLONE_FORCE: 4 });

function callbackMethod<A extends unknown[], R>(method: (...args: A) => R) {
	return (...args: [...A, Callback]): void => {
		const callback = args.pop() as Callback;
		if (typeof callback !== 'function') throw new TypeError('callback must be a function');
		Promise.resolve().then(() => method(...args as unknown as A)).then(value => callback(null, value), error => callback(error));
	};
}
export const readFile = callbackMethod(readFileSync);
export const writeFile = callbackMethod(writeFileSync);
export const appendFile = callbackMethod(appendFileSync);
export const mkdir = callbackMethod(mkdirSync);
export const readdir = callbackMethod(readdirSync);
export const stat = callbackMethod(statSync);
export const lstat = callbackMethod(lstatSync);
export const unlink = callbackMethod(unlinkSync);
export const rename = callbackMethod(renameSync);
export const rm = callbackMethod(rmSync);
export const copyFile = callbackMethod(copyFileSync);
export const access = callbackMethod(accessSync);
export const realpath = callbackMethod(realpathSync);
export function exists(path: string, callback: (exists: boolean) => void) {
	if (typeof callback !== 'function') throw new TypeError('callback must be a function');
	Promise.resolve().then(() => existsSync(path)).then(callback);
}
function promised<A extends unknown[], R>(method: (...args: A) => R) {
	return (...args: A): Promise<R> => Promise.resolve().then(() => method(...args));
}
export const promises = Object.freeze({ readFile: promised(readFileSync), writeFile: promised(writeFileSync), appendFile: promised(appendFileSync), mkdir: promised(mkdirSync), readdir: promised(readdirSync), stat: promised(statSync), lstat: promised(lstatSync), unlink: promised(unlinkSync), rename: promised(renameSync), rm: promised(rmSync), copyFile: promised(copyFileSync), access: promised(accessSync), realpath: promised(realpathSync) });
export default { readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync, lstatSync, unlinkSync, renameSync, rmSync, copyFileSync, accessSync, existsSync, realpathSync, readFile, writeFile, appendFile, mkdir, readdir, stat, lstat, unlink, rename, rm, copyFile, access, realpath, exists, constants, promises };
