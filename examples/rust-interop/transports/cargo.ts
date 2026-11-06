/**
 * Builds the Rust workspace once and finds its artifacts, like `glass.ts` compiles its
 * ObjC shim: the point of the example is that nothing here touches @gpuix/native.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUST_DIR = fileURLToPath(new URL('../rust/', import.meta.url));
const TARGET = join(RUST_DIR, 'target');
const NATIVE = join(TARGET, 'release');
const WASM = join(TARGET, 'wasm32-unknown-unknown', 'release');

const exe = process.platform === 'win32' ? '.exe' : '';
const dylib = (name: string) =>
	process.platform === 'win32' ? `${name}.dll` : process.platform === 'darwin' ? `lib${name}.dylib` : `lib${name}.so`;

export const ARTIFACTS = {
	stdio: join(NATIVE, `hello-stdio${exe}`),
	ffi: join(NATIVE, dylib('hello_ffi')),
	napi: join(NATIVE, 'hello_napi.node'),
	wasm: join(WASM, 'hello_wasm.wasm')
};

function cargo(): string {
	if (process.env.CARGO) return process.env.CARGO;
	for (const candidate of ['cargo', join(homedir(), '.cargo', 'bin', `cargo${exe}`)]) {
		try {
			execFileSync(candidate, ['--version'], { stdio: 'ignore' });
			return candidate;
		} catch {
			// not this one
		}
	}
	throw new Error('cargo not found: install Rust from https://rustup.rs, or set CARGO to the binary');
}

function newest_source(dir: string): number {
	let newest = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'target') continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) newest = Math.max(newest, newest_source(path));
		else if (/\.(rs|toml)$/.test(entry.name)) newest = Math.max(newest, statSync(path).mtimeMs);
	}
	return newest;
}

function stale(path: string, sources: number): boolean {
	return !existsSync(path) || statSync(path).mtimeMs < sources;
}

/** Builds whatever is missing or older than the sources. Cargo's output goes to stderr. */
export function ensure_built(): typeof ARTIFACTS {
	const sources = newest_source(RUST_DIR);
	const bin = cargo();
	const run = (args: string[]) => {
		console.error(`[rust-interop] ${bin} ${args.join(' ')}`);
		execFileSync(bin, args, {
			cwd: RUST_DIR,
			stdio: ['ignore', 'ignore', 'inherit'],
			env: { ...process.env, RUSTC_VERSION: rustc_version(bin) }
		});
	};

	const napi_dylib = join(NATIVE, dylib('hello_napi'));
	if ([ARTIFACTS.stdio, ARTIFACTS.ffi, napi_dylib].some((p) => stale(p, sources))) {
		run(['build', '--release', '--workspace', '--exclude', 'hello-wasm']);
	}
	// Node's require() picks a loader by extension, so the addon needs the `.node` name.
	if (stale(ARTIFACTS.napi, statSync(napi_dylib).mtimeMs)) copyFileSync(napi_dylib, ARTIFACTS.napi);

	if (stale(ARTIFACTS.wasm, sources)) {
		run(['build', '--release', '-p', 'hello-wasm', '--target', 'wasm32-unknown-unknown']);
	}
	return ARTIFACTS;
}

function rustc_version(bin: string): string {
	const out = execFileSync(bin, ['--version'], { encoding: 'utf8' });
	return out.split(/\s+/)[1] ?? 'unknown';
}
