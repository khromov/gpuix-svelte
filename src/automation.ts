/**
 * Playwright-style driving through `@gpuix/native/automation`'s `App` and `Locator`:
 * `launch()` runs an entry under `GPUIX_AUTOMATION=1` and speaks upstream's SSE
 * protocol over its stdio, `test_app()` drives whatever `mount_headless` mounted.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { TestGpuixRenderer } from '@gpuix/native';
import { App, AutomationError, connectStdio, connectTest, type TestAutomationRenderer } from '@gpuix/native/automation';
import { get_native } from './renderer.ts';
import { MAX_HEADLESS_HEIGHT, drain, focus, press, pump, settle, type, unfocus } from './test.ts';

export { App, Locator, AutomationError, connectStdio, connectTest, PROTOCOL_VERSION } from '@gpuix/native/automation';
export type {
	AutomationBackend,
	AutomationErrorCode,
	DragOptions,
	ElementBounds,
	MouseOptions,
	PointTarget,
	TestAutomationRenderer,
	TreeNode
} from '@gpuix/native/automation';

const BIN = fileURLToPath(new URL('../bin/gpuix-svelte.js', import.meta.url));
const START_MS = 30_000;
const CLOSE_MS = 2_000;

export interface LaunchOptions {
	/** The app's entry module, resolved against `cwd`. */
	entry: string;
	/** Run the app on Bun even when this script runs on Node; under Bun it already does. */
	bun?: boolean;
	/** Arguments after the entry. */
	args?: string[];
	cwd?: string;
	env?: Record<string, string | undefined>;
}

/**
 * Runs `entry` through the `gpuix-svelte` bin with `GPUIX_AUTOMATION=1` and connects to it once it
 * answers `initialize`. `close()` ends the app's stdin, which exits it, and kills it if it is still
 * there two seconds later.
 */
export async function launch({ entry, bun = false, args = [], cwd, env }: LaunchOptions): Promise<App & { process: ChildProcess }> {
	const child = spawn(process.execPath, [BIN, ...(bun ? ['--bun'] : []), entry, ...args], {
		cwd,
		env: { ...process.env, ...env, GPUIX_AUTOMATION: '1' },
		// Upstream's launch pipes stderr and never reads it, so a chatty app would stall on a full pipe.
		stdio: ['pipe', 'pipe', 'inherit']
	});
	child.stdin.on('error', () => {});
	child.stdout.setEncoding('utf8');

	let timer: ReturnType<typeof setTimeout> | undefined;
	const gone = new Promise<never>((_, reject) => {
		child.once('error', reject);
		child.once('exit', (code, signal) => reject(new AutomationError('Closed', `${entry} exited (${signal ?? code}) before it answered initialize`)));
		timer = setTimeout(() => reject(new AutomationError('Timeout', `${entry} did not answer initialize within ${START_MS / 1000} s`)), START_MS);
	});

	const connected = connectStdio({
		write: (chunk) => void child.stdin.write(chunk),
		feed: (listener) => void child.stdout.on('data', listener),
		close: async () => {
			child.stdin.end();
			if (child.exitCode !== null || child.signalCode !== null) return;
			const killer = setTimeout(() => child.kill(), CLOSE_MS);
			await new Promise((resolve) => child.once('exit', resolve));
			clearTimeout(killer);
		}
	});

	try {
		const app = await Promise.race([connected, gone]);
		// Otherwise a request in flight when the app dies would wait forever.
		child.once('close', () => void app.close());
		return Object.assign(app, { process: child });
	} catch (error) {
		child.kill();
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

/** An `App` over what `mount_headless` mounted: the locator script `launch()` runs, without a window. */
export const test_app = (): Promise<App> => connectTest(headless_renderer());

function native(): TestGpuixRenderer {
	const instance = get_native();
	if (!instance) throw new AutomationError('Closed', '[gpuix-svelte/automation] nothing is mounted — call mount_headless() first');
	return instance as TestGpuixRenderer;
}

/** GPUI drops input outside the viewport without a word, so say so where test.ts's `click()` would. */
function pointer(x: number, y: number, send: (native: TestGpuixRenderer) => void) {
	const { width, height } = native().getWindowSize();
	if (x > width || y > height) {
		throw new AutomationError(
			'NotFound',
			`(${Math.round(x)}, ${Math.round(y)}) is outside the ${width}×${height} headless viewport (its height caps at ${MAX_HEADLESS_HEIGHT})`
		);
	}
	send(native());
	drain();
	settle();
}

function settled<T>(value: T): T {
	pump();
	return value;
}

/**
 * Upstream's `TestAutomationRenderer` over the headless renderer, with test.ts's discipline:
 * every input is simulate → drainEvents → dispatch → settle, and reads pump first, so a timer's
 * update or a queued `layout` event reaches `waitFor` the way the window would deliver it.
 */
export function headless_renderer(): TestAutomationRenderer {
	return {
		nativeSimulateClick: (x, y, button, modifiers) => pointer(x, y, (n) => n.simulateClick(x, y, button, modifiers)),
		nativeSimulateMouseDown: (x, y, button, modifiers) => pointer(x, y, (n) => n.simulateMouseDown(x, y, button, modifiers)),
		nativeSimulateMouseUp: (x, y, button, modifiers) => pointer(x, y, (n) => n.simulateMouseUp(x, y, button, modifiers)),
		nativeSimulateMouseMove: (x, y, pressed, modifiers) => pointer(x, y, (n) => n.simulateMouseMove(x, y, pressed, modifiers)),
		nativeSimulateScrollWheel: (x, y, dx, dy, modifiers) => pointer(x, y, (n) => n.simulateScrollWheel(x, y, dx, dy, modifiers)),
		simulateKeystrokes: (keys) => type(keys),
		nativeSimulateKeystrokes(id, keys) {
			focus(id);
			type(keys);
		},
		nativeSimulateKeyDown(id, key, held) {
			if (id > 0) focus(id);
			press(key, { held });
		},
		nativeSimulateKeyUp(id, key) {
			if (id > 0) focus(id);
			native().simulateKeyUp(key);
			drain();
			settle();
		},
		scrollTo: (id, x, y) => settled(native().scrollTo(id, x, y)),
		getScrollOffset(id) {
			const offset = native().getScrollOffset(id);
			return offset ? [offset[0], offset[1]] : null;
		},
		getAllText: () => settled(native()).getAllText(),
		getPaintedText: () => settled(native()).getPaintedText(),
		getSelectedText: () => native().getSelectedText(),
		clearSelection: () => native().clearSelection(),
		captureScreenshot: (path) => settled(native()).captureScreenshot(path),
		getAutomationTree: () => settled(native()).getAutomationTree(),
		getElementBounds: (id) => native().getElementBounds(id),
		clockPause: () => native().clockPause(),
		clockSet: (now) => settled(native().clockSet(now)),
		clockFastForward: (delta) => settled(native().clockFastForward(delta)),
		clockResume: () => native().clockResume(),
		focusElement: (id) => focus(id),
		// The headless renderer has no blur; this reports one to the tree, as `unfocus()` does.
		blur: () => unfocus()
	};
}
