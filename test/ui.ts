/**
 * The UI toolkit's showcase on GPUI: every component clicked through by test id, as test/ui-dom.ts
 * does on the DOM, plus what only a window shows — the @media rule and media_query over a faked size.
 * The headless viewport is about 540 px tall, so the lower cards are reached by scrolling the Scroller,
 * and everything in the header is done before that.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mount_headless, find_test_id, find_all, find_text, click, click_test_id, click_text, click_at, focus, press, type, hover, wheel, drag, bounds, wait, settle, screenshot, check, finish, type TreeNode } from 'gpuix-svelte/test';
import { before, href, navigate } from 'gpuix-svelte-ui/router';

const Showcase = (await import('../packages/ui/showcase/Showcase.svelte')).default;
// Wide enough for three cards per row on macOS; Windows opens its own size, where the rows reflow but stay reachable.
const { native } = mount_headless(Showcase, { width: 1100, height: 540 });

const text_of = (id: string) => (find_test_id(id)?.children ?? []).map((c) => c.text ?? '').join('').trim();
const text_in = (id: string) => {
	const walk = (n: TreeNode | null): string => (n ? (n.text ?? '') + (n.children ?? []).map(walk).join('') : '');
	return walk(find_test_id(id)).trim();
};
const has = (text: string) => find_text(text) !== null;
const bg = () => find_test_id('page')?.style?.backgroundColor;
const style_of = (id: string) => find_test_id(id)?.style ?? {};
const closes = () => find_all((n) => /^toaster-\d+-close$/.test(n.testId ?? ''));
const dismiss_all = () => {
	for (const close of closes()) click(close);
};

// A poll is 100 ms, and a loaded Windows runner's timers are coarse.
async function until(done: () => boolean) {
	for (let waited = 0; waited < 2000 && !done(); waited += 25) await wait(25);
}

// --- the header ----------------------------------------------------------------
check('the badge says GPUI', text_of('target'), 'GPUI');
const size = native.getWindowSize();
check('the size chip shows the window', text_of('size'), `${size.width} × ${size.height}`);
check('media_query says wide', text_of('layout'), 'wide');
check('apply_theme landed the --ui-* tokens', bg(), '#000000');

click_test_id('theme');
check('the theme button switches to the light palette', bg(), '#fafafa');
press('t');
check('and so does the T shortcut', bg(), '#000000');
click_test_id('dark');
check('the Toggle drives the same state', bg(), '#fafafa');
click_test_id('dark');
check('and back', bg(), '#000000');

hover(find_test_id('theme')!);
await wait(350);
check('the Tooltip shows on the Button, which spreads the hover handlers', has('Toggle the theme (T)'));
hover(find_test_id('size')!);
await wait(150);
check('and hides once the pointer leaves', has('Toggle the theme (T)'), false);

click_test_id('plus');
click_test_id('plus');
click_test_id('minus');
check('small Buttons reach the counter', text_of('count'), '1');

// --- the menu ------------------------------------------------------------------
click_test_id('menu-button');
check('the Menu opens its items, shortcut and separator included', [find_test_id('menu-panel') !== null, has('⌘R'), has('Archive')], [true, true, true]);
click_test_id('menu-rename');
check('an item runs and closes it', [text_of('last'), find_test_id('menu-panel')], ['Last action: Rename', null]);
click_test_id('menu-button');
click_test_id('menu-archive');
check('a disabled item does nothing', [text_of('last'), find_test_id('menu-panel') !== null], ['Last action: Rename', true]);
press('escape');
check('Escape closes it', find_test_id('menu-panel'), null);

// --- choices -------------------------------------------------------------------
click_test_id('notifications');
check('a Toggle reports its new state', text_of('choices-echo').startsWith('Notifications are off.'), true);
click_test_id('terms');
check('a Checkbox too', text_of('choices-echo').endsWith('Terms accepted.'), true);
click_test_id('plan-free');
check('a radio click selects it', text_of('choices-echo').includes('Plan: free.'), true);
focus(find_test_id('plan-free')!);
press('down');
check('an arrow key moves the selection', text_of('choices-echo').includes('Plan: pro.'), true);
press('down');
check('and skips a disabled option, wrapping around', text_of('choices-echo').includes('Plan: free.'), true);
click_test_id('plan-team');
check('a disabled radio ignores clicks', text_of('choices-echo').includes('Plan: free.'), true);

// --- fields --------------------------------------------------------------------
click_test_id('name-input');
type('A d a');
check('typing into a TextField reports every edit', text_of('name-echo'), 'You typed: Ada');
press('enter');
check('Enter submits', has('Hello, Ada'));
check('the TextArea is a real field', find_test_id('notes-input') !== null);

click_test_id('fruit-trigger');
check('the Select opens its list', find_test_id('fruit-list-panel') !== null);
click_test_id('fruit-banana');
check('an option click picks it and closes the list', [text_of('fruit-echo'), find_test_id('fruit-list-panel')], ['Picked: banana', null]);
focus(find_test_id('fruit-trigger')!);
press('down');
check('an arrow key on the trigger opens the list', find_test_id('fruit-list-panel') !== null);
press('down');
press('enter');
check('and the arrows skip a disabled option before Enter picks', [text_of('fruit-echo'), find_test_id('fruit-list-panel')], ['Picked: durian', null]);

// --- the dialog, while its button is still in view -----------------------------------
click_test_id('open-dialog');
check('the Dialog opens in a Portal', [find_test_id('dialog') !== null, has('Delete this project?')], [true, true]);
press('escape');
check('Escape closes it', find_test_id('dialog'), null);
click_test_id('open-dialog');
click_test_id('dialog-close');
check('so does the close button', find_test_id('dialog'), null);
click_test_id('open-dialog');
click_test_id('cancel');
check('and an action that closes it', find_test_id('dialog'), null);
click_test_id('open-dialog');
click_at(6, 6);
check('and a click on the scrim', find_test_id('dialog'), null);
click_test_id('open-dialog');
click_test_id('dialog');
check('while a click inside stays inside', find_test_id('dialog') !== null, true);
click_test_id('confirm');
check('the confirming action runs, closes it and toasts', [find_test_id('dialog'), text_of('last'), has('Project deleted')], [null, 'Last action: Deleted', true]);
check('every toast has a dismiss button', closes().length, 2);
dismiss_all();
check('dismissing clears them', [closes().length, has('Hello, Ada'), has('Project deleted')], [0, false, false]);

// --- the lower cards, scrolled into the viewport ---------------------------------
wheel(find_test_id('scroll')!, 0, -400);
await wait(80);

const track = bounds(find_test_id('volume-track')!)!;
const at = (fraction: number) => ({ x: track.x + 8 + fraction * (track.width - 16), y: track.y + track.height / 2 });
drag(at(0.4), at(0.75), { steps: 6 });
const dragged = Number(text_of('volume-echo').replace('Volume: ', ''));
check('dragging the Slider thumb sets the value', Math.abs(dragged - 75) <= 1, true);
focus(find_test_id('volume-track')!);
press('right');
check('an arrow key steps it', text_of('volume-echo'), `Volume: ${dragged + 1}`);
press('end');
check('End goes to the maximum, and the Progress follows', [text_of('volume-echo'), has('100%')], ['Volume: 100', true]);
press('home');
check('Home to the minimum', text_of('volume-echo'), 'Volume: 0');

click_test_id('tabs-activity');
check('a Tab click switches the panel', text_of('tab-echo'), 'Nothing has happened yet.');
focus(find_test_id('tabs-activity')!);
press('right');
check('an arrow key moves to the next tab', text_of('tab-echo'), 'Settings would go here.');
press('right');
check('and skips the disabled one, wrapping around', text_of('tab-echo').startsWith('An overview.'), true);
press('end');
check('End goes to the last enabled tab', text_of('tab-echo'), 'Settings would go here.');

// --- the router, in the last row ---------------------------------------------------
wheel(find_test_id('scroll')!, 0, -400);
await wait(80);
const badge_of = (id: string) => find_test_id(id)?.children?.[0]?.style?.backgroundColor ?? null;
check('the Router shows the initial screen', [text_in('screen').startsWith('Home.'), text_of('route')], [true, 'At /']);
check('the Link to it is active, the others not', [badge_of('go-home'), badge_of('go-items')], ['#ff3e0029', '#1c1c1c']);
click_test_id('go-items');
check('a Link navigates', [text_in('screen').startsWith('Three items'), text_of('route'), badge_of('go-items')], [true, 'At /items', '#ff3e0029']);
click_test_id('go-item-2');
check('a Link inside a screen, built by href(), carries its param', [text_in('screen'), badge_of('go-items')], ['Item 2, mounted fresh for this path.', '#ff3e0029']);
click_test_id('back');
check('Back pops the stack', text_of('route'), 'At /items');
click_test_id('forward');
check('and Forward goes again', text_of('route'), 'At /items/2');
press('cmd-[');
check('⌘[ is back', text_of('route'), 'At /items');
press('cmd-]');
check('⌘] is forward', text_of('route'), 'At /items/2');
click_test_id('go-lost');
check("an unmatched path renders the table's * entry", text_in('screen'), "Nothing at /nowhere; this is the table's * entry.");
const off = before((to) => (to.path === '/items/3' ? '/' : to.path !== '/nowhere'));
click_test_id('go-item');
check('a before hook can redirect', [text_in('screen').startsWith('Home.'), text_of('route')], [true, 'At /']);
click_test_id('go-lost');
check('or cancel', text_of('route'), 'At /');
off();
navigate(href('/items/:id', { id: 'a b' }, { tab: 'notes' }));
settle();
check('navigate() from code, params decoded and the query kept', [text_in('screen'), text_of('route')], ['Item a b, mounted fresh for this path.', 'At /items/a%20b?tab=notes']);

click_test_id('toast-plain');
check('a toast shows', has('Saved'));
click_test_id('toast-rich');
check('a rich toast shows its description', [has('Export finished'), has('12 files written to ~/Desktop.')], [true, true]);
click_text('Open');
check('its action runs and dismisses it', [text_of('last'), has('Export finished'), has('Saved')], ['Last action: Open', false, true]);
click_test_id('toast-sticky');
check('a sticky toast shows too', has('Disk almost full'));
dismiss_all();
check('and every one can be dismissed', [closes().length, has('Saved'), has('Disk almost full')], [0, false, false]);

// --- the window's size ----------------------------------------------------------
check('the grid is a row of cards in a wide window', style_of('grid').flexDirection, 'row');
native.getWindowSize = () => ({ width: 600, height: 500 });
await until(() => text_of('layout') === 'narrow' && style_of('grid').flexDirection === 'column');
check('a narrow window stacks them through @media, and media_query agrees', [style_of('grid').flexDirection, style_of('grid').gap, text_of('layout')], ['column', 12, 'narrow']);
native.getWindowSize = () => size;
await until(() => style_of('grid').flexDirection === 'row');
check('and back', [style_of('grid').flexDirection, text_of('layout')], ['row', 'wide']);

// For a look at what GPUI drew; not an assertion.
const shots = join(fileURLToPath(new URL('.', import.meta.url)), '.ui-tmp');
mkdirSync(shots, { recursive: true });
screenshot(join(shots, 'gpui.png'));

finish('ui', 65);
