/**
 * bin/migrate.js on the files an app scaffolded from the 0.6.0 starter carries (test/starter-0.6, copied from that
 * tag), which have to come out as the current starter's, and on the shapes an app may have made of them since.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../bin/migrate.js';
import { check, finish } from 'gpuix-svelte/test';

const OLD = fileURLToPath(new URL('./starter-0.6/', import.meta.url));
const STARTER = fileURLToPath(new URL('../starter/', import.meta.url));
const bin = fileURLToPath(new URL('../bin/gpuix-svelte.js', import.meta.url));
const read = (dir: string, name: string) => readFileSync(join(dir, name), 'utf8');
// A Windows checkout has CRLF line endings, so the fixtures and the starter are compared as LF.
const lf = (dir: string, name: string) => read(dir, name).replaceAll('\r\n', '\n');

const OLD_FILES = { 'tsconfig.json': lf(OLD, 'tsconfig.json.txt'), 'AGENTS.md': lf(OLD, 'AGENTS.md.txt') };
const ALL = ['tsconfig.json', 'AGENTS.md'];

const dirs: string[] = [];
function app(files: Record<string, string>, manifest: object = { dependencies: { 'gpuix-svelte': '^0.6.0' } }) {
	const dir = mkdtempSync(join(tmpdir(), 'gpuix-migrate-'));
	dirs.push(dir);
	writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
	for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
	return dir;
}

const scaffolded = app(OLD_FILES);
check('a 0.6.0 app gets both files updated', migrate(scaffolded, {}), ALL);
check("and its tsconfig.json is now the starter's", read(scaffolded, 'tsconfig.json') === lf(STARTER, 'tsconfig.json'), true);
const agents = read(scaffolded, 'AGENTS.md');
const peer = /`svelte` is a peer dependency[^]*?\n\n/.exec(lf(STARTER, 'AGENTS.md'))?.[0] ?? null;
check("AGENTS.md drops the bundled svelte's advice for the starter's paragraph", [agents.includes('Keep `svelte` itself out'), agents.includes('--conditions custom-renderer'), peer !== null && agents.includes(peer)], [false, false, true]);
check('a second run changes nothing', migrate(scaffolded, {}), []);

const crlf = app(Object.fromEntries(Object.entries(OLD_FILES).map(([name, text]) => [name, text.replaceAll('\n', '\r\n')])));
migrate(crlf, {});
check('CRLF files are matched too, and keep their line endings', [read(crlf, 'tsconfig.json'), peer !== null && read(crlf, 'AGENTS.md').includes(peer.replaceAll('\n', '\r\n'))], [lf(STARTER, 'tsconfig.json').replaceAll('\n', '\r\n'), true]);

// The README's tsconfig for an existing project, which a hand-written config copied.
const readme = app({
	'tsconfig.json': '{\n  "compilerOptions": {\n    "customConditions": ["custom-renderer", "development"],\n    "skipLibCheck": true,\n    "paths": {\n      "svelte": ["./node_modules/gpuix-svelte/node_modules/svelte"],\n      "svelte/*": ["./node_modules/gpuix-svelte/node_modules/svelte/*"],\n    },\n  },\n}\n'
});
migrate(readme, {});
check("the README's tsconfig, trailing commas and all, loses its paths as well", read(readme, 'tsconfig.json'), '{\n  "compilerOptions": {\n    "customConditions": ["svelte-custom-renderer", "development"],\n    "skipLibCheck": true,\n  },\n}\n');

const own_paths = '{ "compilerOptions": { "customConditions": ["custom-renderer"], "paths": { "svelte": ["./node_modules/gpuix-svelte/node_modules/svelte"], "svelte/*": ["./node_modules/gpuix-svelte/node_modules/svelte/*"], "$lib/*": ["./lib/*"] } } }';
const custom = app({ 'tsconfig.json': own_paths });
check('a paths entry with more in it stays as it is, while the condition is renamed', [migrate(custom, {}), read(custom, 'tsconfig.json')], [['tsconfig.json'], own_paths.replace('"custom-renderer"', '"svelte-custom-renderer"')]);

check(
	'nothing outside an app on gpuix-svelte or under CI, while devDependencies and CI=false count',
	[migrate(app(OLD_FILES, { dependencies: {} }), {}), migrate(app(OLD_FILES), { CI: 'true' }), migrate(app(OLD_FILES, { devDependencies: { 'gpuix-svelte': '^0.6.0' } }), {}), migrate(app(OLD_FILES), { CI: 'false' })],
	[[], [], ALL, ALL]
);

const launched = app({ ...OLD_FILES, 'entry.ts': '' });
const env = { ...process.env };
delete env.CI;
const run = spawnSync(process.execPath, [bin, ...(process.versions.bun ? ['--bun'] : []), 'entry.ts'], { cwd: launched, env, encoding: 'utf8' });
check(
	'the bin updates them before the entry runs, and says so once, on stderr',
	[run.status, run.stderr.split('\n').filter((line) => line.startsWith('[gpuix-svelte] updated tsconfig.json, AGENTS.md')).length, run.stdout.includes('[gpuix-svelte] updated'), read(launched, 'tsconfig.json') === lf(STARTER, 'tsconfig.json')],
	[0, 1, false, true]
);

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
finish('migrate', 9);
