#!/usr/bin/env node
/**
 * `gpuix-svelte [--bun] [runtime flags] <entry> [args]` — runs the entry with the
 * conditions Svelte's custom renderer needs and the `.svelte` loader installed.
 * `bun run <script>` runs a body that starts with `node` on real Node (Bun only
 * symlinks node→bun under `--bun`), so the runtime is read off how this launcher
 * was invoked rather than off the script text.
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const at = args.findIndex((arg) => !arg.startsWith('--'));
if (at === -1) {
	console.error('usage: gpuix-svelte [--bun] [runtime flags] <entry.js> [args]');
	process.exit(2);
}

const flags = args.slice(0, at);
const entry = resolve(args[at]);
const rest = args.slice(at + 1);

const bun =
	flags.includes('--bun') ||
	process.versions.bun != null ||
	(process.env.npm_config_user_agent ?? '').startsWith('bun/');

const src = (file) => fileURLToPath(new URL(`../src/${file}`, import.meta.url));
const conditions = ['--conditions', 'custom-renderer', '--conditions', 'development'];
const loader = bun ? ['--preload', src('plugin.js')] : ['--import', pathToFileURL(src('register.js')).href];

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
