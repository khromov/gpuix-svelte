/**
 * `gpuix-svelte/automation`'s Locator over the headless renderer, which is the
 * same script `launch()` runs against a window, plus the live server's frame sync
 * against a stub frame loop. `test:automation-live` drives a real window.
 */

import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutomationError, test_app, type AutomationBackend } from 'gpuix-svelte/automation';
import { mount_headless, find_test_id, check, finish } from 'gpuix-svelte/test';
import { frame_synced } from '../src/automation-server.ts';
import { next_frame, start_frame_loop } from '../src/render.ts';

const code_of = (promise: Promise<unknown>) =>
	promise.then(
		() => 'resolved',
		(error: unknown) => (error instanceof AutomationError ? error.code : String(error))
	);

// --- the live server's wrapper: inputs wait two frames, one request at a time ---
{
	let ticks = 0;
	const loop = start_frame_loop({ requiresTick: () => true, tick: () => (ticks++, true) });
	const inner: AutomationBackend = {
		call: async (method) => (method === 'getTree' ? { tree: null } : { protocolVersion: 1, pid: 1, capabilities: [], window: { width: 800, height: 600 }, ok: true }) as never,
		close: async () => {}
	};
	const backend = frame_synced(inner, { getWindowSize: () => ({ width: 640, height: 480 }) }, next_frame);

	const before = ticks;
	let clicked = -1;
	let read = -1;
	await Promise.all([
		backend.call('click', { x: 1, y: 1 }).then(() => (clicked = ticks - before)),
		backend.call('getTree', {}).then(() => (read = ticks - before))
	]);
	check('a click replies only after two frames have ticked', clicked, 2);
	check('a getTree pipelined behind it answers right after it, with no frame of its own', read, 2);
	const init = await backend.call('initialize', { protocolVersion: 1, client: 'test' });
	check('initialize reports the size native reports, not a fixed 800×600', init.window, { width: 640, height: 480 });
	loop.stop();
}

const Fixture = (await import('./Automation.svelte')).default;
mount_headless(Fixture, { width: 400, height: 500 });
const app = await test_app();

check('getByTestId resolves the node find_test_id finds', (await app.getByTestId('inc').element()).id, find_test_id('inc')!.id);
check('getByText is a substring match', await app.getByText('item').count(), 2);
check('chaining scopes to descendants', [await app.getByText('alpha').count(), await app.getByTestId('list').getByText('alpha').count()], [2, 1]);
check('element() throws NotFound for no match', await code_of(app.getByTestId('nope').element()), 'NotFound');
check('element() throws Ambiguous for two', await code_of(app.getByText('item').element()), 'Ambiguous');

await app.getByText('increment').click();
await app.getByTestId('inc').click();
check('click() goes through hit testing, on the text and on its element', await app.getByTestId('count').textContent(), 'count: 2');

await app.getByTestId('field').fill('bye');
check("fill() replaces an input's value", await app.getByText('typed:').textContent(), 'typed: bye');

check('textContent() joins descendants in document order', await app.getByTestId('card').textContent(), 'titlebody');

await app.getByTestId('hover').hover();
check('hover() moves the pointer onto the element', await app.getByTestId('hover').textContent(), 'hovered');
await app.mouse.move({ x: 390, y: 5 });
check('and mouse.move() off it leaves', await app.getByTestId('hover').textContent(), 'idle');

check('input outside the viewport is refused, not dropped', await code_of(app.mouse.click({ x: 10, y: 5000 })), 'NotFound');

await app.getByText('reveal').click();
check('waitFor() sees an update that lands on a timer', (await app.getByText('revealed').waitFor({ timeoutMs: 2000 })).text, 'revealed');
check('waitFor() times out with Timeout', await code_of(app.getByText('never').waitFor({ timeoutMs: 100 })), 'Timeout');

const shot = join(tmpdir(), `gpuix-svelte-automation-${process.pid}.png`);
await app.screenshot({ path: shot });
check('screenshot() writes the PNG', existsSync(shot), true);
rmSync(shot, { force: true });

await app.close();
check('a closed app refuses further calls', await code_of(app.getByTestId('inc').count()), 'Closed');

finish('automation', 18);
