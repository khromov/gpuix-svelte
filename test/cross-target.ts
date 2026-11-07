/**
 * The cross-target example on GPUI: the other half of `test:dom`, which mounts the same
 * component on the DOM. Same test ids, same clicks, through the real pipeline.
 */

import { mount_headless, find_test_id, find_text, click_test_id, click_text, click_at, hover, press, wait, all_text, check, finish } from 'gpuix-svelte/test';

const CrossTarget = (await import('../examples/cross-target/CrossTarget.svelte')).default;
const { native } = mount_headless(CrossTarget, { width: 720, height: 520 });

const text_of = (id: string) => (find_test_id(id)?.children ?? []).map((c) => c.text ?? '').join('');
const bg = () => find_test_id('app')?.style?.backgroundColor;
const rows = () => all_text().filter((t) => /^Row \d+$/.test(t)).length;

check('the badge says GPUI', text_of('target'), 'GPUI');
const size = native.getWindowSize();
check('window_size renders the viewport', text_of('size'), `${size.width} × ${size.height}`);

// A poll is 100 ms, and a loaded Windows runner's timers are coarse.
async function until(done: () => boolean) {
	for (let waited = 0; waited < 2000 && !done(); waited += 25) await wait(25);
}
const padding = () => find_test_id('app')?.style?.padding;
check('media_query answers the window, and the @media rule agrees', [text_of('layout'), padding()], ['wide', 16]);
native.getWindowSize = () => ({ width: 500, height: 400 });
await until(() => text_of('layout') === 'narrow' && padding() === 8);
check('a narrower window flips both within a poll', [text_of('layout'), padding()], ['narrow', 8]);
native.getWindowSize = () => size;
await until(() => text_of('layout') === 'wide' && padding() === 16);
check('and back', [text_of('layout'), padding()], ['wide', 16]);

check('the palette landed through set_css_vars', bg(), '#000000');
click_test_id('theme');
check('the theme button flips it', bg(), '#fafafa');
press('t');
check('and so does the T shortcut', bg(), '#000000');

check('the Scroller holds every row', rows(), 60);
click_text('Row 1');
check('a click removes a row', [rows(), all_text().includes('Row 1')], [59, false]);

hover(find_test_id('theme')!);
await wait(350);
check('the tooltip shows after the delay', find_text('Toggle the theme (T)') !== null, true);
hover(find_test_id('picked')!);
await wait(150);
check('and hides once the pointer leaves', find_text('Toggle the theme (T)'), null);

click_test_id('menu-trigger');
check('the Popover opens', find_test_id('item-rename') !== null, true);
click_test_id('item-rename');
check('an item click reports and closes', [text_of('picked').startsWith('Picked: Rename'), find_test_id('menu-panel')], [true, null]);
click_test_id('menu-trigger');
check('it reopens', find_test_id('menu-panel') !== null, true);
click_test_id('picked');
check('a press outside closes it', find_test_id('menu-panel'), null);
click_test_id('menu-trigger');
click_test_id('menu-trigger');
check('a click on the trigger while open closes it without reopening', find_test_id('menu-panel'), null);
click_test_id('menu-trigger');
press('escape');
check('so does Escape', find_test_id('menu-panel'), null);

click_test_id('open');
check('the Portal shows the dialog, and its sibling in the same block', [find_test_id('dialog') !== null, find_test_id('dialog-open') !== null], [true, true]);
press('escape');
check('Escape closes it through on_window_key', [find_test_id('dialog'), find_test_id('dialog-open')], [null, null]);
click_test_id('open');
click_test_id('close');
check('and so does its Close button', find_test_id('dialog'), null);
click_test_id('open');
click_test_id('dialog');
check('a click inside the dialog stays inside', find_test_id('dialog') !== null, true);
click_at(20, 20);
check('a click on the scrim closes it', find_test_id('dialog'), null);

finish('cross-target', 23);
