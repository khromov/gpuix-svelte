/**
 * `gpuix-svelte/update` — in-app updates for a compiled app. A static manifest on any HTTPS host
 * names the newest version, its notes and a sha256-checked archive per platform;
 * `check_for_update()` reads it, and the `Update` it returns downloads, verifies and swaps the
 * running app for the new one. The build bakes the manifest URL, the public key and the version
 * into the executable as `GPUIX_APP_INFO`, which is also how a dev run can pretend to be one.
 * Everything here is node:* and the platform's own tools (ditto, tar, codesign), so it runs on
 * Node and Bun alike and the tests cover the swap on a copy.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as sign_bytes, verify as verify_bytes } from 'node:crypto';
import { accessSync, chmodSync, closeSync, constants, copyFileSync, mkdirSync, mkdtempSync, openSync, readdirSync, realpathSync, renameSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { EmbeddedAppInfo, UpdateFragment } from './app-bundle.ts';

export type { EmbeddedAppInfo, UpdateFragment } from './app-bundle.ts';

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
	/** Base64 ed25519 signature over `canonical_manifest()`, from `gpuix-svelte-update manifest --key`. */
	signature?: string;
}

export type UpdateErrorCode = 'version' | 'manifest' | 'signature' | 'download' | 'hash' | 'extract' | 'codesign' | 'install' | 'not-installable';

export class UpdateError extends Error {
	code: UpdateErrorCode;
	constructor(code: UpdateErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'UpdateError';
		this.code = code;
	}
}

/**
 * Why `install()` would refuse: a dev run (`npm start`, or the version is not a built app's),
 * nothing in the manifest for this platform, a macOS app Gatekeeper is running from a read-only
 * translocated copy (it was opened straight from the download instead of being moved to
 * Applications), an install directory this user can't write, or a platform without a swap.
 */
export type NotInstallable = 'development' | 'no-asset' | 'translocated' | 'read-only' | 'unsupported';

export interface CheckOptions {
	/** Overrides the app's `update.manifest`; `GPUIX_UPDATE_MANIFEST` in the environment outranks both. */
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
	/** `total` is null when neither the response nor the manifest says how big the file is. */
	onProgress?: (received: number, total: number | null) => void;
}

export interface InstallOptions {
	/** Start the new version and exit this process once the swap is done; `false` keeps running on the old code until the next launch. Default true. */
	relaunch?: boolean;
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
	/** Fetches the archive into a temp directory and checks its size and sha256; resolves to its path. `install()` calls it when it has not run. */
	download(options?: DownloadOptions): Promise<string>;
	/** Extracts, verifies (on macOS a signed app only takes an app signed by the same team) and swaps the archive's contents in for the running app. */
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
	const { target, reason } = resolve_target(app, options.target);
	if (target) finish_update(target);
	const url = process.env.GPUIX_UPDATE_MANIFEST || options.manifest || app?.update?.manifest;
	if (!url) return null;
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
	return new AppUpdate(manifest, current, platform, asset, target, reason ?? (asset ? undefined : 'no-asset'), fetch_);
}

/**
 * Deletes what the last update left beside the executable: Windows can't delete a running
 * `.exe`, only rename it, so the old one waits as `<name>.exe.old` until the next launch.
 * `check_for_update()` does this; call it at startup in an app that checks later or never.
 */
export function finish_update(target?: string) {
	if (process.platform !== 'win32') return;
	const exe = target ?? resolve_target(app_info()).target;
	if (!exe) return;
	const dir = dirname(exe);
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of entries) {
		if (!name.startsWith(basename(exe)) || !name.endsWith('.old')) continue;
		try {
			rmSync(join(dir, name), { force: true });
		} catch {
			// Still running, or still exiting; the next launch gets it.
		}
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
	private target: string | null;
	private fetch_: typeof fetch;
	private archive: string | null = null;

	constructor(manifest: UpdateManifest, current: string, platform: string, asset: UpdateAsset | null, target: string | null, reason: NotInstallable | undefined, fetch_: typeof fetch) {
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
		this.fetch_ = fetch_;
	}

	async download({ onProgress }: DownloadOptions = {}): Promise<string> {
		if (this.archive) return this.archive;
		if (!this.asset) throw new UpdateError('not-installable', `the manifest has nothing for ${this.platform}`);
		const { url, sha256, size } = this.asset;
		let response: Response;
		try {
			response = await this.fetch_(url);
		} catch (error) {
			throw new UpdateError('download', `${url}: ${(error as Error).message}`, { cause: error });
		}
		if (!response.ok || !response.body) throw new UpdateError('download', `${url}: ${response.status} ${response.statusText}`);
		const total = Number(response.headers.get('content-length')) || size || null;
		const dir = mkdtempSync(join(tmpdir(), 'gpuix-svelte-update-'));
		const file = join(dir, file_name(url));
		const hash = createHash('sha256');
		let received = 0;
		const fd = openSync(file, 'w');
		try {
			const reader = response.body.getReader();
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				hash.update(value);
				writeSync(fd, value);
				received += value.byteLength;
				onProgress?.(received, total);
			}
		} catch (error) {
			rmSync(dir, { recursive: true, force: true });
			throw new UpdateError('download', `${url}: ${(error as Error).message}`, { cause: error });
		} finally {
			closeSync(fd);
		}
		const digest = hash.digest('hex');
		if ((size !== undefined && received !== size) || digest !== sha256.toLowerCase()) {
			rmSync(dir, { recursive: true, force: true });
			if (size !== undefined && received !== size) throw new UpdateError('hash', `${url} is ${received} bytes, the manifest says ${size}`);
			throw new UpdateError('hash', `${url}'s sha256 is ${digest}, the manifest says ${sha256}`);
		}
		this.archive = file;
		return file;
	}

	async install({ relaunch = true }: InstallOptions = {}): Promise<void> {
		if (!this.installable || !this.target) throw new UpdateError('not-installable', not_installable_text(this.reason));
		const archive = await this.download();
		const target = this.target;
		// Beside the target, so the final rename never crosses a filesystem; making it also proves the directory is writable.
		const staging = join(dirname(target), `.${basename(target)}.update`);
		rmSync(staging, { recursive: true, force: true });
		try {
			mkdirSync(staging);
		} catch (error) {
			throw new UpdateError('install', `cannot write next to ${target}: ${(error as Error).message}`, { cause: error });
		}
		try {
			extract(archive, staging);
			const fresh = locate(staging, target, archive);
			if (process.platform === 'darwin') check_codesign(target, fresh);
			swap(target, fresh, staging);
		} finally {
			rmSync(staging, { recursive: true, force: true });
			rmSync(dirname(archive), { recursive: true, force: true });
			this.archive = null;
		}
		if (relaunch) relaunch_app(target);
	}
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

function resolve_target(app: EmbeddedAppInfo | null, override?: string): { target: string | null; reason?: NotInstallable } {
	let target = override ? resolve(override) : null;
	if (!target) {
		if (!app) return { target: null, reason: 'development' };
		if (!['darwin', 'win32', 'linux'].includes(process.platform)) return { target: null, reason: 'unsupported' };
		const exe = realpathSync(process.execPath);
		// Under `bun app.ts` or Node the executable is the runtime, which is not what to replace.
		if (basename(exe).replace(/\.exe$/i, '') !== app.slug) return { target: null, reason: 'development' };
		target = exe;
		if (process.platform === 'darwin') {
			if (exe.includes('/AppTranslocation/')) return { target: null, reason: 'translocated' };
			const bundle = resolve(exe, '../../..');
			if (!bundle.endsWith('.app') || basename(dirname(exe)) !== 'MacOS') return { target: null, reason: 'unsupported' };
			target = bundle;
		}
	}
	// The swap renames within the directory, so that is what has to be writable.
	try {
		accessSync(dirname(target), constants.W_OK);
	} catch {
		return { target: null, reason: 'read-only' };
	}
	return { target };
}

function file_name(url: string): string {
	try {
		return decodeURIComponent(basename(new URL(url).pathname)) || 'update';
	} catch {
		return 'update';
	}
}

function run_tool(command: string, args: string[]) {
	const { status, stderr, error } = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
	if (error) throw new UpdateError('extract', `${command} failed to start: ${error.message}`, { cause: error });
	if (status !== 0) throw new UpdateError('extract', `${command} ${args.join(' ')} failed:\n${stderr}`);
}

/** ditto keeps an `.app` intact, bsdtar is Windows' built-in zip reader, and tar reads a gzipped tar on every platform. */
function extract(archive: string, into: string) {
	const lower = archive.toLowerCase();
	if (lower.endsWith('.zip')) {
		if (process.platform === 'darwin') run_tool('ditto', ['-x', '-k', archive, into]);
		else if (process.platform === 'win32') run_tool('tar', ['-xf', archive, '-C', into]);
		else run_tool('unzip', ['-q', archive, '-d', into]);
	} else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
		run_tool('tar', ['-xf', archive, '-C', into]);
	} else {
		copyFileSync(archive, join(into, basename(archive)));
	}
}

/** The new `.app`, `.exe` or executable in what was extracted, looking one directory down for archives that wrap their contents in a folder. */
function locate(into: string, target: string, archive: string): string {
	const wanted =
		process.platform === 'darwin'
			? (name: string, dir: boolean) => dir && name.endsWith('.app')
			: process.platform === 'win32'
				? (name: string, dir: boolean) => !dir && name.toLowerCase().endsWith('.exe')
				: (name: string, dir: boolean) => !dir && (name === basename(target) || extname(name) === '');
	const search = (dir: string, depth: number): string | null => {
		const entries = readdirSync(dir, { withFileTypes: true }).filter((entry) => !entry.name.startsWith('.') && entry.name !== '__MACOSX');
		const hit = entries.find((entry) => wanted(entry.name, entry.isDirectory()));
		if (hit) return join(dir, hit.name);
		if (depth > 0 && entries.length === 1 && entries[0].isDirectory()) return search(join(dir, entries[0].name), depth - 1);
		return null;
	};
	const found = search(into, 1);
	if (!found) throw new UpdateError('extract', `${basename(archive)} holds no ${process.platform === 'darwin' ? '.app' : process.platform === 'win32' ? '.exe' : 'executable'}`);
	return found;
}

function team_id(path: string): string | null {
	const { status, stderr } = spawnSync('codesign', ['-dv', '--verbose=2', path], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
	if (status !== 0) return null;
	const match = /^TeamIdentifier=(.+)$/m.exec(stderr);
	return match && match[1].trim() !== 'not set' ? match[1].trim() : null;
}

/** A signed app only takes an update signed by the same team, so a hijacked manifest can't hand it someone else's app; an unsigned one has nothing to hold the new one to. */
function check_codesign(current: string, fresh: string) {
	const team = team_id(current);
	if (!team) return;
	const verify = spawnSync('codesign', ['--verify', '--deep', '--strict', fresh], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
	if (verify.status !== 0) throw new UpdateError('codesign', `the downloaded app's signature does not verify: ${verify.stderr.trim()}`);
	const fresh_team = team_id(fresh);
	if (fresh_team !== team) throw new UpdateError('codesign', `the downloaded app is signed by ${fresh_team ?? 'no team'}, this one by ${team}`);
}

function swap(target: string, fresh: string, staging: string) {
	if (process.platform === 'linux') {
		// Renaming over the running executable is atomic, and the process keeps the old inode mapped.
		chmodSync(fresh, 0o755);
		try {
			renameSync(fresh, target);
		} catch (error) {
			throw new UpdateError('install', `cannot replace ${target}: ${(error as Error).message}`, { cause: error });
		}
		return;
	}
	let previous = join(staging, `previous${extname(target)}`);
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
		renameSync(fresh, target);
	} catch (error) {
		renameSync(previous, target);
		throw new UpdateError('install', `cannot move the new version into ${target}: ${(error as Error).message}`, { cause: error });
	}
}

function relaunch_app(target: string): never {
	if (process.platform === 'win32') {
		spawn(target, [], { detached: true, stdio: 'ignore' }).unref();
	} else {
		// Only once this process is gone, or the two instances overlap (and the Dock bounces twice).
		const launch = process.platform === 'darwin' ? 'open -n "$0"' : 'exec "$0"';
		spawn('/bin/sh', ['-c', `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done; ${launch}`, target], { detached: true, stdio: 'ignore' }).unref();
	}
	process.exit(0);
}

// --- The manifest: what `gpuix-svelte-update manifest` writes and the app checks -------------

function validate_manifest(manifest: unknown, url: string): asserts manifest is UpdateManifest {
	const m = manifest as Partial<UpdateManifest> | null;
	const bad = (what: string) => new UpdateError('manifest', `${url}: ${what}`);
	if (!m || typeof m !== 'object') throw bad('not an object');
	if (typeof m.version !== 'string') throw bad('no version');
	if (!m.platforms || typeof m.platforms !== 'object') throw bad('no platforms');
	for (const [platform, asset] of Object.entries(m.platforms)) {
		if (!asset || typeof asset.url !== 'string' || typeof asset.sha256 !== 'string') throw bad(`platforms.${platform} needs url and sha256`);
		if (!/^[0-9a-fA-F]{64}$/.test(asset.sha256)) throw bad(`platforms.${platform}.sha256 is not a hex sha256`);
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

function parse_version(version: string): { numbers: number[]; pre: string[] } {
	const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
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

/** A fresh ed25519 pair: `publicKey` goes into `app.update.publicKey`, `privateKey` (PEM) stays a secret. */
export function generate_keys(): { publicKey: string; privateKey: string } {
	const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
		publicKeyEncoding: { type: 'spki', format: 'der' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
	});
	return { publicKey: publicKey.subarray(ED25519_SPKI_PREFIX.length).toString('base64'), privateKey };
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
