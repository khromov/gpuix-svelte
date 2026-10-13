// The repo installs svelte from vendor/, but Bun refuses a `file:` spec in a published
// manifest even with the bundle in place, so the registry range exists only for the length
// of `npm pack` / `npm publish` — a wrapper rather than prepack/postpack, because
// `npm publish` re-reads the manifest after postpack has restored it. The same window
// compiles src/*.ts to lib/*.js with declarations beside them and points `exports` there,
// because Node refuses to strip types under node_modules and a consumer would need tsx.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLISHED_SPEC = '>=5.56.0';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = join(root, 'package.json');
const lib = join(root, 'lib');

const [command, ...rest] = process.argv.slice(2);
if (command !== 'pack' && command !== 'publish') {
	console.error('usage: publish.ts pack <dest> | publish.ts publish [npm publish flags]');
	process.exit(2);
}

const vendored = readdirSync(join(root, 'vendor')).filter((f) => f.endsWith('.tgz'));
if (vendored.length !== 1) throw new Error(`expected exactly one tarball under vendor/, found ${vendored.length}`);
const vendored_spec = `file:vendor/${vendored[0]}`;

const original = readFileSync(manifest, 'utf8');
const json = JSON.parse(original);
if (json.dependencies.svelte !== vendored_spec) throw new Error(`package.json has svelte ${json.dependencies.svelte}, expected ${vendored_spec}`);
if (!json.bundleDependencies?.includes('svelte')) throw new Error('svelte is not in bundleDependencies');

const installed = JSON.parse(readFileSync(join(root, 'node_modules/svelte/package.json'), 'utf8'));
if (!installed.exports?.['./renderer']) throw new Error('node_modules/svelte is not the custom-renderer build — run bun install');

function run(cmd: string, args: string[]) {
	const { status } = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
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

// TypeScript finds each lib/x.d.ts beside its lib/x.js, so no `types` conditions are needed.
function published_manifest() {
	const out = structuredClone(json);
	out.dependencies.svelte = PUBLISHED_SPEC;
	out.main = lib_for(out.main);
	out.files = ['lib', 'src/components', 'bin'];
	for (const [key, value] of Object.entries(out.exports as Record<string, unknown>)) {
		if (typeof value === 'string' && value.endsWith('.ts')) {
			out.exports[key] = lib_for(value);
		} else if (key === './html') {
			out.exports[key] = { types: './lib/html.d.ts' };
		} else if (key === '.' && value && typeof value === 'object') {
			out.exports[key] = Object.fromEntries(Object.entries(value).map(([condition, target]) => [condition, lib_for(target as string)]));
		}
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
