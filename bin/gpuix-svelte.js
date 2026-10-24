#!/usr/bin/env node
// @ts-check
/**
 * `gpuix-svelte [--bun] [runtime flags] <entry> [args]` — runs the entry with the
 * conditions Svelte's custom renderer needs and the `.svelte` loader installed.
 * `bun run <script>` runs a body that starts with `node` on real Node (Bun only
 * symlinks node→bun under `--bun`), so the runtime is read off how this launcher
 * was invoked rather than off the script text.
 *
 * `gpuix-svelte --qjs <entry> [--production] [--build-only] [--out <dir>] [-- args]` and
 * `gpuix-svelte --qjs <entry> --compile [--outfile <path>] [--app [--icon <png>] [--id <id>]]`
 * are the QuickJS path instead: `bun <gpuix-svelte/qjs> ...`, which bundles the entry and
 * runs it on the `gpuix-qjs` host, or packs it. Its flags may sit on either side of the
 * entry. Bun is the bundler there whatever launched this, so it needs one on PATH — the
 * `bun` npm package puts one in node_modules/.bin, which npm scripts see.
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const at = args.findIndex((arg) => !arg.startsWith('--'));
if (at === -1) {
	console.error('usage: gpuix-svelte [--bun] [runtime flags] <entry.ts> [args]\n       gpuix-svelte --qjs <entry.ts> [--production] [--build-only] [--out <dir>] [-- args]');
	process.exit(2);
}

const flags = args.slice(0, at);
const entry = resolve(args[at]);
const rest = args.slice(at + 1);

const bun =
	flags.includes('--bun') ||
	process.versions.bun != null ||
	(process.env.npm_config_user_agent ?? '').startsWith('bun/');

const qjs = flags.includes('--qjs');

const conditions = ['--conditions', 'custom-renderer', '--conditions', 'development'];
// Through the package's own exports, which are src/*.ts in the repo and lib/*.js once packed.
const loader = bun
	? ['--preload', fileURLToPath(import.meta.resolve('gpuix-svelte/plugin'))]
	: ['--import', import.meta.resolve('gpuix-svelte/register')];

// Bun is a shim on PATH rather than a resolvable executable on Windows, so a bare `bun`
// goes through cmd.exe there; under cmd, arguments with spaces (a path under `C:\Users\Jane
// Doe`) have to be quoted by hand. A real executable path never needs the shell.
const quote = (/** @type {string} */ arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
const via_shell = (/** @type {string} */ command) => command === 'bun' && process.platform === 'win32';
const launch = (/** @type {string} */ command, /** @type {string[]} */ args) =>
	spawn(command, via_shell(command) ? args.map(quote) : args, { stdio: 'inherit', shell: via_shell(command) });

const child = qjs
	? // The qjs flags may precede the entry; only the runtime selectors are this launcher's.
		launch(process.versions.bun ? process.execPath : 'bun', [
			fileURLToPath(import.meta.resolve('gpuix-svelte/qjs')),
			...flags.filter((flag) => flag !== '--qjs' && flag !== '--bun'),
			entry,
			...rest
		])
	: launch(bun ? 'bun' : process.execPath, [...flags.filter((flag) => flag !== '--bun'), ...conditions, ...loader, entry, ...rest]);

child.on('error', (error) => {
	if (qjs && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
		console.error('[gpuix-svelte] --qjs needs Bun to bundle: install it, or `npm i -D bun` for one in node_modules/.bin');
	} else {
		console.error(`[gpuix-svelte] failed to start: ${error.message}`);
	}
	process.exit(1);
});

const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
