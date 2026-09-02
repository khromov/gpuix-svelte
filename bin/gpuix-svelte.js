#!/usr/bin/env node
// @ts-check
/**
 * `gpuix-svelte [--bun] [runtime flags] <entry> [args]` — runs the entry with the
 * conditions Svelte's custom renderer needs and the `.svelte` loader installed.
 * `bun run <script>` runs a body that starts with `node` on real Node (Bun only
 * symlinks node→bun under `--bun`), so the runtime is read off how this launcher
 * was invoked rather than off the script text.
 *
 * The one JavaScript file in the package: Node refuses to strip types under a
 * consumer's node_modules, and this is what puts tsx in place for everything else.
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const at = args.findIndex((arg) => !arg.startsWith('--'));
if (at === -1) {
	console.error('usage: gpuix-svelte [--bun] [runtime flags] <entry.ts> [args]');
	process.exit(2);
}

const flags = args.slice(0, at);
const entry = resolve(args[at]);
const rest = args.slice(at + 1);

const bun =
	flags.includes('--bun') ||
	process.versions.bun != null ||
	(process.env.npm_config_user_agent ?? '').startsWith('bun/');

/** @param {string} file */
const src = (file) => new URL(`../src/${file}`, import.meta.url);
const conditions = ['--conditions', 'custom-renderer', '--conditions', 'development'];
// tsx goes first: a `.ts` --import ahead of it would push tsx onto its async off-thread
// hooks, and the `.svelte` hook needs to chain with it synchronously.
const loader = bun
	? ['--preload', fileURLToPath(src('plugin.ts'))]
	: ['--import', import.meta.resolve('tsx'), '--import', src('register.ts').href];

const child = spawn(
	bun ? 'bun' : process.execPath,
	[...flags.filter((flag) => flag !== '--bun'), ...conditions, ...loader, entry, ...rest],
	{
		stdio: 'inherit',
		// Bun is a shim on PATH rather than a resolvable executable on Windows.
		shell: bun && process.platform === 'win32'
	}
);

const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
