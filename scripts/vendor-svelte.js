// pkg.svelte.dev loses a build once a force-push removes its commit (this PR is
// rebased on every update), so the svelte this package runs on lives under vendor/.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/sveltejs/svelte.git';
const PR = 18511;
const PREVIEW = 'https://pkg.svelte.dev/svelte/c/';

const root = fileURLToPath(new URL('..', import.meta.url));
const vendor = join(root, 'vendor');

const args = process.argv.slice(2);
const force = args.includes('--force');
const build = args.includes('--build');
const ref = args.find((a) => !a.startsWith('--'));

const sh = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit', shell: true });
const out = (cmd, cwd = root) => execSync(cmd, { cwd, encoding: 'utf8', shell: true }).trim();

// GitHub serves any reachable commit by full sha but cannot expand short ones.
const sha = /^[0-9a-f]{40}$/.test(ref ?? '')
	? ref
	: out(`git ls-remote ${REPO} ${ref ?? `refs/pull/${PR}/head`}`).split(/\s/)[0];
if (!sha) {
	console.error(`could not resolve ${ref ?? `PR #${PR}`} on ${REPO}; pass a ref or a full sha`);
	process.exit(1);
}
const short = sha.slice(0, 7);

mkdirSync(vendor, { recursive: true });
const current = readdirSync(vendor).find((f) => f.endsWith(`-${short}.tgz`));
if (current && !force) {
	console.log(`vendor/${current} is already ${sha}; pass --force to fetch it again`);
	process.exit(0);
}

const tmp = join(vendor, `.svelte-${short}.tgz`);
if (build || !(await download(sha, tmp))) build_from_source(sha, tmp);

const version = JSON.parse(out(`tar -xzOf "${tmp}" package/package.json`)).version;
const name = `svelte-${version}-${short}.tgz`;
renameSync(tmp, join(vendor, name));
for (const f of readdirSync(vendor)) {
	if (f !== name && /^svelte-.*\.tgz$/.test(f)) rmSync(join(vendor, f));
}

const manifest = join(root, 'package.json');
const json = JSON.parse(readFileSync(manifest, 'utf8'));
json.devDependencies.svelte = `file:vendor/${name}`;
writeFileSync(manifest, JSON.stringify(json, null, '\t') + '\n');

// npm trusts the lock's integrity for an unchanged `file:` spec, so make it re-resolve.
const lockfile = join(root, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockfile, 'utf8'));
delete lock.packages['node_modules/svelte'];
writeFileSync(lockfile, JSON.stringify(lock, null, '\t') + '\n');
rmSync(join(root, 'node_modules', 'svelte'), { recursive: true, force: true });
sh('npm install');
console.log(`\nsvelte ${version} @ ${sha} -> vendor/${name}\nnow run: npm test && npm run bun:test`);

async function download(sha, to) {
	const res = await fetch(PREVIEW + sha);
	if (!res.ok) {
		console.log(`${PREVIEW}${sha} -> ${res.status}; building from source instead`);
		return false;
	}
	writeFileSync(to, Buffer.from(await res.arrayBuffer()));
	console.log(`downloaded ${PREVIEW}${sha}`);
	return true;
}

function build_from_source(sha, to) {
	const work = join(tmpdir(), 'gpuix-svelte-vendor');
	console.log(`fetching sveltejs/svelte@${sha} into ${work}`);
	mkdirSync(work, { recursive: true });
	if (!existsSync(join(work, '.git'))) sh('git init -q', work);
	sh(`git fetch -q --depth 1 ${REPO} ${sha}`, work);
	sh('git checkout -q -f --detach FETCH_HEAD', work);

	let pnpm = 'pnpm';
	try {
		out('pnpm --version');
	} catch {
		pnpm = 'npx --yes pnpm@10';
	}
	const pkg = join(work, 'packages', 'svelte');
	sh(`${pnpm} install --frozen-lockfile`, work);
	sh(`${pnpm} build`, pkg);
	sh(`${pnpm} pack --pack-destination "${vendor}"`, pkg);
	const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;
	renameSync(join(vendor, `svelte-${version}.tgz`), to);
	console.log(`samples for test:coverage: ${join(pkg, 'tests', 'custom-renderers', 'samples')}`);
}
