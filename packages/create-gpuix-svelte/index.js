#!/usr/bin/env node
// @ts-check
/**
 * `npm create gpuix-svelte [dir]` — copies the starter into `dir` and pins the
 * gpuix-svelte release this scaffolder was published with.
 */

import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
// Published, the starter sits in template/; in the repo it is read straight from starter/.
const template = [join(here, 'template'), join(here, '../../starter')].find((dir) => existsSync(join(dir, 'App.svelte')));
if (!template) throw new Error('create-gpuix-svelte: the starter template is missing');

const SKIP = new Set(['node_modules', 'package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']);

async function ask_dir() {
	const fallback = 'gpuix-svelte-app';
	if (!process.stdin.isTTY) return fallback;
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = (await rl.question(`Project directory (${fallback}): `)).trim();
	rl.close();
	return answer || fallback;
}

const arg = process.argv.slice(2).find((a) => !a.startsWith('-'));
if (process.argv.includes('--help') || process.argv.includes('-h')) {
	console.log('usage: npm create gpuix-svelte@latest [directory]');
	process.exit(0);
}

const target = resolve(arg ?? (await ask_dir()));
if (existsSync(target) && readdirSync(target).length > 0) {
	console.error(`${target} exists and is not empty`);
	process.exit(1);
}

cpSync(template, target, { recursive: true, filter: (src) => !SKIP.has(basename(src)) });

const own = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const manifest = join(target, 'package.json');
const json = JSON.parse(readFileSync(manifest, 'utf8'));
json.name = basename(target).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
json.dependencies['gpuix-svelte'] = `^${own.version}`;
writeFileSync(manifest, JSON.stringify(json, null, '\t') + '\n');
// npm strips .gitignore from published tarballs, so it cannot travel inside template/.
writeFileSync(join(target, '.gitignore'), 'node_modules\n.DS_Store\n');

const agent = process.env.npm_config_user_agent?.split('/')[0] ?? 'npm';
const pm = ['bun', 'pnpm', 'yarn'].includes(agent) ? agent : 'npm';
const cd = relative(process.cwd(), target) || '.';

console.log(`
Created ${cd}. Next:

  cd ${cd}
  ${pm} install
  ${pm === 'npm' ? 'npm start' : `${pm} run start`}      # opens the window; edit App.svelte to hot-reload
  ${pm === 'npm' ? 'npm test' : `${pm} run test`}       # headless test (macOS and Windows)
`);
