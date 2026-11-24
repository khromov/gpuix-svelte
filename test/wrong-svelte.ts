/**
 * A copy of the package with no svelte beside it, and one with Svelte 4: the loader has to stop with WRONG_SVELTE
 * before it loads compile.ts, whose own import of svelte/compiler would fail first and say less.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WRONG_SVELTE } from '../src/loader-config.ts';
import { check, finish } from 'gpuix-svelte/test';

const root = fileURLToPath(new URL('..', import.meta.url));

const SVELTE_4 = {
	'package.json': JSON.stringify({ name: 'svelte', version: '4.2.19', type: 'module', exports: { '.': './index.js', './compiler': './compiler.js', './package.json': './package.json' } }),
	'index.js': "export const VERSION = '4.2.19';\n",
	'compiler.js': "export const VERSION = '4.2.19';\n"
};

const dirs: string[] = [];
// Outside the repository, so no svelte above it can stand in for the one missing.
function run_beside(svelte: Record<string, string> | null) {
	const dir = mkdtempSync(join(tmpdir(), 'gpuix-wrong-svelte-'));
	dirs.push(dir);
	for (const part of ['package.json', 'bin', 'src']) cpSync(join(root, part), join(dir, part), { recursive: true });
	// An app always has one, and without it Bun would fetch the missing svelte from its own cache.
	mkdirSync(join(dir, 'node_modules'));
	if (svelte) {
		mkdirSync(join(dir, 'node_modules/svelte'));
		for (const [name, text] of Object.entries(svelte)) writeFileSync(join(dir, 'node_modules/svelte', name), text);
	}
	writeFileSync(join(dir, 'entry.ts'), '');
	return spawnSync(process.execPath, [join(dir, 'bin/gpuix-svelte.js'), ...(process.versions.bun ? ['--bun'] : []), 'entry.ts'], { cwd: dir, encoding: 'utf8' });
}

const missing = run_beside(null);
check('no svelte at all stops the bin with the message naming the version', [missing.status !== 0, missing.stderr.includes(WRONG_SVELTE)], [true, true]);
const old = run_beside(SVELTE_4);
check('and so does Svelte 4, whose compiler has no compileModule', [old.status !== 0, old.stderr.includes(WRONG_SVELTE)], [true, true]);

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
finish('wrong-svelte', 2);
