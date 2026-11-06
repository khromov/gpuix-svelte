// Packs or publishes packages/ui the way scripts/publish.ts does the root: Node refuses to strip types
// under node_modules, so src/*.ts is compiled to lib/*.js with declarations beside it and `exports`
// points there for the length of `npm pack` / `npm publish`. The peer dependencies go in at the same
// time, because the in-repo manifest cannot carry them: Bun would fetch gpuix-svelte from the registry
// instead of linking the workspace root. The .svelte components ship as they are, under src/components.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = join(root, 'packages/ui');
const manifest = join(pkg, 'package.json');
const lib = join(pkg, 'lib');

const [command, ...rest] = process.argv.slice(2);
if (command !== 'pack' && command !== 'publish') {
	console.error('usage: publish-ui.ts pack <dest> | publish-ui.ts publish [npm publish flags]');
	process.exit(2);
}

const original = readFileSync(manifest, 'utf8');
const json = JSON.parse(original);

function run(cmd: string, args: string[], cwd: string) {
	const { status } = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && cmd !== process.execPath });
	return status ?? 1;
}

function emit_lib() {
	rmSync(lib, { recursive: true, force: true });
	if (run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(pkg, 'tsconfig.lib.json')], root) !== 0) {
		throw new Error('lib emit failed');
	}
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
	for (const [key, value] of Object.entries(out.exports as Record<string, string>)) {
		if (value.endsWith('.ts')) out.exports[key] = lib_for(value);
	}
	out.files = ['lib', 'src/components'];
	delete out.devDependencies;
	// A toolkit release goes with the gpuix-svelte release of the same version; svelte is only the browser side's.
	out.peerDependencies = { 'gpuix-svelte': `^${out.version}`, svelte: '^5.29.0' };
	out.peerDependenciesMeta = { svelte: { optional: true } };
	return JSON.stringify(out, null, '\t') + '\n';
}

let args: string[];
if (command === 'pack') {
	const dest = rest[0] ?? pkg;
	mkdirSync(dest, { recursive: true });
	args = ['pack', '--pack-destination', dest, ...rest.slice(1)];
} else {
	args = ['publish', '--access', 'public', ...rest];
}

// npm ships a LICENSE from the package directory on its own; the repository's is the one.
const license = join(pkg, 'LICENSE');

try {
	emit_lib();
	copyFileSync(join(root, 'LICENSE'), license);
	writeFileSync(manifest, published_manifest());
	process.exitCode = run('npm', args, pkg);
} finally {
	writeFileSync(manifest, original);
	rmSync(lib, { recursive: true, force: true });
	rmSync(license, { force: true });
}
