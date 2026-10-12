/**
 * GPUI has no resize event, so `window_size` / `window_insets` poll — but only while
 * an effect reads them, which is what keeps an app that never asks from paying for it.
 */

import { window_size, window_insets } from 'gpuix-svelte';
import { mount_headless, wait, all_text, check, finish } from 'gpuix-svelte/test';

const size_text = () => all_text().find((t) => /^\d+x\d+$/.test(t));
const insets_text = () => all_text().find((t) => /^-?\d+\/(true|false)\/\d+$/.test(t));

// A poll is 100 ms, and a loaded Windows runner's timers are coarse.
async function until(done: () => boolean) {
	for (let waited = 0; waited < 2000 && !done(); waited += 25) await wait(25);
}

check('with no native yet, the size is the 800×600 fallback', [window_size.width, window_size.height, window_insets.visibleHeight], [800, 600, 600]);

const Fixture = (await import('./Window.svelte')).default;
const first = mount_headless(Fixture, { width: 400, height: 300 });
// Windows ignores the requested headless size and macOS caps its height, so expect what native reports.
const { width, height } = first.native.getWindowSize();
check('the template shows the size native reports', size_text(), `${width}x${height}`);
check('the headless renderer has no insets, so all of it is visible', insets_text(), `${height}/false/0`);

let calls = 0;
first.native.getWindowSize = () => (calls++, { width: 321, height: 123 });
await until(() => size_text() === '321x123');
check('a resize reaches the template within a poll', size_text(), '321x123');
check('and the insets derive from the new height', insets_text(), '123/false/0');

const edges = (top: number, bottom: number) => ({ top, right: 0, bottom, left: 0 });
Object.assign(first.native, { getWindowInsets: () => ({ safeArea: edges(28, 0), ime: edges(0, 40), effective: edges(28, 40) }) });
await until(() => insets_text() === '55/true/28');
check('an IME inset shows the keyboard and shrinks the visible height', insets_text(), '55/true/28');

first.unmount();
// The subscriber counts down a microtask after its last effect dies.
await wait(10);
const stopped_at = calls;
await wait(250);
check('the poll stops once nothing reads it', calls, stopped_at);
check('a read outside any effect is one fresh native call', [window_size.width, calls], [321, stopped_at + 1]);

const second = mount_headless(Fixture, { width: 400, height: 300 });
const fresh = second.native.getWindowSize();
check('a remount reads the new native', size_text(), `${fresh.width}x${fresh.height}`);
second.native.getWindowSize = () => ({ width: 654, height: 210 });
await until(() => size_text() === '654x210');
check('and the poll is running again', size_text(), '654x210');

finish('window', 10);
