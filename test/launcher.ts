/**
 * bin/gpuix-svelte.js on a copy of Bun named `node`, which `bun run` puts first on PATH where Node is not installed
 * and which ignores `--conditions` (oven-sh/bun#44611), so without the bin's detour `svelte` resolves to its server build.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, linkSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, finish } from 'gpuix-svelte/test';

const win32 = process.platform === 'win32';
const exe = win32 ? '.exe' : '';
const bin = fileURLToPath(new URL('../bin/gpuix-svelte.js', import.meta.url));
const entry = fileURLToPath(new URL('./launcher-entry.ts', import.meta.url));

// The real Bun under either runtime; on Windows `bun` can be a .cmd shim, which only a shell runs.
const found = spawnSync('bun', ['-e', 'console.log(process.execPath)'], { encoding: 'utf8', shell: win32 });
if (found.status !== 0) {
	console.error(`launcher: needs \`bun\` on PATH (${found.error?.message ?? found.stderr.trim()})`);
	process.exit(1);
}
const bun = found.stdout.trim();

// On macOS tmpdir() is under the /var symlink and on Windows CI it is an 8.3 short name, while Bun reports resolved paths.
const real = (path: string) => realpathSync.native(path);

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

function launch(env?: NodeJS.ProcessEnv): { svelte: string; runtime: string } | string {
	const { stdout, stderr, status } = spawnSync(node, [bin, entry], { encoding: 'utf8', timeout: 60_000, env });
	try {
		return JSON.parse(stdout.trim().split('\n').at(-1) ?? '');
	} catch {
		return `exit ${status}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`;
	}
}

const client = (result: ReturnType<typeof launch>) => (typeof result === 'string' ? result : basename(fileURLToPath(result.svelte)));
const runtime = (result: ReturnType<typeof launch>) => (typeof result === 'string' ? result : real(result.runtime));

try {
	const first = launch();
	check('Bun named node: svelte resolves to its custom-renderer build', client(first), 'index-client.js');
	check('Bun named node: the entry runs on the copy named bun beside it', runtime(first), real(beside));

	rmSync(beside);
	const fallback = launch();
	check('Bun named node with no bun beside it: the custom-renderer build', client(fallback), 'index-client.js');
	check('Bun named node with no bun beside it: the entry runs on bun from PATH', runtime(fallback), real(bun));

	// cmd.exe reports a missing `bun` itself, and Windows spells the variable Path.
	if (!win32) {
		const said = 'exit 1: gpuix-svelte: could not start bun:';
		const missing = launch({ ...process.env, PATH: dir });
		check('Bun named node with no bun anywhere: the bin says so and exits 1', typeof missing === 'string' ? missing.slice(0, said.length) : missing, said);
	}
} finally {
	rmSync(dir, { recursive: true, force: true });
}

finish('launcher', win32 ? 4 : 5);
