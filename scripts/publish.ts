// Node refuses to strip types under node_modules, so for the length of `npm pack` / `npm publish`
// src/*.ts is compiled to lib/*.js with declarations beside them and `exports` points there — a
// wrapper rather than prepack/postpack, because `npm publish` re-reads the manifest after postpack
// has restored it.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = join(root, 'package.json');
const lib = join(root, 'lib');

const [command, ...rest] = process.argv.slice(2);
if (command !== 'pack' && command !== 'publish') {
	console.error('usage: publish.ts pack <dest> | publish.ts publish [npm publish flags]');
	process.exit(2);
}

const original = readFileSync(manifest, 'utf8');
const json = JSON.parse(original);

function run(cmd: string, args: string[]) {
	const { status } = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && cmd !== process.execPath });
	return status ?? 1;
}

function emit_lib() {
	rmSync(lib, { recursive: true, force: true });
	if (run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.lib.json']) !== 0) {
		throw new Error('lib emit failed');
	}
	// tsc never copies a hand-written .d.ts, and html.d.ts reaches into types.ts.
	copyFileSync(join(root, 'src/html.d.ts'), join(lib, 'html.d.ts'));
	// tsc rewrites the JS specifiers but keeps the declarations' `./x.ts`, which only resolve under allowImportingTsExtensions.
	for (const file of readdirSync(lib).filter((f) => f.endsWith('.d.ts'))) {
		const path = join(lib, file);
		writeFileSync(path, readFileSync(path, 'utf8').replace(/(['"])(\.\.?\/[^'"]+)\.ts\1/g, '$1$2.js$1'));
	}
}

function lib_for(target: string) {
	const out = target.replace(/^(\.\/)?src\/(.+)\.ts$/, './lib/$2.js');
	if (out === target) throw new Error(`no lib path for ${target}`);
	return out;
}

// Conditions nest (`.` picks the DOM build under `default`), and `.svelte` pattern targets ship as they are.
function published_target(value: unknown): unknown {
	if (typeof value === 'string') return value.endsWith('.ts') ? lib_for(value) : value;
	return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([condition, target]) => [condition, published_target(target)]));
}

// TypeScript finds each lib/x.d.ts beside its lib/x.js, so no `types` conditions are needed.
function published_manifest() {
	const out = structuredClone(json);
	out.main = lib_for(out.main);
	// The workspace is the repository's; an installed copy is not a workspace root.
	delete out.workspaces;
	out.files = ['lib', 'src/components', 'bin', 'assets/icon.png'];
	for (const [key, value] of Object.entries(out.exports as Record<string, unknown>)) {
		out.exports[key] = key === './html' ? { types: './lib/html.d.ts' } : published_target(value);
	}
	return JSON.stringify(out, null, '\t') + '\n';
}

let args: string[];
if (command === 'pack') {
	const dest = rest[0] ?? root;
	mkdirSync(dest, { recursive: true });
	args = ['pack', '--pack-destination', dest, ...rest.slice(1)];
} else {
	args = ['publish', '--access', 'public', ...rest];
}

try {
	emit_lib();
	writeFileSync(manifest, published_manifest());
	process.exitCode = run('npm', args);
} finally {
	writeFileSync(manifest, original);
	rmSync(lib, { recursive: true, force: true });
}
