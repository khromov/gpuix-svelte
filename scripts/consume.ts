// Installs the packed tarball into a copy of starter/ the way a consumer would — a
// tarball, not a symlink, so the bundled svelte and the bin's own resolution are what
// gets tested — then typechecks and runs its headless test (or opens the window).

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bun = process.argv.includes('--bun');
const open = process.argv.includes('--open');

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'gpuix-svelte-consume-'));
const consumer = join(dir, 'starter');

function run(command: string, args: string[], cwd: string) {
	console.log(`\n[consume] ${command} ${args.join(' ')}`);
	const { status } = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
	if (status !== 0) {
		console.error(`[consume] failed (${status}); the consumer is left at ${consumer}`);
		process.exit(status ?? 1);
	}
}

run(process.execPath, ['--import', 'tsx', join(root, 'scripts/publish.ts'), 'pack', dir], root);
const tarball = readdirSync(dir).find((f) => f.endsWith('.tgz'));
if (!tarball) throw new Error(`npm pack left no tarball in ${dir}`);

cpSync(join(root, 'starter'), consumer, { recursive: true, filter: (src) => !src.includes('node_modules') });
const manifest = join(consumer, 'package.json');
const json = JSON.parse(readFileSync(manifest, 'utf8'));
json.dependencies['gpuix-svelte'] = `file:${join(dir, tarball)}`;
writeFileSync(manifest, JSON.stringify(json, null, '\t') + '\n');

const pm = bun ? 'bun' : 'npm';
run(pm, bun ? ['install'] : ['install', '--no-audit', '--no-fund'], consumer);
run(pm, ['run', 'typecheck'], consumer);
run(pm, ['run', open ? 'start' : 'test'], consumer);

console.log(`\n[consume] ok — the consumer is at ${consumer}`);
