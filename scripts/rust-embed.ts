/**
 * `demo:rust-embed`: one Rust binary with Deno embedded running the gpuix-svelte view.
 * Bundles the view with Bun, builds the crate, and runs it on the bundle.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const crate = join(root, 'examples/rust-embed/rust');
const exe = process.platform === 'win32' ? '.exe' : '';
const binary = join(crate, 'target/release', `rust-embed${exe}`);
const bundle = join(root, 'dist/embed/boot.mjs');

function cargo(): string {
	for (const candidate of [process.env.CARGO, 'cargo', join(homedir(), '.cargo/bin', `cargo${exe}`)]) {
		if (!candidate) continue;
		try {
			execFileSync(candidate, ['--version'], { stdio: 'ignore' });
			return candidate;
		} catch {
			// next
		}
	}
	throw new Error('cargo not found: install Rust from https://rustup.rs, or set CARGO');
}

const run = (cmd: string, args: string[], cwd = root, env?: Record<string, string>) => {
	console.error(`[rust-embed] ${cmd} ${args.join(' ')}`);
	execFileSync(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...env } });
};

run('bun', ['examples/rust-embed/bundle.ts']);

const bin = cargo();

const source = statSync(join(crate, 'src/main.rs')).mtimeMs;
if (!existsSync(binary) || statSync(binary).mtimeMs < source) {
	const rustc = execFileSync(bin.replace(/cargo(\.exe)?$/, 'rustc$1'), ['--version'], { encoding: 'utf8' }).split(/\s+/)[1] ?? 'unknown';
	run(bin, ['build', '--release'], crate, { RUSTC_VERSION: rustc });
}

const { status } = spawnSync(binary, [bundle], { stdio: 'inherit' });
process.exit(status ?? 1);
