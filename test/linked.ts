/**
 * An app with a svelte of its own on a linked gpuix-svelte checkout, as `npm install ../gpuix-svelte` or a workspace link
 * leaves it: the loaders pin every svelte import to the checkout's copy, or the app's components and the renderer
 * would run on two runtimes, which cannot cross.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, finish } from 'gpuix-svelte/test';

const root = fileURLToPath(new URL('..', import.meta.url));
// Inside the repository, so the app finds svelte's own dependencies, and gpuix-svelte through node_modules' link, by walking up.
const app = fileURLToPath(new URL('./.linked-tmp/', import.meta.url));
rmSync(app, { recursive: true, force: true });
mkdirSync(join(app, 'node_modules'), { recursive: true });
cpSync(join(root, 'node_modules/svelte'), join(app, 'node_modules/svelte'), { recursive: true, dereference: true });
writeFileSync(join(app, 'package.json'), JSON.stringify({ type: 'module', private: true }));
writeFileSync(join(app, 'App.svelte'), '<script lang="ts">\n\tlet count = $state(0);\n</script>\n\n<div testId="plus" onclick={() => count++}>clicked {count}</div>\n');
writeFileSync(
	join(app, 'entry.ts'),
	"import { mount_headless, click_test_id, all_text, check, finish } from 'gpuix-svelte/test';\nimport App from './App.svelte';\n\nmount_headless(App, { width: 320, height: 200 });\nclick_test_id('plus');\ncheck('the click reached the component', all_text().includes('clicked 1'));\nfinish('linked-app', 1);\n"
);

const copy = (from: string) => realpathSync(createRequire(join(from, 'x.js')).resolve('svelte/package.json'));
check("the app resolves a svelte of its own, apart from the checkout's", copy(app) !== copy(root), true);

const run = spawnSync(process.execPath, [join(root, 'bin/gpuix-svelte.js'), ...(process.versions.bun ? ['--bun'] : []), 'entry.ts'], { cwd: app, encoding: 'utf8' });
if (run.status !== 0) console.error(run.stdout, run.stderr);
check('its component mounts and takes a click on the one runtime', [run.status, run.stdout.includes('linked-app ok')], [0, true]);

rmSync(app, { recursive: true, force: true });
finish('linked', 2);
