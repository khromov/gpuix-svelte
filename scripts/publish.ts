// The repo installs svelte from vendor/, but Bun refuses a `file:` spec in a published
// manifest even with the bundle in place, so the registry range exists only for the length
// of `npm pack` / `npm publish` — a wrapper rather than prepack/postpack, because
// `npm publish` re-reads the manifest after postpack has restored it. The same window
// emits declarations into dts/ and points `types` conditions at them, so consumers can
// typecheck without `allowImportingTsExtensions` while the runtime still loads src/*.ts.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLISHED_SPEC = '>=5.56.0';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = join(root, 'package.json');
const dts = join(root, 'dts');

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
if (!installed.exports?.['./renderer']) throw new Error('node_modules/svelte is not the custom-renderer build — run npm install');

function run(cmd: string, args: string[]) {
	const { status } = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
	return status ?? 1;
}

function emit_declarations() {
	rmSync(dts, { recursive: true, force: true });
	if (run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.dts.json']) !== 0) {
		throw new Error('declaration emit failed');
	}
	// tsc keeps the sources' `./x.ts` specifiers, which only resolve under allowImportingTsExtensions.
	for (const file of readdirSync(dts)) {
		const path = join(dts, file);
		writeFileSync(path, readFileSync(path, 'utf8').replace(/(['"])(\.\.?\/[^'"]+)\.ts\1/g, '$1$2.js$1'));
	}
}

function types_for(target: string) {
	const out = target.replace(/^(\.\/)?src\/(.+)\.ts$/, './dts/$2.d.ts');
	if (out === target) throw new Error(`no declaration path for ${target}`);
	return out;
}

function published_manifest() {
	const out = structuredClone(json);
	out.dependencies.svelte = PUBLISHED_SPEC;
	out.types = types_for(out.main);
	out.files = [...out.files, 'dts'];
	for (const [key, value] of Object.entries(out.exports as Record<string, unknown>)) {
		if (typeof value === 'string' && value.endsWith('.ts')) {
			out.exports[key] = { types: types_for(value), default: value };
		} else if (key === '.' && value && typeof value === 'object') {
			out.exports[key] = { types: types_for(out.main), ...value };
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
	emit_declarations();
	writeFileSync(manifest, published_manifest());
	process.exitCode = run('npm', args);
} finally {
	writeFileSync(manifest, original);
	rmSync(dts, { recursive: true, force: true });
}
