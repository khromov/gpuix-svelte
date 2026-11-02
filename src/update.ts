/**
 * `gpuix-svelte/update` — in-app updates for a compiled app. A static manifest on any HTTPS host
 * names the newest version, its notes and a sha256-checked archive per platform;
 * `check_for_update()` reads it, and the `Update` it returns downloads, verifies and swaps the
 * running app for the new one. The build bakes the manifest URL, the public key and the version
 * into the executable as `GPUIX_APP_INFO`, which is also how a dev run can pretend to be one.
 * Everything here is node:* (the zip is src/zip.ts through adm-zip), so it runs on Node
 * and Bun alike and the tests cover the swap on a copy.
 */

import { spawn } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as sign_bytes, verify as verify_bytes } from 'node:crypto';
import { chmodSync, closeSync, copyFileSync, existsSync, lstatSync, readFileSync, mkdtempSync, openSync, readdirSync, readSync, realpathSync, renameSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { EmbeddedAppInfo, UpdateFragment } from './app-bundle.ts';
import { extract_zip } from './zip.ts';

export type { EmbeddedAppInfo, UpdateFragment } from './app-bundle.ts';
export { updated_from, wait_for_previous_instance, type PreviousInstance } from './previous-instance.ts';

export interface UpdateAsset {
	url: string;
	/** Hex sha256 of the file at `url`. */
	sha256: string;
	size?: number;
}

export interface UpdateManifest {
	version: string;
	/** Release notes, markdown. */
	notes?: string;
	/** ISO 8601. */
	published_at?: string;
	/** A page for people whose copy can't be updated in place (a read-only install, say). */
	url?: string;
	/** Keyed by `<process.platform>-<process.arch>`: `darwin-arm64`, `win32-x64`, `win32-arm64`, `linux-x64`. */
	platforms: Record<string, UpdateAsset>;
	/** Base64 ed25519 signature over `canonical_manifest()`, from `gpuix-svelte update manifest --key`. */
	signature?: string;
}

export type UpdateErrorCode = 'version' | 'manifest' | 'signature' | 'download' | 'hash' | 'extract' | 'install' | 'not-installable';

export class UpdateError extends Error {
	code: UpdateErrorCode;
	constructor(code: UpdateErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'UpdateError';
		this.code = code;
	}
}

/**
 * Why `install()` would refuse: a dev run (`npm start`, a test, or an executable the build did
 * not make), nothing in the manifest for this platform, a macOS app Gatekeeper is running from a
 * read-only translocated copy (it was opened straight from the download instead of being moved
 * to Applications), an install directory this user can't write, or a platform without a swap.
 */
export type NotInstallable = 'development' | 'no-asset' | 'translocated' | 'read-only' | 'unsupported';

export interface CheckOptions {
	/** Overrides the app's `update.manifest`. In a dev run `GPUIX_UPDATE_MANIFEST` in the environment outranks both; a built app ignores the variable. */
	manifest?: string;
	/** Overrides the app's `update.publicKey`. */
	publicKey?: string;
	/** The running version; the built app's by default. */
	version?: string;
	/** `<process.platform>-<process.arch>` by default. */
	platform?: string;
	/** What to replace — the `.app`, `.exe` or executable. For tests: by default it is the running app, and only when the running executable is a built app. */
	target?: string;
	fetch?: typeof fetch;
}

export interface DownloadOptions {
	/** `total` is the manifest's `size`, else the response's `content-length`, else null. */
	onProgress?: (received: number, total: number | null) => void;
	/** Aborting it fails the download with code `download` and removes what was written. */
	signal?: AbortSignal;
}

export interface InstallOptions extends DownloadOptions {
	/** Start the new version and exit this process once the swap is done; `false` keeps running on the old code until the next launch. Default true. */
	relaunch?: boolean;
	/** The arguments the new version starts with; this process's own (`process.argv.slice(2)`) by default. */
	args?: string[];
}

export interface Update {
	readonly version: string;
	readonly current: string;
	readonly notes: string;
	readonly published_at?: string;
	readonly url?: string;
	readonly platform: string;
	/** Null when the manifest has nothing for this platform. */
	readonly asset: UpdateAsset | null;
	readonly installable: boolean;
	readonly reason?: NotInstallable;
	/** True once `install()` has swapped the app; a second `install()` throws. */
	readonly installed: boolean;
	/** Fetches the archive into a temp directory and checks its size and sha256; resolves to its path. A download in flight is shared, and `install()` calls it when it has not run. */
	download(options?: DownloadOptions): Promise<string>;
	/** Extracts, checks that what came out is this app (its kind of executable; on macOS the bundle's identifier and version) and swaps it in for the running app. */
	install(options?: InstallOptions): Promise<void>;
}

/** What the build wrote into the executable; null under `npm start`, or on Node, unless `GPUIX_APP_INFO` is set by hand. */
export function app_info(): EmbeddedAppInfo | null {
	// Spelled out so Bun's `define` in gpuix-svelte/build replaces it with the app's own.
	const raw = process.env.GPUIX_APP_INFO;
	if (!raw) return null;
	try {
		const info = JSON.parse(raw) as EmbeddedAppInfo;
		return typeof info?.version === 'string' && typeof info.slug === 'string' ? info : null;
	} catch {
		return null;
	}
}

export async function check_for_update(options: CheckOptions = {}): Promise<Update | null> {
	const app = app_info();
	const { target, reason } = resolve_target(options.target);
	clean_up(target);
	// The build defines this one away, so only a dev run can be pointed elsewhere.
	const url = process.env.GPUIX_UPDATE_MANIFEST || options.manifest || app?.update?.manifest;
	if (!url) return null;
	check_url(url, 'manifest');
	const current = options.version ?? app?.version;
	if (!current) throw new UpdateError('version', 'the running version is unknown: this is not a built app, and `version` was not given');
	const platform = options.platform ?? `${process.platform}-${process.arch}`;
	const public_key = options.publicKey ?? app?.update?.publicKey;
	const fetch_ = options.fetch ?? fetch;

	let response: Response;
	try {
		response = await fetch_(url, { headers: { accept: 'application/json' } });
	} catch (error) {
		throw new UpdateError('manifest', `${url}: ${(error as Error).message}`, { cause: error });
	}
	// A redirect could have left https behind.
	if (response.url) check_url(response.url, 'manifest');
	if (!response.ok) throw new UpdateError('manifest', `${url}: ${response.status} ${response.statusText}`);
	let manifest: UpdateManifest;
	try {
		manifest = (await response.json()) as UpdateManifest;
	} catch (error) {
		throw new UpdateError('manifest', `${url} is not JSON`, { cause: error });
	}
	validate_manifest(manifest, url);
	if (public_key && !verify_manifest(manifest, public_key)) throw new UpdateError('signature', `${url} is not signed with this app's key`);
	if (compare_versions(manifest.version, current) <= 0) return null;

	const asset = manifest.platforms[platform] ?? null;
	if (asset) check_url(asset.url, 'manifest');
	return new AppUpdate(manifest, current, platform, asset, target, reason ?? (asset ? undefined : 'no-asset'), app, fetch_);
}

/**
 * Deletes what earlier updates left: the archive or staging directory of an app that was closed
 * or killed midway, and on Windows the old `.exe`, which can't be deleted while it runs, only
 * renamed, so it waits as `<name>.exe.old` until the next launch.
 * `check_for_update()` does this; call it at startup in an app that checks later or never.
 */
export function finish_update(target?: string) {
	clean_up(target ?? resolve_target().target);
}

function clean_up(exe: string | null) {
	sweep(tmpdir(), DOWNLOAD_PREFIX);
	if (!exe) return;
	const dir = dirname(exe);
	sweep(dir, STAGING_PREFIX);
	if (process.platform !== 'win32') return;
	const leftover = new RegExp(`^${escape_regexp(basename(exe))}(\\.\\d+)?\\.old$`, 'i');
	for (const name of list(dir)) {
		if (!leftover.test(name)) continue;
		try {
			rmSync(join(dir, name), { force: true });
		} catch {
			// Still running, or still exiting; the next launch gets it.
		}
	}
}

const DOWNLOAD_PREFIX = 'gpuix-svelte-update-';
const STAGING_PREFIX = '.update-';

// The pid in the name is what tells an abandoned directory from another instance's live download.
function make_own_dir(parent: string, prefix: string): string {
	return mkdtempSync(join(parent, `${prefix}${process.pid}-`));
}

function sweep(dir: string, prefix: string) {
	for (const name of list(dir)) {
		const pid = name.startsWith(prefix) ? /^\d+(?=-)/.exec(name.slice(prefix.length))?.[0] : undefined;
		if (pid && !is_running(Number(pid))) rm_quietly(join(dir, name));
	}
}

function list(dir: string): string[] {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

function is_running(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// Only ESRCH says it is gone; EPERM is another user's live process.
		return (error as NodeJS.ErrnoException).code !== 'ESRCH';
	}
}

class AppUpdate implements Update {
	readonly version: string;
	readonly current: string;
	readonly notes: string;
	readonly published_at?: string;
	readonly url?: string;
	readonly platform: string;
	readonly asset: UpdateAsset | null;
	readonly installable: boolean;
	readonly reason?: NotInstallable;
	installed = false;
	private target: string | null;
	private app: EmbeddedAppInfo | null;
	private fetch_: typeof fetch;
	private downloading: Promise<string> | null = null;
	private download_dir: string | null = null;

	constructor(
		manifest: UpdateManifest,
		current: string,
		platform: string,
		asset: UpdateAsset | null,
		target: string | null,
		reason: NotInstallable | undefined,
		app: EmbeddedAppInfo | null,
		fetch_: typeof fetch
	) {
		this.version = manifest.version;
		this.current = current;
		this.notes = manifest.notes ?? '';
		this.published_at = manifest.published_at;
		this.url = manifest.url;
		this.platform = platform;
		this.asset = asset;
		this.target = target;
		this.reason = reason;
		this.installable = reason === undefined && target !== null && asset !== null;
		this.app = app;
		this.fetch_ = fetch_;
	}

	download(options: DownloadOptions = {}): Promise<string> {
		if (!this.asset) return Promise.reject(new UpdateError('not-installable', `the manifest has nothing for ${this.platform}`));
		this.downloading ??= this.fetch_archive(this.asset, options).catch((error) => {
			this.downloading = null;
			throw error;
		});
		return this.downloading;
	}

	private async fetch_archive({ url, sha256, size }: UpdateAsset, { onProgress, signal }: DownloadOptions): Promise<string> {
		let response: Response;
		try {
			response = await this.fetch_(url, { signal });
		} catch (error) {
			throw new UpdateError('download', `${url}: ${(error as Error).message}`, { cause: error });
		}
		if (response.url) check_url(response.url, 'download');
		if (!response.ok || !response.body) throw new UpdateError('download', `${url}: ${response.status} ${response.statusText}`);
		const total = size ?? (Number(response.headers.get('content-length')) || null);
		// A fixed name under a directory of its own: nothing from the URL becomes a path.
		const dir = make_own_dir(tmpdir(), DOWNLOAD_PREFIX);
		const file = join(dir, 'update.bin');
		const hash = createHash('sha256');
		const reader = response.body.getReader();
		let received = 0;
		let fd: number | null = null;
		try {
			fd = openSync(file, 'w');
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				received += value.byteLength;
				// Refuse past the promised size while streaming, so a hijacked host can't fill the disk.
				if (size !== undefined && received > size) throw new UpdateError('hash', `${url} is longer than the ${size} bytes the manifest says`);
				hash.update(value);
				writeSync(fd, value);
				onProgress?.(received, total);
			}
			closeSync(fd);
			fd = null;
		} catch (error) {
			reader.cancel().catch(() => {});
			if (fd !== null) closeSync(fd);
			rmSync(dir, { recursive: true, force: true });
			if (error instanceof UpdateError) throw error;
			throw new UpdateError('download', `${url}: ${(error as Error).message}`, { cause: error });
		}
		const digest = hash.digest('hex');
		if ((size !== undefined && received !== size) || digest !== sha256.toLowerCase()) {
			rmSync(dir, { recursive: true, force: true });
			if (size !== undefined && received !== size) throw new UpdateError('hash', `${url} is ${received} bytes, the manifest says ${size}`);
			throw new UpdateError('hash', `${url}'s sha256 is ${digest}, the manifest says ${sha256}`);
		}
		this.download_dir = dir;
		return file;
	}

	async install({ relaunch = true, args, ...download }: InstallOptions = {}): Promise<void> {
		if (!this.installable || !this.target) throw new UpdateError('not-installable', not_installable_text(this.reason));
		if (this.installed) throw new UpdateError('install', `${this.version} is already installed; restart the app`);
		const archive = await this.download(download);
		const target = this.target;
		let staging: string;
		try {
			// Beside the target, so the final rename never crosses a filesystem; making it also proves the directory is writable.
			staging = make_own_dir(dirname(target), STAGING_PREFIX);
		} catch (error) {
			throw new UpdateError('install', `cannot write next to ${target}: ${(error as Error).message}`, { cause: error });
		}
		let kept = false;
		try {
			extract(archive, staging, target);
			const fresh = locate(staging, target);
			if (process.platform === 'darwin') check_bundle(fresh, this.app, this.version);
			const previous = swap(target, fresh, staging);
			this.installed = true;
			// Exits the process on success; on failure the old version is back in place.
			if (relaunch) await relaunch_app(target, previous, staging, args ?? process.argv.slice(2), this.current);
		} catch (error) {
			if (error instanceof StrandedError) {
				// The old app sits in staging and nothing else can put it back; keep it where no sweep reaches.
				kept = true;
				error.message += `; ${keep_staging(staging, error.stranded)}`;
			}
			if (error instanceof RelaunchError) this.installed = false;
			throw error;
		} finally {
			// The swap is done (or rolled back); a leftover file must not turn that into a failure.
			if (!kept) rm_quietly(staging);
			if (this.download_dir) rm_quietly(this.download_dir);
			this.download_dir = null;
			this.downloading = null;
		}
	}
}

/** The rename that should have put the old app back failed, so it is stranded at `stranded`. */
class StrandedError extends UpdateError {
	stranded: string;
	constructor(message: string, stranded: string, options?: ErrorOptions) {
		super('install', message, options);
		this.stranded = stranded;
	}
}

/** The new version was swapped in but never started, and the old one is back. */
class RelaunchError extends UpdateError {}

/** Renames staging to a name the sweep never matches and says where the old app is now. */
function keep_staging(staging: string, stranded: string): string {
	const kept = join(dirname(staging), `${STAGING_PREFIX}kept-${basename(staging).slice(STAGING_PREFIX.length)}`);
	try {
		renameSync(staging, kept);
		return `the previous version was kept at ${stranded.startsWith(staging) ? join(kept, stranded.slice(staging.length + 1)) : stranded}`;
	} catch {
		return `the previous version was kept at ${stranded}`;
	}
}

function rm_quietly(path: string) {
	try {
		rmSync(path, { recursive: true, force: true });
	} catch {
		// Best effort; a locked file here is not worth failing an installed update over.
	}
}

function escape_regexp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function not_installable_text(reason: NotInstallable | undefined): string {
	switch (reason) {
		case 'development':
			return 'not a built app: run the executable gpuix-svelte/build made';
		case 'no-asset':
			return 'the manifest has nothing for this platform';
		case 'translocated':
			return 'macOS is running this app from a read-only copy; move it to Applications first';
		case 'read-only':
			return "this user can't write to the directory the app is installed in";
		default:
			return 'updates cannot be installed on this platform';
	}
}

/**
 * A Bun executable with the app compiled in serves its entry from a virtual filesystem
 * (`/$bunfs/`, `B:\~BUN\` on Windows, both from Bun's source); `bun app.ts` and Node serve it from
 * disk. Nothing about the executable's name is trusted: a renamed runtime must never become a target.
 */
function is_compiled(): boolean {
	const main = (globalThis as { Bun?: { main?: string } }).Bun?.main ?? '';
	return main.startsWith('/$bunfs/') || /[\\/]~BUN[\\/]/.test(main);
}

function resolve_target(override?: string): { target: string | null; reason?: NotInstallable } {
	let target = override ? resolve(override) : null;
	if (!target) {
		if (!is_compiled()) return { target: null, reason: 'development' };
		if (!['darwin', 'win32', 'linux'].includes(process.platform)) return { target: null, reason: 'unsupported' };
		const exe = realpathSync(process.execPath);
		target = exe;
		if (process.platform === 'darwin') {
			if (exe.includes('/AppTranslocation/')) return { target: null, reason: 'translocated' };
			const bundle = resolve(exe, '../../..');
			if (!bundle.endsWith('.app') || basename(dirname(exe)) !== 'MacOS') return { target: null, reason: 'unsupported' };
			target = bundle;
		}
	}
	// The swap renames within the directory, so that is what has to be writable; a real
	// write is the only probe Windows ACLs answer.
	try {
		rmSync(mkdtempSync(join(dirname(target), '.update-probe-')), { recursive: true, force: true });
	} catch {
		return { target: null, reason: 'read-only' };
	}
	return { target };
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** HTTPS, or plain HTTP to this machine for trying things out. */
function check_url(url: string, code: UpdateErrorCode) {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new UpdateError(code, `${url} is not a URL`);
	}
	if (parsed.protocol === 'https:') return;
	if (parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname)) return;
	throw new UpdateError(code, `${url} is not https`);
}

function head(path: string, length: number): Buffer {
	const buffer = Buffer.alloc(length);
	const fd = openSync(path, 'r');
	try {
		return buffer.subarray(0, readSync(fd, buffer, 0, length, 0));
	} finally {
		closeSync(fd);
	}
}

type Kind = 'zip' | 'executable' | 'unknown';

/** What a file is, from its first bytes rather than its name. */
function kind_of(path: string): Kind {
	const bytes = head(path, 4);
	if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'zip';
	if (is_executable(bytes)) return 'executable';
	return 'unknown';
}

function is_executable(bytes: Buffer): boolean {
	if (bytes.length < 4) return false;
	const magic = bytes.readUInt32BE(0);
	if (process.platform === 'win32') return bytes[0] === 0x4d && bytes[1] === 0x5a;
	if (process.platform === 'linux') return magic === 0x7f454c46;
	return [0xcafebabe, 0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic);
}

/** A zip is opened by src/zip.ts on every platform, which keeps an `.app`'s modes and refuses paths that leave the directory and symlinks; a bare executable takes the target's name. */
function extract(archive: string, into: string, target: string) {
	switch (kind_of(archive)) {
		case 'zip':
			try {
				extract_zip(archive, into);
			} catch (error) {
				throw new UpdateError('extract', `cannot extract the download: ${(error as Error).message}`, { cause: error });
			}
			break;
		case 'executable':
			copyFileSync(archive, join(into, basename(target)));
			break;
		default:
			throw new UpdateError('extract', 'the download is neither a zip nor an executable');
	}
}

/**
 * The new `.app`, `.exe` or executable in what was extracted: the one named like the target
 * first, then the only candidate, looking one directory down for archives that wrap their
 * contents in a folder. Whatever is found has to look like one before it is swapped in.
 */
function locate(into: string, target: string): string {
	const name = basename(target);
	const same = (a: string, b: string) => (process.platform === 'linux' ? a === b : a.toLowerCase() === b.toLowerCase());
	const candidate =
		process.platform === 'darwin'
			? (entry: string, dir: boolean) => dir && entry.endsWith('.app')
			: process.platform === 'win32'
				? (entry: string, dir: boolean) => !dir && entry.toLowerCase().endsWith('.exe')
				: (entry: string, dir: boolean) => !dir;
	const search = (dir: string, depth: number): string | null => {
		const entries = readdirSync(dir, { withFileTypes: true }).filter((entry) => !entry.name.startsWith('.') && entry.name !== '__MACOSX');
		const exact = entries.find((entry) => same(entry.name, name) && candidate(entry.name, entry.isDirectory()));
		if (exact) return join(dir, exact.name);
		const candidates = entries.filter((entry) => candidate(entry.name, entry.isDirectory()));
		if (candidates.length === 1 && (process.platform !== 'linux' || candidates[0].isFile())) return join(dir, candidates[0].name);
		if (depth > 0 && entries.length === 1 && entries[0].isDirectory()) return search(join(dir, entries[0].name), depth - 1);
		return null;
	};
	const found = search(into, 1);
	const what = process.platform === 'darwin' ? '.app' : process.platform === 'win32' ? '.exe' : 'executable';
	if (!found) throw new UpdateError('extract', `the download holds no ${what} named ${name}`);
	if (process.platform === 'darwin') {
		if (!existsSync(join(found, 'Contents', 'Info.plist'))) throw new UpdateError('extract', `${basename(found)} has no Info.plist`);
	} else if (!is_executable(head(found, 4))) {
		throw new UpdateError('extract', `${basename(found)} is not a ${process.platform === 'win32' ? 'Windows' : 'Linux'} executable`);
	}
	return found;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode_xml(text: string): string {
	return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, entity: string) => {
		try {
			return entity.startsWith('#x') ? String.fromCodePoint(parseInt(entity.slice(2), 16)) : entity.startsWith('#') ? String.fromCodePoint(Number(entity.slice(1))) : (ENTITIES[entity] ?? whole);
		} catch {
			return whole;
		}
	});
}

/**
 * The string values of an XML `Info.plist`'s top-level dictionary, which is all a bundle check
 * needs; null for a binary or unreadable plist. The build writes XML, and Apple's signing and
 * stapling leave it so. Comments, CDATA and processing instructions are dropped first and only
 * the first `<plist>` counts, so they can't carry a decoy; this is a guard against mistakes, not
 * a signature check.
 */
export function plist_strings(path: string): Map<string, string> | null {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch {
		return null;
	}
	if (text.startsWith('bplist')) return null;
	const start = text.indexOf('<plist');
	if (start === -1) return null;
	const end = text.indexOf('</plist>', start);
	text = text
		.slice(start, end === -1 ? undefined : end)
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
		.replace(/<\?[\s\S]*?\?>/g, '');
	const values = new Map<string, string>();
	let depth = 0;
	let key: string | null = null;
	for (const [, closing, tag, self_closing, body] of text.matchAll(/<(\/?)(dict|array|key|string|data|date|integer|real|true|false)\b[^>]*?(\/?)>([^<]*)/g)) {
		if (tag === 'dict' || tag === 'array') {
			if (!self_closing) depth += closing ? -1 : 1;
			key = null;
		} else if (depth === 1 && !closing) {
			if (tag === 'key') {
				key = decode_xml(body);
			} else {
				if (tag === 'string' && key !== null) values.set(key, self_closing ? '' : decode_xml(body));
				key = null;
			}
		}
	}
	return values;
}

/**
 * The new bundle has to look like a build of this app: the identifier is this app's, the version
 * is the manifest's, and the executable the plist names is a real Mach-O inside `Contents/MacOS`
 * with the executable bit (so the relaunch can't silently die). A guard against a wrong upload,
 * not against a hostile one: whoever can edit an unsigned manifest can write any plist. Sign the
 * manifest for that.
 */
function check_bundle(fresh: string, app: EmbeddedAppInfo | null, version: string) {
	const plist = plist_strings(join(fresh, 'Contents', 'Info.plist'));
	const identifier = plist?.get('CFBundleIdentifier') ?? null;
	if (app && identifier !== app.identifier) throw new UpdateError('extract', `${basename(fresh)} is ${identifier ?? 'no bundle'}, this app is ${app.identifier}`);
	const bundle_version = plist?.get('CFBundleShortVersionString');
	if (bundle_version === undefined) throw new UpdateError('extract', `${basename(fresh)} has no CFBundleShortVersionString`);
	if (compare_versions(bundle_version, version) !== 0) throw new UpdateError('extract', `${basename(fresh)} is version ${bundle_version}, the manifest says ${version}`);
	const executable = plist?.get('CFBundleExecutable') ?? '';
	if (!executable || /[/\\]/.test(executable) || executable === '.' || executable === '..') throw new UpdateError('extract', `${basename(fresh)} names no executable`);
	check_executable(join(fresh, 'Contents', 'MacOS', executable), 'darwin');
}

/** A regular file, not a link, with the executable bit and the platform's magic: what `spawn` can start. */
function check_executable(path: string, platform: NodeJS.Platform) {
	let stat;
	try {
		stat = lstatSync(path);
	} catch {
		throw new UpdateError('extract', `${path} is missing`);
	}
	if (!stat.isFile()) throw new UpdateError('extract', `${path} is not a file`);
	if (platform !== 'win32' && (stat.mode & 0o111) === 0) throw new UpdateError('extract', `${path} is not executable`);
	if (!is_executable(head(path, 4))) throw new UpdateError('extract', `${path} is not a ${platform === 'darwin' ? 'Mach-O' : platform === 'win32' ? 'Windows' : 'Linux'} executable`);
}

/** Moves the old app aside and the new one in; resolves to where the old one now is, for a rollback. */
function swap(target: string, fresh: string, staging: string): string {
	if (process.platform === 'linux') chmodSync(fresh, 0o755);
	let previous = join(staging, `previous-${basename(target)}`);
	if (process.platform === 'win32') {
		// A running .exe can't be deleted or overwritten, only renamed; finish_update() deletes it next launch.
		previous = `${target}.old`;
		try {
			rmSync(previous, { force: true });
		} catch {
			previous = `${target}.${process.pid}.old`;
		}
	}
	try {
		renameSync(target, previous);
	} catch (error) {
		throw new UpdateError('install', `cannot move ${target} aside: ${(error as Error).message}`, { cause: error });
	}
	try {
		rename_in(fresh, target);
	} catch (error) {
		try {
			renameSync(previous, target);
		} catch (rollback) {
			throw new StrandedError(`cannot move the new version into ${target} (${(error as Error).message}), nor the old one back: ${(rollback as Error).message}`, previous, { cause: error });
		}
		throw new UpdateError('install', `cannot move the new version into ${target}: ${(error as Error).message}`, { cause: error });
	}
	return previous;
}

/** On Windows an antivirus can hold a freshly written executable for a moment, so the rename-in gets a few tries. */
function rename_in(fresh: string, target: string) {
	const sleeper = new Int32Array(new SharedArrayBuffer(4));
	for (let attempt = 1; ; attempt++) {
		try {
			renameSync(fresh, target);
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (process.platform !== 'win32' || attempt >= 10 || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw error;
			Atomics.wait(sleeper, 0, 0, 300);
		}
	}
}

/** Puts the old app back after a relaunch that never came up; the new one goes into staging, which is deleted. */
function roll_back(target: string, previous: string, staging: string) {
	try {
		renameSync(target, join(staging, `failed-${basename(target)}`));
	} catch {
		// Then the rename below fails too, and says so.
	}
	try {
		renameSync(previous, target);
	} catch (error) {
		throw new StrandedError(`the new version did not start and the old one could not be put back: ${(error as Error).message}`, previous, { cause: error });
	}
}

const READY_TIMEOUT = 10000;

/**
 * What Electron's `app.relaunch()` does, with no helper process: the new executable itself,
 * detached, its output dropped, the old arguments replayed. Electron's readiness handshake is a
 * sentinel file: the new instance writes it as soon as it runs our code
 * (`wait_for_previous_instance`, which render() calls before it opens a window), and only then
 * does this process exit. A new version that fails to spawn, exits, or never reports is rolled
 * back, so a swap can't end with no app that starts.
 */
async function relaunch_app(target: string, previous: string, staging: string, args: string[], from: string): Promise<never> {
	let executable = target;
	if (process.platform === 'darwin') {
		const name = plist_strings(join(target, 'Contents', 'Info.plist'))?.get('CFBundleExecutable') ?? basename(process.execPath);
		executable = join(target, 'Contents', 'MacOS', name);
	}
	const ready = join(tmpdir(), `gpuix-svelte-relaunch-${process.pid}-${Date.now()}`);
	const env = { ...process.env, GPUIX_RELAUNCH_AFTER: String(process.pid), GPUIX_RELAUNCH_READY: ready, GPUIX_UPDATED_FROM: from };
	// Started from inside the bundle, the working directory was just renamed away.
	let cwd: string;
	try {
		cwd = process.cwd();
	} catch {
		cwd = dirname(target);
	}
	const failed = (why: string): never => {
		rm_quietly(ready);
		roll_back(target, previous, staging);
		throw new RelaunchError('install', `the new version did not start (${why}); the previous one is back in place`);
	};
	const child = spawn(executable, args, { detached: true, stdio: 'ignore', env, cwd });
	try {
		await new Promise<void>((resolve, reject) => {
			child.once('spawn', resolve);
			child.once('error', reject);
		});
	} catch (error) {
		failed((error as Error).message);
	}
	child.unref();
	const deadline = Date.now() + READY_TIMEOUT;
	while (!existsSync(ready)) {
		if (child.exitCode !== null || child.signalCode !== null) failed(`it exited with ${child.signalCode ?? child.exitCode} before reporting`);
		if (Date.now() > deadline) failed(`it did not report within ${READY_TIMEOUT} ms`);
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	rm_quietly(ready);
	process.exit(0);
}

// --- The manifest: what `gpuix-svelte update manifest` writes and the app checks -------------

const SHA256 = /^[0-9a-fA-F]{64}$/;

function validate_manifest(manifest: unknown, url: string): asserts manifest is UpdateManifest {
	const m = manifest as Partial<UpdateManifest> | null;
	const bad = (what: string) => new UpdateError('manifest', `${url}: ${what}`);
	if (!m || typeof m !== 'object') throw bad('not an object');
	if (typeof m.version !== 'string') throw bad('no version');
	if (!m.platforms || typeof m.platforms !== 'object') throw bad('no platforms');
	for (const [platform, asset] of Object.entries(m.platforms)) {
		if (!asset || typeof asset.url !== 'string' || typeof asset.sha256 !== 'string') throw bad(`platforms.${platform} needs url and sha256`);
		if (!SHA256.test(asset.sha256)) throw bad(`platforms.${platform}.sha256 is not a hex sha256`);
		if (asset.size !== undefined && (!Number.isInteger(asset.size) || asset.size < 0)) throw bad(`platforms.${platform}.size is not a byte count`);
	}
	if (m.signature !== undefined && typeof m.signature !== 'string') throw bad('signature is not a string');
}

/** `1.2.0-beta.1 < 1.2.0 < 1.10.0`, as semver orders them; a leading `v` is ignored. */
export function compare_versions(a: string, b: string): -1 | 0 | 1 {
	const pa = parse_version(a);
	const pb = parse_version(b);
	for (let i = 0; i < 3; i++) if (pa.numbers[i] !== pb.numbers[i]) return pa.numbers[i] < pb.numbers[i] ? -1 : 1;
	if (pa.pre.length === 0 || pb.pre.length === 0) return pa.pre.length === pb.pre.length ? 0 : pa.pre.length ? -1 : 1;
	for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
		const x = pa.pre[i];
		const y = pb.pre[i];
		if (x === undefined) return -1;
		if (y === undefined) return 1;
		const nx = /^\d+$/.test(x);
		const ny = /^\d+$/.test(y);
		if (nx && ny) {
			if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
		} else if (nx !== ny) {
			return nx ? -1 : 1;
		} else if (x !== y) {
			return x < y ? -1 : 1;
		}
	}
	return 0;
}

/** Whether `compare_versions` can read it: `major[.minor[.patch]][-prerelease][+build]`. */
export function is_version(version: string): boolean {
	return VERSION.test(version.trim());
}

const VERSION = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parse_version(version: string): { numbers: number[]; pre: string[] } {
	const match = VERSION.exec(version.trim());
	if (!match) throw new UpdateError('version', `"${version}" is not a version`);
	return { numbers: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)], pre: match[4] ? match[4].split('.') : [] };
}

/** The bytes a signature covers: the manifest without `signature`, keys sorted, no whitespace. */
export function canonical_manifest(manifest: UpdateManifest): string {
	const { signature: _signature, ...rest } = manifest;
	void _signature;
	return JSON.stringify(sort_keys(rest));
}

function sort_keys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sort_keys);
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.keys(record)
				.sort()
				.filter((key) => record[key] !== undefined)
				.map((key) => [key, sort_keys(record[key])])
		);
	}
	return value;
}

// The DER wrapper around a raw 32-byte ed25519 public key; the app carries only the raw key, base64.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Whether `key` is what `generate_keys()` prints: 32 raw ed25519 bytes, base64. */
export function is_public_key(key: string): boolean {
	return /^[A-Za-z0-9+/]{43}=$/.test(key) && Buffer.from(key, 'base64').length === 32;
}

/** A fresh ed25519 pair: `publicKey` goes into `app.update.publicKey`, `privateKey` (PEM) stays a secret. */
export function generate_keys(): { publicKey: string; privateKey: string } {
	for (;;) {
		const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
			publicKeyEncoding: { type: 'spki', format: 'der' },
			privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
		});
		const encoded = publicKey.subarray(ED25519_SPKI_PREFIX.length).toString('base64');
		// Git Bash rewrites an argument that starts with `/` into a Windows path; one key in 64 would.
		if (!encoded.startsWith('/')) return { publicKey: encoded, privateKey };
	}
}

export function sign_manifest(manifest: UpdateManifest, private_key_pem: string): UpdateManifest {
	const key = createPrivateKey(private_key_pem);
	const signature = sign_bytes(null, Buffer.from(canonical_manifest(manifest)), key).toString('base64');
	return { ...manifest, signature };
}

export function verify_manifest(manifest: UpdateManifest, public_key: string): boolean {
	if (!manifest.signature) return false;
	try {
		const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(public_key, 'base64')]), format: 'der', type: 'spki' });
		return verify_bytes(null, Buffer.from(canonical_manifest(manifest)), key, Buffer.from(manifest.signature, 'base64'));
	} catch {
		return false;
	}
}

export interface ManifestOptions {
	/** One per platform, as `build({ archive: true })` writes them. */
	fragments: UpdateFragment[];
	/** Where the archives are uploaded; each asset's URL is this plus the fragment's file name. */
	base_url: string;
	notes?: string;
	published_at?: string;
	url?: string;
	/** PEM; given, the manifest is signed. */
	private_key?: string;
}

/** One manifest from every platform's fragment; they have to agree on the version. */
export function build_manifest({ fragments, base_url, notes, published_at, url, private_key }: ManifestOptions): UpdateManifest {
	if (fragments.length === 0) throw new UpdateError('manifest', 'no fragments');
	for (const fragment of fragments) validate_fragment(fragment);
	const versions = [...new Set(fragments.map((fragment) => fragment.version))];
	if (versions.length > 1) throw new UpdateError('manifest', `the fragments disagree on the version: ${versions.join(', ')}`);
	const base = base_url.endsWith('/') ? base_url : `${base_url}/`;
	const platforms: Record<string, UpdateAsset> = {};
	for (const fragment of fragments) {
		if (platforms[fragment.platform]) throw new UpdateError('manifest', `two fragments for ${fragment.platform}`);
		platforms[fragment.platform] = { url: base + fragment.file, sha256: fragment.sha256, size: fragment.size };
	}
	const manifest: UpdateManifest = {
		version: versions[0],
		...(notes !== undefined && { notes }),
		published_at: published_at ?? new Date().toISOString(),
		...(url && { url }),
		platforms
	};
	return private_key ? sign_manifest(manifest, private_key) : manifest;
}

function validate_fragment(fragment: unknown) {
	const f = fragment as Partial<UpdateFragment> | null;
	const bad = (what: string) => new UpdateError('manifest', `a fragment ${what}`);
	if (!f || typeof f !== 'object') throw bad('is not an object');
	if (typeof f.platform !== 'string' || !/^[a-z0-9]+-[a-z0-9]+$/.test(f.platform)) throw bad('has no platform');
	if (typeof f.version !== 'string' || !is_version(f.version)) throw bad(`(${f.platform}) has no version`);
	if (typeof f.file !== 'string' || !f.file || /[/\\]/.test(f.file)) throw bad(`(${f.platform}) has no file name`);
	if (typeof f.sha256 !== 'string' || !SHA256.test(f.sha256)) throw bad(`(${f.platform}) has no hex sha256`);
	if (!Number.isInteger(f.size) || (f.size as number) < 0) throw bad(`(${f.platform}) has no size`);
}
