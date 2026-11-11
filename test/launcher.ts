/**
 * bin/gpuix-svelte.js on a copy of Bun named `node`, which is what `bun run` puts first on PATH
 * where Node is not installed, and what `bun --bun run` always uses. Bun by that name accepts
 * `--conditions` but resolves without them (oven-sh/bun#44611), so the bin has to hand the entry to
 * the copy named `bun` beside it, or to `bun` on PATH when there is none, or `svelte` resolves to
 * its server build and `mount()` does not exist. No headless renderer, so it runs on Linux too, and
 * it needs `bun` on PATH under Node.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, linkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, finish } from 'gpuix-svelte/test';

const win32 = process.platform === 'win32';
const exe = win32 ? '.exe' : '';
const bin = fileURLToPath(new URL('../bin/gpuix-svelte.js', import.meta.url));
const entry = fileURLToPath(new URL('./launcher-entry.ts', import.meta.url));

// The real Bun under either runtime; on Windows `bun` can be a .cmd shim, which only a shell runs.
const bun = spawnSync('bun', ['-e', 'console.log(process.execPath)'], { encoding: 'utf8', shell: win32 }).stdout.trim();

// One binary under two names, as Bun lays it out: a hard link, or a copy across volumes.
const dir = mkdtempSync(join(tmpdir(), 'gpuix-bun-node-'));
function place(name: string): string {
	const to = join(dir, name + exe);
	try {
		linkSync(bun, to);
	} catch {
		copyFileSync(bun, to);
	}
	return to;
}
const node = place('node');
const beside = place('bun');

function launch(): { svelte: string; runtime: string } | string {
	const { stdout, stderr, status } = spawnSync(node, [bin, entry], { encoding: 'utf8', timeout: 60_000 });
	try {
		return JSON.parse(stdout.trim().split('\n').at(-1) ?? '');
	} catch {
		return `exit ${status}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`;
	}
}

const client = (result: ReturnType<typeof launch>) => (typeof result === 'string' ? result : basename(fileURLToPath(result.svelte)));

try {
	const first = launch();
	check('Bun named node: svelte resolves to its custom-renderer build', client(first), 'index-client.js');
	check('Bun named node: the entry runs on the copy named bun beside it', typeof first === 'string' ? first : first.runtime, beside);

	rmSync(beside);
	check('Bun named node with no bun beside it: bun from PATH, and the custom-renderer build', client(launch()), 'index-client.js');
} finally {
	rmSync(dir, { recursive: true, force: true });
}

finish('launcher', 3);
