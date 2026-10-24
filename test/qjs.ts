/**
 * The QuickJS host end to end: bundle test/qjs through `gpuix-svelte/qjs`, run it on
 * `gpuix-qjs`, see a GPUI keystroke reach Svelte, then edit the component and see the dev
 * reload remount on the same window with the new markup. It opens a real window, like
 * test:automation-live, and skips at exit 0 when no host is present: neither `GPUIX_QJS`
 * nor a release build in a `../gpuix` checkout (the lookup `src/qjs.ts` makes, minus the
 * prebuilt package, which a dev machine does not have). Bun must be on PATH for the bundle.
 */

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, finish } from 'gpuix-svelte/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const exe = process.platform === 'win32' ? 'gpuix-qjs.exe' : 'gpuix-qjs';
const sibling = join(root, '../gpuix/packages/native/target/release', exe);
if (!process.env.GPUIX_QJS && !existsSync(sibling)) {
	console.log('[test:qjs] no gpuix-qjs host (GPUIX_QJS unset, no ../gpuix build) — skipping');
	process.exit(0);
}

const fixture = join(root, 'test/qjs');
// A copy, because the test edits the component to trigger a reload.
const tmp = join(root, 'test/.qjs-tmp');
const out = join(root, 'dist/qjs/.qjs-tmp');
// The bundler refuses to clear an output directory it did not create; a leftover from an older run is one.
rmSync(out, { recursive: true, force: true });
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

/** Resolves with the first line matching `test`, among lines from index `since` on, or already seen. */
function wait_for(test: (line: string) => boolean, what: string, since = 0, ms = 20_000): Promise<string> {
	const seen = lines.slice(since).find(test);
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

const count = (needle: string) => lines.filter((line) => line.includes(needle)).length;

let exited: number | null = null;
child.on('exit', (code) => {
	exited = code;
});

function cleanup() {
	child.kill();
	rmSync(tmp, { recursive: true, force: true });
	rmSync(out, { recursive: true, force: true });
}

try {
	await wait_for((line) => line.includes('[qjs-test] mounted'), 'the first mount');
	check('mount logged by the app on QuickJS', true, true);
	await wait_for((line) => line.includes('[qjs-test] count=1'), 'the simulated keystroke to reach Svelte');
	check('a GPUI keystroke came back through the event queue into a Svelte handler', true, true);
	await wait_for((line) => line.includes('screenshot ->'), 'the screenshot');
	check('GPUIX_SCREENSHOT captured a frame', existsSync(join(tmp, 'shot.png')), true);
	check('the first mount rendered the original label', count('[qjs-test] label=LABEL_V1'), 1);

	const before = lines.length;
	const component = join(tmp, 'App.svelte');
	// The edit also adds the component's first `{#if}`: a new Svelte internal, which must
	// already be in the shared runtime chunk or the reload would load a second runtime.
	writeFileSync(
		component,
		readFileSync(component, 'utf8')
			.replaceAll('LABEL_V1', 'LABEL_V2')
			.replace('<div style="color: #a6adc8">{label}</div>', '{#if count >= 0}<div style="color: #a6adc8">{label}</div>{/if}')
	);
	await wait_for((line) => line.includes('[qjs] built'), 'the rebuild', before);
	// The entry's last line, so everything the remount prints is in by now.
	await wait_for((line) => line.includes('[qjs-test] mounted'), 'the remount', before);
	check('the edited component was re-imported and remounted on the same window', count('[gpuix-svelte] remount complete'), 1);
	check('the remount rendered the edited markup', count('[qjs-test] label=LABEL_V2'), 1);
	check('the entry ran once per mount', count('[qjs-test] mounted'), 2);
	check('no second "created native window"', count('created native window'), 1);
	check('the host did not restart for a markup edit', count('restarting the host'), 0);
	check('the host is still running after the reload', exited, null);
} catch (error) {
	console.error(`[test:qjs] ${(error as Error).message}`);
	cleanup();
	process.exit(1);
}

cleanup();
finish('qjs', 10);
