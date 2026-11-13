/**
 * `@media` through `gpuix-svelte/test` alone, as a consumer's test runs: nothing here loads window.ts,
 * so the renderer's own size observer has to answer the query for the real window and follow a resize.
 */

import { mount_headless, find_test_id, wait, check, finish } from 'gpuix-svelte/test';

const Only = (await import('./MediaOnly.svelte')).default;
const { native } = mount_headless(Only, { width: 1000, height: 400 });
const padding = () => find_test_id('box')?.style?.padding ?? null;

// A poll is 100 ms, and a loaded Windows runner's timers are coarse.
async function until(done: () => boolean) {
	for (let waited = 0; waited < 2000 && !done(); waited += 25) await wait(25);
}

check('the rule is answered for the real window, not the 800×600 fallback', [native.getWindowSize().width >= 801, padding()], [true, 20]);
native.getWindowSize = () => ({ width: 500, height: 400 });
await until(() => padding() === null);
check('and follows a resize through the default observer', padding(), null);
native.getWindowSize = () => ({ width: 900, height: 400 });
await until(() => padding() === 20);
check('and back', padding(), 20);

finish('media-default', 3);
