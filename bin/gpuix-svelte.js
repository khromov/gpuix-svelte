#!/usr/bin/env node
// @ts-check
/**
 * `gpuix-svelte <entry> [args]` runs on Node or Bun.
 * `bun run <script>` runs a body that starts with `node` on real Node (Bun puts a
 * copy of itself named `node` first on PATH only under `--bun`, or where Node is not
 * installed), so the runtime is read off how this launcher was invoked rather than
 * off the script text.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const at = args.findIndex((arg) => !arg.startsWith('--'));
if (at === -1) {
	console.error('usage: gpuix-svelte [--node|--bun] <entry.ts> [args]\n       gpuix-svelte update keygen | manifest | verify');
	process.exit(2);
}

// Local mobile project generation/building does not enter an app runtime.
if (args[at] === 'mobile') {
	// Mobile builds bundle with Bun; `init` remains usable with Node alone.
	if (!process.versions.bun && args[at + 1] !== 'init') {
		const script = fileURLToPath(import.meta.resolve('gpuix-svelte/mobile-cli'));
		const child = spawn('bun', [script, ...args.slice(at + 1)], { stdio: 'inherit', shell: process.platform === 'win32' });
		child.on('error', (error) => { console.error(`gpuix-svelte: mobile builds require Bun: ${error.message}`); process.exit(1); });
		const code = await new Promise((done) => child.on('exit', (status) => done(status ?? 1)));
		process.exit(code);
	}
	const { run } = await import('gpuix-svelte/mobile-cli');
	await run(args.slice(at + 1));
	process.exit(0);
}

// The release-side commands of gpuix-svelte/update need no runtime flags or loader.
if (args[at] === 'update') {
	const { run } = await import('./update.js');
	await run(args.slice(at + 1));
}

const flags = args.slice(0, at);
const entry = resolve(args[at]);
const rest = args.slice(at + 1);

const bun =
	flags.includes('--bun') ||
	process.versions.bun != null ||
	(process.env.npm_config_user_agent ?? '').startsWith('bun/');

const conditions = ['--conditions', 'custom-renderer', '--conditions', 'development'];
// Through the package's own exports, which are src/*.ts in the repo and lib/*.js once packed.
const loader = bun
	? ['--preload', fileURLToPath(import.meta.resolve('gpuix-svelte/plugin'))]
	: ['--import', import.meta.resolve('gpuix-svelte/register')];

const runtime = (() => {
	if (!bun) return process.execPath;
	// From Node, `bun` is whatever PATH has, which on Windows is a shim only a shell can run.
	if (process.versions.bun == null) return 'bun';
	// Bun named `node`, as `bun run` puts it on PATH where Node is not installed, ignores `--conditions` (oven-sh/bun#44611).
	if (!/^node(\.exe)?$/i.test(basename(process.execPath))) return process.execPath;
	const beside = join(dirname(process.execPath), process.platform === 'win32' ? 'bun.exe' : 'bun');
	return existsSync(beside) ? beside : 'bun';
})();
const shell = runtime === 'bun' && process.platform === 'win32';
// cmd.exe receives one string, so each argument is quoted by hand or a path with a space splits.
const quote = (/** @type {string} */ arg) => (shell ? `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"` : arg);

const child = spawn(runtime, [...flags.filter((flag) => flag !== '--bun' && flag !== '--node'), ...conditions, ...loader, entry, ...rest].map(quote), {
	stdio: 'inherit',
	shell
});

const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('error', (error) => {
	console.error(`gpuix-svelte: could not start ${runtime}: ${error.message}${runtime === 'bun' ? '; install Bun and put `bun` on PATH' : ''}`);
	process.exit(1);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
