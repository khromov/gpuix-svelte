// The repo installs svelte from vendor/, but Bun refuses a `file:` spec in a published
// manifest even with the bundle in place, so the registry range exists only for the length
// of `npm pack` / `npm publish` — a wrapper rather than prepack/postpack, because
// `npm publish` re-reads the manifest after postpack has restored it.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLISHED_SPEC = '>=5.56.0';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = join(root, 'package.json');

const [command, ...rest] = process.argv.slice(2);
if (command !== 'pack' && command !== 'publish') {
	console.error('usage: publish.ts pack <dest> | publish.ts publish [npm publish flags]');
	process.exit(2);
}

const vendored = readdirSync(join(root, 'vendor')).filter((f) => f.endsWith('.tgz'));
if (vendored.length !== 1) throw new Error(`expected exactly one tarball under vendor/, found ${vendored.length}`);
const vendored_spec = `file:vendor/${vendored[0]}`;

const json = JSON.parse(readFileSync(manifest, 'utf8'));
if (json.dependencies.svelte !== vendored_spec) throw new Error(`package.json has svelte ${json.dependencies.svelte}, expected ${vendored_spec}`);
if (!json.bundleDependencies?.includes('svelte')) throw new Error('svelte is not in bundleDependencies');

const installed = JSON.parse(readFileSync(join(root, 'node_modules/svelte/package.json'), 'utf8'));
if (!installed.exports?.['./renderer']) throw new Error('node_modules/svelte is not the custom-renderer build — run npm install');

const write = (spec: string) => {
	json.dependencies.svelte = spec;
	writeFileSync(manifest, JSON.stringify(json, null, '\t') + '\n');
};

let args: string[];
if (command === 'pack') {
	const dest = rest[0] ?? root;
	mkdirSync(dest, { recursive: true });
	args = ['pack', '--pack-destination', dest, ...rest.slice(1)];
} else {
	args = ['publish', '--access', 'public', ...rest];
}

write(PUBLISHED_SPEC);
try {
	const { status } = spawnSync('npm', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
	process.exitCode = status ?? 1;
} finally {
	write(vendored_spec);
}
