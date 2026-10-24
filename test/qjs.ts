/**
 * The QuickJS host end to end: bundle test/qjs through `gpuix-svelte/qjs`, run it on
 * `gpuix-qjs`, see a GPUI keystroke reach Svelte, then edit the component and see the
 * dev reload remount on the same window. Needs the host binary (`GPUIX_QJS`) and Bun,
 * so it skips at exit 0 without them, like test:coverage without SVELTE_SAMPLES_DIR.
 */

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, finish } from 'gpuix-svelte/test';

const host = process.env.GPUIX_QJS;
if (!host) {
	console.log('[test:qjs] GPUIX_QJS not set — skipping');
	process.exit(0);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = join(root, 'test/qjs');
// A copy, because the test edits the component to trigger a reload.
const tmp = join(root, 'test/.qjs-tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
cpSync(fixture, tmp, { recursive: true });

const bin = join(root, 'bin/gpuix-svelte.js');
const child = spawn(process.execPath, [bin, '--qjs', join(tmp, 'entry.ts')], {
	stdio: ['ignore', 'pipe', 'inherit'],
	env: { ...process.env, GPUIX_SCREENSHOT: join(tmp, 'shot.png') }
});

const lines: string[] = [];
const waiters: Array<{ test: (line: string) => boolean; resolve: (line: string) => void }> = [];
let buffer = '';
child.stdout.on('data', (chunk: Buffer) => {
	buffer += chunk.toString();
	let at: number;
	while ((at = buffer.indexOf('\n')) !== -1) {
		const line = buffer.slice(0, at);
		buffer = buffer.slice(at + 1);
		lines.push(line);
		process.stdout.write(`  | ${line}\n`);
		for (const waiter of waiters.splice(0)) {
			if (waiter.test(line)) waiter.resolve(line);
			else waiters.push(waiter);
		}
	}
});

function wait_for(test: (line: string) => boolean, what: string, ms = 20_000): Promise<string> {
	const seen = lines.find(test);
	if (seen) return Promise.resolve(seen);
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), ms);
		waiters.push({
			test,
			resolve(line) {
				clearTimeout(timer);
				resolve(line);
			}
		});
	});
}

let exited: number | null = null;
child.on('exit', (code) => {
	exited = code;
});

try {
	await wait_for((line) => line.includes('[qjs-test] mounted'), 'the first mount');
	check('mount logged by the app on QuickJS', true, true);
	await wait_for((line) => line.includes('[qjs-test] count=1'), 'the simulated keystroke to reach Svelte');
	check('a GPUI keystroke came back through the event queue into a Svelte handler', true, true);
	await wait_for((line) => line.includes('screenshot ->'), 'the screenshot');
	check('GPUIX_SCREENSHOT captured a frame', existsSync(join(tmp, 'shot.png')), true);

	const component = join(tmp, 'App.svelte');
	writeFileSync(component, readFileSync(component, 'utf8').replace('LABEL_V1', 'LABEL_V2'));
	await wait_for((line) => line.includes('[qjs] built'), 'the rebuild');
	await wait_for((line) => line.includes('[gpuix-svelte] remount complete'), 'the remount');
	check('the edited component was re-imported and remounted on the same window', true, true);
	const mounts = lines.filter((line) => line.includes('[qjs-test] mounted')).length;
	check('the entry ran once per mount', mounts, 2);
	check('no second "created native window"', lines.filter((line) => line.includes('created native window')).length, 1);
	check('the host is still running after the reload', exited, null);
} catch (error) {
	console.error(`[test:qjs] ${(error as Error).message}`);
	child.kill();
	process.exit(1);
}

child.kill();
rmSync(tmp, { recursive: true, force: true });
finish('qjs', 7);
