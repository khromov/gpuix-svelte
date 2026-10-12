// Scaffolds an app with create-gpuix-svelte and installs the packed tarball into it the way
// a consumer would — a tarball, not a symlink, so the bundled svelte, the emitted declarations
// and the bin's own resolution are what gets tested — then typechecks and runs its headless
// test (or opens the window).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bun = process.argv.includes('--bun');
const open = process.argv.includes('--open');

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'gpuix-svelte-consume-'));
const consumer = join(dir, 'app');

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

// The scaffolder prefers its own template/ over starter/, so refresh it the way prepack would.
run(process.execPath, [join(root, 'packages/create-gpuix-svelte/sync-template.js')], root);
run(process.execPath, [join(root, 'packages/create-gpuix-svelte/index.js'), consumer], dir);
for (const file of ['.gitignore', 'AGENTS.md', 'CLAUDE.md']) {
	if (!existsSync(join(consumer, file))) throw new Error(`create-gpuix-svelte wrote no ${file}`);
}
const manifest = join(consumer, 'package.json');
const json = JSON.parse(readFileSync(manifest, 'utf8'));
json.dependencies['gpuix-svelte'] = `file:${join(dir, tarball)}`;
writeFileSync(manifest, JSON.stringify(json, null, '\t') + '\n');

const pm = bun ? 'bun' : 'npm';
run(pm, bun ? ['install'] : ['install', '--no-audit', '--no-fund'], consumer);
run(pm, ['run', 'typecheck'], consumer);
run(pm, ['run', open ? 'start' : 'test'], consumer);

console.log(`\n[consume] ok — the consumer is at ${consumer}`);
