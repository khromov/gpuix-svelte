#!/usr/bin/env node
// @ts-check
/**
 * `npm create gpuix-svelte [dir] [--github owner/repo | --no-github]` — copies the starter into
 * `dir` and pins the gpuix-svelte release this scaffolder was published with. The GitHub release
 * workflow (release-please, binaries for every platform, the update manifest) is offered as a
 * question, or decided by the flags; with a repository named, the app's update URL is filled in.
 */

import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
// Published, the starter sits in template/; in the repo it is read straight from starter/.
const template = [join(here, 'template'), join(here, '../../starter')].find((dir) => existsSync(join(dir, 'App.svelte')));
if (!template) throw new Error('create-gpuix-svelte: the starter template is missing');

const SKIP = new Set(['node_modules', 'package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']);
// What `--no-github` leaves out: the release workflow and release-please's two files.
const GITHUB_FILES = ['.github', 'release-please-config.json', '.release-please-manifest.json'];
const REPO = /^[\w.-]+\/[\w.-]+$/;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
	console.log(`usage: npm create gpuix-svelte@latest [directory] [--github owner/repo | --no-github]

  --github owner/repo   keep the GitHub release workflow and point the app's update manifest at that
                        repository's releases; --github alone keeps the workflow and leaves the URL for later
  --no-github           leave the workflow and release-please files out
  Without either, an interactive run asks, and a scripted one keeps the workflow.`);
	process.exit(0);
}
const github_at = argv.indexOf('--github');
const github_value = github_at === -1 ? undefined : argv[github_at + 1] && !argv[github_at + 1].startsWith('-') ? argv[github_at + 1] : '';
if (github_value && !REPO.test(github_value)) {
	console.error(`--github takes owner/repo, not ${github_value}`);
	process.exit(1);
}
const arg = argv.find((a, i) => !a.startsWith('-') && argv[i - 1] !== '--github');

const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
const ask = async (/** @type {string} */ question, fallback = '') => ((await rl?.question(question))?.trim() || fallback);

const target = resolve(arg ?? (await ask('Project directory (gpuix-svelte-app): ', 'gpuix-svelte-app')));
if (existsSync(target) && readdirSync(target).length > 0) {
	console.error(`${target} exists and is not empty`);
	process.exit(1);
}

/** @type {{ workflow: boolean, repo?: string }} */
let github = { workflow: true, repo: github_value || undefined };
if (argv.includes('--no-github')) {
	github = { workflow: false };
} else if (github_at === -1 && rl) {
	const yes = (await ask('Add a GitHub Actions release workflow? release-please cuts versions, every platform builds, and the app can update itself (Y/n): ', 'y')).toLowerCase();
	github = { workflow: yes !== 'n' && yes !== 'no' };
	if (github.workflow) {
		const repo = await ask('GitHub repository, owner/name, for the update manifest URL (Enter to fill in later): ');
		if (repo && !REPO.test(repo)) console.log(`  "${repo}" is not owner/name; leaving the URL for later`);
		else if (repo) github.repo = repo;
	}
}
rl?.close();

cpSync(template, target, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
if (!github.workflow) for (const file of GITHUB_FILES) rmSync(join(target, file), { recursive: true, force: true });

const own = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const manifest = join(target, 'package.json');
const json = JSON.parse(readFileSync(manifest, 'utf8'));
json.name = basename(target).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
json.dependencies['gpuix-svelte'] = `^${own.version}`;
writeFileSync(manifest, JSON.stringify(json, null, '\t') + '\n');
// The window title and the app's identifier take the project's name, so `build` makes <name>.app;
// a bundle identifier allows only letters, digits, `-` and `.`.
const identifier = json.name.replace(/[^a-z0-9.-]+/g, '-');
for (const file of ['app.ts', 'standalone.ts']) {
	const path = join(target, file);
	let source = readFileSync(path, 'utf8').replaceAll('gpuix-svelte starter', json.name).replaceAll('gpuix-svelte-starter', identifier);
	// With the repository known, the built app checks that release's manifest from the first build.
	if (github.repo) source = source.replace("// update: { manifest: 'https://github.com/<owner>/<repo>/", `update: { manifest: 'https://github.com/${github.repo}/`);
	writeFileSync(path, source);
}
// npm strips .gitignore from published tarballs, so the scaffolder writes it.
writeFileSync(join(target, '.gitignore'), 'node_modules\ndist\n.env\n.DS_Store\nupdate-key.pem\n');

const agent = process.env.npm_config_user_agent?.split('/')[0] ?? 'npm';
const pm = ['bun', 'pnpm', 'yarn'].includes(agent) ? agent : 'npm';
const cd = relative(process.cwd(), target) || '.';
const script = (/** @type {string} */ name) => (pm === 'npm' && name !== 'build' ? `npm ${name}` : `${pm} run ${name}`);
const width = script('build').length + 2;

const release = !github.workflow
	? ''
	: `
On GitHub: push to main, and release-please opens a release PR at the first feat: or fix: commit
(the repository's Actions settings need "Allow GitHub Actions to create and approve pull requests").
Merging it builds the app for every platform and publishes update.json${github.repo ? ', which standalone.ts already points at.' : `;
then set the manifest URL in standalone.ts to https://github.com/<owner>/<repo>/releases/latest/download/update.json.`}
`;
console.log(`
Created ${cd}. Next:

  cd ${cd}
  ${pm} install
  ${script('start').padEnd(width)}# opens the window; edit App.svelte to hot-reload
  ${script('test').padEnd(width)}# headless test (macOS and Windows)
  ${script('build').padEnd(width)}# the app for this platform in dist/ (requires Bun)
${release}`);
