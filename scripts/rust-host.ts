/**
 * `demo:rust-host`: build the Rust host if needed and run it, with the gpuix-svelte UI as
 * the child it spawns. The host is the parent process; the window belongs to the child.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const crate = join(root, 'examples/rust-host/rust');
const exe = process.platform === 'win32' ? '.exe' : '';
const host = join(crate, 'target/release', `rust-host${exe}`);

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

const source = statSync(join(crate, 'src/main.rs')).mtimeMs;
if (!existsSync(host) || statSync(host).mtimeMs < source) {
	execFileSync(cargo(), ['build', '--release'], { cwd: crate, stdio: ['ignore', 'ignore', 'inherit'] });
}

const bun = process.argv.includes('--bun');
const ui = [join(root, 'bin/gpuix-svelte.js'), ...(bun ? ['--bun'] : []), join(root, 'examples/rust-host/ui/main.ts')];
const { status } = spawnSync(host, [process.execPath, ...ui], { stdio: 'inherit' });
process.exit(status ?? 1);
