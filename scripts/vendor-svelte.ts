// pkg.svelte.dev loses a build once a force-push removes its commit (this PR is
// rebased on every update), so the svelte this package runs on lives under vendor/.

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PR = 18511;

const root = fileURLToPath(new URL('..', import.meta.url));
const vendor = join(root, 'vendor');

const { head } = await get(`https://api.github.com/repos/sveltejs/svelte/pulls/${PR}`).then((r) => r.json());
const sha = head.sha;
const short = sha.slice(0, 7);

const current = readdirSync(vendor).find((f) => f.endsWith(`-${short}.tgz`));
if (current) {
	console.log(`vendor/${current} is already the PR head (${sha})`);
	process.exit(0);
}

const { version } = await get(
	`https://raw.githubusercontent.com/sveltejs/svelte/${sha}/packages/svelte/package.json`
).then((r) => r.json());
const tarball = await get(`https://pkg.svelte.dev/svelte/c/${sha}`).then((r) => r.arrayBuffer());

for (const f of readdirSync(vendor)) {
	if (f.endsWith('.tgz')) rmSync(join(vendor, f));
}
const name = `svelte-${version}-${short}.tgz`;
writeFileSync(join(vendor, name), Buffer.from(tarball));

const manifest = join(root, 'package.json');
const json = JSON.parse(readFileSync(manifest, 'utf8'));
json.devDependencies.svelte = `file:vendor/${name}`;
writeFileSync(manifest, JSON.stringify(json, null, '\t') + '\n');
execSync('npm install', { cwd: root, stdio: 'inherit' });

console.log(`\nsvelte ${version} @ ${sha} -> vendor/${name}\nnow run: npm test && npm run bun:test`);

async function get(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url} -> ${res.status} ${res.statusText}`);
	return res;
}
