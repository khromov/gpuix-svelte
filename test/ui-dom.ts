/**
 * The UI toolkit's showcase on the DOM: bundled by Vite as a consumer's would be (scripts/ui-bundle.ts),
 * mounted under happy-dom and clicked through by the same ids as test/ui.ts on GPUI. The toast queue and
 * the theme tokens are exercised directly too, since only time dismisses a toast and only a page needs
 * the `:root` rule.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import HistoryItemList from 'happy-dom/lib/history/HistoryItemList.js';
import type { LazyScreen } from '../packages/ui/src/router.ts';

// happy-dom's replaceState drops the entries ahead of the current one, which no browser does, and the
// router stamps an entry again when a pop arrives on it.
HistoryItemList.prototype.replace = function (this: HistoryItemList, item: HistoryItemList['currentItem']) {
	this.items[this.items.indexOf(this.currentItem)] = item;
	this.currentItem = item;
};

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = join(root, 'test/.ui-tmp');

// Vite runs on Node, as it does for demo:ui-dom, whichever runtime runs this test.
const node = process.versions.bun ? 'node' : process.execPath;
if (spawnSync(node, [join(root, 'scripts/ui-bundle.ts'), tmp], { cwd: root, stdio: 'inherit' }).status !== 0) {
	console.error('[ui-dom test] the showcase bundle failed');
	process.exit(1);
}

// A real origin, so the history API accepts pushState.
GlobalRegistrator.register({ url: 'http://localhost/', width: 1024, height: 768 });

// happy-dom moves through history inside the call, while a browser does it a task later, and the router has to
// cope with whatever is done in between. The count is what `pop()` waits on, a runner's timers being too coarse to.
let traversals = 0;
const traversal = Object.getPrototypeOf(history) as History;
for (const name of ['go', 'back', 'forward'] as const) {
	const now = traversal[name] as (this: History, delta?: number) => void;
	traversal[name] = function (this: History, delta?: number) {
		traversals++;
		setTimeout(() => {
			try {
				now.call(this, delta);
			} finally {
				traversals--;
			}
		});
	};
}

// After the registration, or Svelte's client runtime would be evaluated with no `document`.
const { check, finish } = await import('gpuix-svelte/test');
// The router API comes from the bundle, where it is the instance the showcase's Router drives.
const { Showcase, Avatar, Link, Router, Separator, Slider, Tabs, TextField, mount, unmount, flushSync, createRawSnippet, router, navigate, back, forward, before, after, href, screen, lazy, match, resolve, start_router, stop_router } = (await import(pathToFileURL(join(tmp, 'dist/showcase.js')).href)) as {
	Showcase: never;
	Avatar: never;
	Link: never;
	Router: never;
	Separator: never;
	Slider: never;
	Tabs: never;
	TextField: never;
	mount(component: never, options: { target: Element; props?: Record<string, unknown> }): Record<string, unknown>;
	unmount(component: Record<string, unknown>): void;
	flushSync(): void;
	createRawSnippet: typeof import('svelte').createRawSnippet;
} & typeof import('../packages/ui/src/router.ts');
const { toast, dismiss_toast, clear_toasts, toasts } = await import('../packages/ui/src/toast.ts');
const { theme_rule, theme_vars, DARK, LIGHT } = await import('../packages/ui/src/theme.ts');

const by_id = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (id: string) => by_id(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const css_var = (name: string) => document.documentElement.style.getPropertyValue(`--${name}`);
const has = (content: string) => [...document.querySelectorAll<HTMLElement>('div')].some((el) => el.children.length === 0 && el.textContent?.trim() === content);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const closes = () => [...document.querySelectorAll<HTMLElement>('[data-testid^="toaster-"][data-testid$="-close"]')];
/** Rendered, and hung off <body> rather than anywhere inside the page's own tree, as a Portal or Anchored layer is. */
const layered = (id: string) => {
	const target = by_id(id);
	return target !== null && !by_id('page')!.contains(target) && target.closest('body > *') !== null;
};

// Cancelable, as a browser's clicks are: a Link's preventDefault() has to keep happy-dom from following the <a> itself.
function click(target: HTMLElement | null | undefined) {
	if (!target) throw new Error('nothing to click');
	target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	flushSync();
}

function key(target: HTMLElement | Window | null | undefined, name: string, init: KeyboardEventInit = {}) {
	if (!target) throw new Error(`nothing to press ${name} on`);
	const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(event);
	flushSync();
	return event;
}

function mouse(target: EventTarget, type: string, init: MouseEventInit = {}) {
	target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
	flushSync();
}

function type_into(target: HTMLElement | null | undefined, value: string) {
	if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');
	target.value = value;
	target.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

function viewport(width: number, height: number) {
	(window as unknown as { happyDOM: { setViewport(viewport: { width: number; height: number }): void } }).happyDOM.setViewport({ width, height });
	window.dispatchEvent(new Event('resize'));
	flushSync();
}

// --- the theme and toast modules -------------------------------------------------
check('theme_vars prefixes every token and adds the component tokens', [theme_vars(DARK)['ui-bg'], theme_vars(LIGHT)['ui-ink'], theme_vars(DARK)['popover-surface'], 'ui-appearance' in theme_vars(DARK)], ['#000000', '#171717', '#111111', false]);
check('theme_rule is a :root rule a page can carry', theme_rule(DARK).startsWith(':root{--ui-bg:#000000;--ui-panel:#111111;'), true);

const quick = toast({ title: 'quick', duration: 20 });
const sticky = toast({ title: 'sticky', duration: null });
check('toast() queues, newest last, with a tone by default', toasts.current.map((t) => [t.title, t.tone]), [['quick', 'neutral'], ['sticky', 'neutral']]);
await sleep(60);
check('a toast with a duration dismisses itself, a sticky one stays', toasts.current.map((t) => t.id), [sticky]);
dismiss_toast(quick);
dismiss_toast(sticky);
check('dismiss_toast removes it, and tolerates a repeat', toasts.current.length, 0);
toast('one');
toast('two');
clear_toasts();
check('clear_toasts empties the queue', toasts.current.length, 0);

// --- the showcase ---------------------------------------------------------------
mount(Showcase, { target: document.body });
flushSync();

check('the badge says DOM', text('target'), 'DOM');
check('the size chip shows the viewport', text('size'), '1024 × 768');
check('media_query says wide', text('layout'), 'wide');
check('apply_theme wrote the --ui-* tokens on :root', [css_var('ui-bg'), css_var('popover-surface')], ['#000000', '#111111']);

click(by_id('theme'));
check('the theme button switches to the light palette', css_var('ui-bg'), '#fafafa');
key(window, 't');
check('and so does the T shortcut', css_var('ui-bg'), '#000000');
click(by_id('dark'));
check('the Toggle drives the same state', [css_var('ui-bg'), by_id('dark')?.getAttribute('aria-checked')], ['#fafafa', 'false']);
click(by_id('dark'));
check('and back', css_var('ui-bg'), '#000000');

by_id('theme')!.dispatchEvent(new FocusEvent('focus'));
flushSync();
const focus_shown = has('Toggle the theme (T)');
key(window, 'Escape');
check('keyboard focus shows the Tooltip at once, the Button passing focus on, and Escape hides it', [focus_shown, has('Toggle the theme (T)')], [true, false]);
by_id('theme')!.dispatchEvent(new FocusEvent('blur'));

click(by_id('plus'));
click(by_id('plus'));
click(by_id('minus'));
check('small Buttons reach the counter', text('count'), '1');
check('a Button is a focusable button', [by_id('plus')?.getAttribute('role'), by_id('plus')?.tabIndex], ['button', 0]);
key(by_id('plus'), 'Enter');
key(by_id('plus'), ' ');
const held_space = key(by_id('plus'), ' ', { repeat: true });
check('Enter and Space press a Button, once per press, and a held Space does not scroll the page either', [text('count'), held_space.defaultPrevented], ['3', true]);

click(by_id('menu-button'));
check('the Menu opens its items off <body>', [layered('menu-panel'), has('⌘R'), has('Archive')], [true, true, true]);
click(by_id('menu-rename'));
check('an item runs and closes it', [text('last'), by_id('menu-panel')], ['Last action: Rename', null]);
click(by_id('menu-button'));
check('a disabled item says so to a screen reader, an enabled one does not', [by_id('menu-archive')?.getAttribute('aria-disabled'), by_id('menu-duplicate')?.getAttribute('aria-disabled')], ['true', null]);
key(by_id('menu-duplicate'), 'Enter');
check('Enter runs an item too', [text('last'), by_id('menu-panel')], ['Last action: Duplicate', null]);
click(by_id('menu-button'));
key(window, 'Escape');
check('Escape closes it', by_id('menu-panel'), null);

click(by_id('notifications'));
check('a Toggle reports its new state', text('choices-echo')?.startsWith('Notifications are off.'), true);
click(by_id('terms'));
check('a Checkbox too, with its ARIA state', [text('choices-echo')?.endsWith('Terms accepted.'), by_id('terms')?.getAttribute('aria-checked')], [true, 'true']);
key(by_id('terms'), ' ');
const unticked = by_id('terms')?.getAttribute('aria-checked');
key(by_id('terms'), 'Enter');
check('Space and Enter flip it as well', [unticked, by_id('terms')?.getAttribute('aria-checked')], ['false', 'true']);
click(by_id('plan-free'));
check('a radio click selects it', text('choices-echo')?.includes('Plan: free.'), true);
key(by_id('plan-free'), 'ArrowDown');
check('an arrow key moves the selection, and the focus with it', [text('choices-echo')?.includes('Plan: pro.'), document.activeElement === by_id('plan-pro')], [true, true]);
const chord = key(by_id('plan-pro'), 'ArrowDown', { altKey: true });
check('but with Alt held it is left to the browser', [chord.defaultPrevented, text('choices-echo')?.includes('Plan: pro.')], [false, true]);
key(by_id('plan-pro'), 'ArrowDown');
check('and skips a disabled option, wrapping around', text('choices-echo')?.includes('Plan: free.'), true);
check('a disabled option says so to a screen reader, an enabled one does not', [by_id('plan-team')?.getAttribute('aria-disabled'), by_id('plan-free')?.getAttribute('aria-disabled')], ['true', null]);

type_into(by_id('name-input'), 'Ada');
check('typing into a TextField reports every edit', text('name-echo'), 'You typed: Ada');
key(by_id('name-input'), 'Enter');
check('Enter submits', has('Hello, Ada'));
by_id('name-input')!.dispatchEvent(new FocusEvent('focus'));
flushSync();
const lit = by_id('name-input')!.classList.contains('focused');
by_id('name-input')!.dispatchEvent(new FocusEvent('blur'));
flushSync();
check('a focused field carries the class its border follows', [lit, by_id('name-input')!.classList.contains('focused')], [true, false]);
check('a disabled TextField is a disabled input', [(by_id('locked-input') as HTMLInputElement | null)?.disabled, (by_id('name-input') as HTMLInputElement | null)?.disabled], [true, false]);
check('the TextArea is a real field', by_id('notes-input') instanceof HTMLTextAreaElement, true);

key(by_id('fruit-trigger'), 'Enter');
key(by_id('fruit-trigger'), 'Enter', { repeat: true });
check('Enter opens the Select, and holding it picks nothing', [by_id('fruit-list-panel') !== null, text('fruit-echo')], [true, 'Picked: nothing yet']);
mouse(by_id('fruit-cherry')!, 'mouseenter');
key(by_id('fruit-trigger'), 'Enter');
check('the list opened on the first enabled option, which keeps the highlight under a hovered disabled one, and Enter picks it', [text('fruit-echo'), by_id('fruit-list-panel')], ['Picked: apple', null]);
click(by_id('fruit-trigger'));
check('a click opens the list too', by_id('fruit-list-panel') !== null);
click(by_id('fruit-banana'));
check('an option click picks it and closes the list', [text('fruit-echo'), by_id('fruit-list-panel')], ['Picked: banana', null]);
key(by_id('fruit-trigger'), 'ArrowDown');
check('an arrow key on the trigger opens the list', by_id('fruit-list-panel') !== null);
key(by_id('fruit-trigger'), 'ArrowDown');
key(by_id('fruit-trigger'), 'ArrowDown');
key(by_id('fruit-trigger'), 'Enter');
check('and the arrows wrap around, skipping a disabled option, before Enter picks', [text('fruit-echo'), by_id('fruit-list-panel')], ['Picked: apple', null]);

const back_chord = key(by_id('volume-track'), 'ArrowLeft', { altKey: true });
check('Alt+Left on a Slider is the browser’s Back, not a step', [back_chord.defaultPrevented, text('volume-echo')], [false, 'Volume: 40']);
key(by_id('volume-track'), 'ArrowRight');
check('an arrow key steps the Slider', text('volume-echo'), 'Volume: 41');
key(by_id('volume-track'), 'End');
check('End goes to the maximum, and the Progress follows', [text('volume-echo'), text('level'), by_id('level')?.getAttribute('aria-valuenow')], ['Volume: 100', 'Level 100%', '100']);
key(by_id('volume-track'), 'Home');
check('Home to the minimum', text('volume-echo'), 'Volume: 0');
// happy-dom lays nothing out: a 216 px track from x = 100, so its 200 px of travel start at 108.
const track = by_id('volume-track')!;
track.getBoundingClientRect = () => ({ x: 100, y: 0, left: 100, top: 0, right: 316, bottom: 24, width: 216, height: 24, toJSON: () => ({}) });
const at = (percent: number) => 108 + percent * 2;
// Pointer events, which a finger sends as well; the capture is what keeps them coming to the track from anywhere.
const captured: number[] = [];
track.setPointerCapture = (id) => void captured.push(id);
const pointer = (type: string, init: PointerEventInit = {}) => {
	track.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', ...init }));
	flushSync();
};
pointer('pointerdown', { button: 2, buttons: 2, clientX: at(90) });
const right_press = text('volume-echo');
pointer('pointerdown', { button: 0, buttons: 1, clientX: at(30) });
const pressed = text('volume-echo');
pointer('pointermove', { buttons: 1, clientX: at(60) });
const moved = text('volume-echo');
pointer('pointermove', { buttons: 1, clientX: 5000 });
const past_edge = text('volume-echo');
pointer('pointerup');
pointer('pointermove', { clientX: at(10) });
check(
	'a drag captures the pointer and follows it past the edge until the release; a right press starts none',
	[right_press, pressed, moved, past_edge, text('volume-echo'), captured],
	['Volume: 0', 'Volume: 30', 'Volume: 60', 'Volume: 100', 'Volume: 100', [7]]
);

click(by_id('tabs-activity'));
check('a Tab click switches the panel', text('tab-echo'), 'Nothing has happened yet.');
key(by_id('tabs-activity'), 'ArrowRight');
check('an arrow key moves to the next tab, and the focus with it', [text('tab-echo'), document.activeElement === by_id('tabs-settings')], ['Settings would go here.', true]);
key(by_id('tabs-settings'), 'ArrowRight');
check('and skips the disabled one, wrapping around', text('tab-echo')?.startsWith('An overview.'), true);
check('only the selected tab is a tab stop', [by_id('tabs-overview')?.tabIndex, by_id('tabs-settings')?.tabIndex, by_id('tabs-billing')?.tabIndex], [0, -1, -1]);

click(by_id('toast-plain'));
check('a toast shows in the Toaster, off <body>', [has('Saved'), layered('toaster')], [true, true]);
check('every toast has a dismiss button', closes().length, 2);
click(closes()[1]);
check('dismissing one leaves the other', [has('Saved'), has('Hello, Ada')], [false, true]);
click(by_id('toast-rich'));
check('a rich toast shows its description', [has('Export finished'), has('12 files written to ~/Desktop.')], [true, true]);
click([...document.querySelectorAll<HTMLElement>('[role="button"]')].find((el) => el.textContent?.trim() === 'Open'));
check('its action runs and dismisses it', [text('last'), has('Export finished')], ['Last action: Open', false]);
click(by_id('toast-sticky'));
const held = closes().at(-1)!;
held.focus();
click(by_id('toast-plain'));
check('a toast arriving while a toast’s button has the focus leaves the layer mounted and the focus on it', [has('Saved'), held.isConnected, document.activeElement === held], [true, true, true]);
held.blur();
click(closes().at(-1));
check('dismissing the newest toast leaves the others where they are', [has('Saved'), held.isConnected], [false, true]);
click(by_id('toast-plain'));
check('while a toast arriving otherwise remounts the layer, to land above a Dialog opened since', [has('Saved'), held.isConnected], [true, false]);
for (const close of closes()) click(close);

click(by_id('open-dialog'));
check('the Dialog opens in a Portal off <body>', [layered('dialog'), has('Delete this project?')], [true, true]);
key(window, 'Escape');
check('Escape closes it', by_id('dialog'), null);
click(by_id('open-dialog'));
by_id('cancel')!.dispatchEvent(new MouseEvent('mouseenter'));
await sleep(350);
flushSync();
const tip_shown = has('Keeps the project');
key(window, 'Escape');
check('Escape closes a Tooltip inside the Dialog first, and the Dialog stays', [tip_shown, has('Keeps the project'), by_id('dialog') !== null], [true, false, true]);
key(window, 'Escape');
check('and the Dialog on the next press', by_id('dialog'), null);
click(by_id('open-dialog'));
click(by_id('dialog-close'));
check('so does the close button', by_id('dialog'), null);
click(by_id('open-dialog'));
click(by_id('cancel'));
check('and an action that closes it', by_id('dialog'), null);
click(by_id('open-dialog'));
click(by_id('dialog-scrim'));
check('and a click on the scrim', by_id('dialog'), null);
click(by_id('open-dialog'));
mouse(by_id('dialog')!, 'mousedown');
mouse(by_id('dialog-scrim')!, 'click');
check('but not a press that began inside it and was let go over the scrim', by_id('dialog') !== null, true);
click(by_id('dialog'));
check('while a click inside stays inside', by_id('dialog') !== null, true);
click(by_id('confirm'));
check('the confirming action runs, closes it and toasts', [by_id('dialog'), text('last'), has('Project deleted')], [null, 'Last action: Deleted', true]);

viewport(600, 500);
check('media_query follows the viewport', text('layout'), 'narrow');
viewport(1024, 768);
check('and back', text('layout'), 'wide');

// --- the router -----------------------------------------------------------------
const route = () => [text('route'), location.pathname + location.search + location.hash];
const logged: unknown[][] = [];
const error = console.error;
const quiet = () => {
	logged.length = 0;
	console.error = (...args: unknown[]) => void logged.push(args);
};
/** Long enough for the reactions to every promise settled so far, and too short for a traversal to land. */
const tick = async () => {
	for (let i = 0; i < 10; i++) await Promise.resolve();
};
/** Waits for a traversal to land, and for every one the router asks for in answer to it. */
const pop = async (move: () => void = () => {}) => {
	move();
	await tick();
	for (const deadline = Date.now() + 3000; traversals > 0 && Date.now() < deadline; ) await sleep(1);
	flushSync();
};
/** A navigation the router may hold for a traversal: one it never lets go fails its check, where awaiting it would hang the run. */
const within = <T>(navigation: Promise<T>) => Promise.race([navigation, sleep(3000).then(() => 'never' as const)]);
/** A hook that waits to be answered, one answer per call. */
function asking<V = boolean>() {
	const answers: ((verdict: V) => void)[] = [];
	return { answers, hook: () => new Promise<V>((resolve) => answers.push(resolve)) };
}
/** A new tab as far as the router can tell: a history entry of its own, with nothing registered. Without a URL it is a reload, which reads the same entry again. */
function restart(url: string | null, options: Parameters<typeof start_router>[0]) {
	stop_router();
	if (url !== null) history.pushState(null, '', url);
	start_router(options);
	flushSync();
}
check('the Router starts from the page URL, in history mode', [text('screen')?.startsWith('Home.'), ...route(), router.mode], [true, 'At /', '/', 'history']);
check('a Link is a real link, active on its own screen', [by_id('go-items')?.getAttribute('href'), by_id('go-home')?.classList.contains('active'), by_id('go-items')?.classList.contains('active')], ['/items', true, false]);
click(by_id('go-items'));
check('and navigates through pushState', [...route(), by_id('go-items')?.classList.contains('active'), text('screen')?.startsWith('Three items')], ['At /items', '/items', true, true]);
const modified = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
by_id('go-item')!.dispatchEvent(modified);
flushSync();
check('a modified click is left to the browser', [modified.defaultPrevented, text('route')], [false, 'At /items']);
click(by_id('go-item-2'));
check('a Link inside a screen, built by href(), carries its param', [text('screen'), router.params], ['Item 2, mounted fresh for this path.', { id: '2' }]);
await pop(() => history.back());
check("the browser's back pops the stack, flags included", [...route(), router.can_go_back, router.can_go_forward], ['At /items', '/items', true, true]);
// A page leaves ⌘[ and ⌘] to the browser, which has them already; a window's Router handles them (test/ui.ts).
await pop(() => key(window, '[', { metaKey: true }));
check('⌘[ is left to the browser in a page', route(), ['At /items', '/items']);
await pop(() => history.forward());
check("the browser's forward goes again", route(), ['At /items/2', '/items/2']);
await pop(() => history.back());
click(by_id('go-lost'));
check("an unmatched path renders the table's * entry", text('screen'), "Nothing at /nowhere; this is the table's * entry.");
const off = before((to) => (to.path === '/items/3' ? '/' : to.path !== '/nowhere'));
click(by_id('go-item'));
check('a before hook can redirect', route(), ['At /', '/']);
click(by_id('go-lost'));
check('or cancel', route(), ['At /', '/']);
await pop(() => history.back());
check("and cancels the browser's own back, which is undone", route(), ['At /', '/']);
off();
navigate(href('/items/:id', { id: 'a b' }, { tab: 'notes' }), { state: { from: 'test' } });
flushSync();
check('navigate() from code: params decoded, the query kept, hidden state read back', [text('screen'), ...route(), router.query, router.state], ['Item a b, mounted fresh for this path.', 'At /items/a%20b?tab=notes', '/items/a%20b?tab=notes', { tab: 'notes' }, { from: 'test' }]);

// A reload is stop_router() and start_router() here: the module reads the same history entry again.
stop_router();
history.replaceState(null, '', '/items?x=1#install');
start_router({ mode: 'history' });
flushSync();
check('a deep link keeps its fragment in the address bar', [...route(), router.href], ['At /items?x=1', '/items?x=1#install', '/items?x=1']);
const seen = router.generation;
// What a browser does for a click on <a href="#section">: an entry with no state, and a popstate.
history.pushState(null, '', '/items?x=1#section');
window.dispatchEvent(new PopStateEvent('popstate'));
flushSync();
const followed = [router.generation - seen, location.hash, router.can_go_back];
await pop(() => history.back());
check('a fragment link and the way back from it are no navigation: the screen stays mounted, the fragment stays', [...followed, router.generation - seen, location.hash, router.can_go_forward], [0, '#section', true, 0, '#install', true]);
navigate('/items/2');
flushSync();
check('while a navigation mounts the screen afresh', router.generation - seen, 1);
window.dispatchEvent(new PopStateEvent('popstate'));
flushSync();
const again = router.generation - seen;
// Other code pushing a copy of this entry's state for another URL: a navigation, and one a hook cannot undo
// (history.go would be asked for 0 steps, a reload), so it stands.
const went: unknown[] = [];
const go = history.go;
history.go = (delta) => void went.push(delta);
const veto = before(() => false);
history.pushState({ ...history.state }, '', '/items/3');
window.dispatchEvent(new PopStateEvent('popstate'));
flushSync();
veto();
history.go = go;
check('a popstate on the entry the page is on moves nothing; a copy of its state under another URL navigates, and is never undone with a reload', [again, router.path, went], [1, '/items/3', []]);
navigate('/items#top');
flushSync();
check('a fragment given to navigate() goes to the address bar and stays out of the route', [router.path, location.pathname + location.hash, text('screen')?.startsWith('Three items')], ['/items', '/items#top', true]);

stop_router();
history.replaceState(null, '', '/');
start_router({ mode: 'history' });
navigate('/items');
navigate('/items/2');
await pop(() => history.back());
await pop(() => history.back());
stop_router();
start_router({ mode: 'history' });
flushSync();
const reloaded = [router.path, router.can_go_back, router.can_go_forward];
await pop(() => history.forward());
check('a reload on an older entry still knows what is ahead of it', [...reloaded, router.path, router.can_go_forward], ['/', false, true, '/items', true]);
const push = history.pushState;
history.pushState = () => {
	throw new DOMException('the state could not be cloned', 'DataCloneError');
};
const refused = await navigate('/nowhere').then(
	() => false,
	(thrown: unknown) => thrown instanceof DOMException
);
quiet();
click(by_id('go-lost'));
await tick();
console.error = error;
history.pushState = push;
check('a state the history API refuses rejects navigate(), which a Link logs, and leaves the router where it was', [refused, logged.map(([message]) => message), router.path, router.can_go_forward], [true, ['[gpuix-svelte-ui] a Link could not navigate to /nowhere'], '/items', true]);

stop_router();
start_router({ mode: 'hash', initial: '/' });
navigate('/items');
flushSync();
check('hash mode keeps the path in the fragment, and Links say so', [location.hash, text('route'), by_id('go-items')?.getAttribute('href')], ['#/items', 'At /items', '#/items']);
stop_router();
start_router({ mode: 'memory', initial: '/items/9' });
flushSync();
check('memory mode starts from `initial` and leaves the URL alone', [text('screen'), location.hash], ['Item 9, mounted fresh for this path.', '#/items']);

check('match() prefers a literal segment to a param, and * catches the rest', [match(['/items/:id', '/items/new'], '/items/new')?.pattern, match(['/items/:id'], '/items/7')?.params, match(['/a', '*'], '/b')?.pattern, match(['/a'], '/b')], ['/items/new', { id: '7' }, '*', null]);
check('href() encodes params and builds a query', [href('/items/:id', { id: 'a b' }, { q: 1, none: null }), href('/items/:id/:tab', { id: 1, tab: 'x' })], ['/items/a%20b?q=1', '/items/1/x']);

// The store itself, in memory mode, which is also a window's.
stop_router();
start_router({ mode: 'memory', initial: '/items/9' });
flushSync();
check(
	'a trailing /* takes the rest of the path, below a pattern naming those segments, decoded and joined, so an escaped slash reads as a separator',
	[match(['/docs/*', '/docs/:id', '*'], '/docs/a')?.pattern, match(['/docs/*', '/docs/:id'], '/docs/a/b%20c')?.params, match(['/docs/*', '*'], '/docs')?.params, match(['/docs/*', '/:a/:b/:c'], '/docs/a/b')?.pattern, href('/docs/*', { '*': 'a b/c' }), match(['/docs/*'], '/docs/a%2Fb/c')?.params],
	['/docs/:id', { '*': 'a/b c' }, { '*': '' }, '/docs/*', '/docs/a%20b/c', { '*': 'a/b/c' }]
);
const first = by_id('router')?.firstElementChild;
await navigate('?page=2');
flushSync();
const kept = by_id('router')?.firstElementChild === first;
await navigate('3');
flushSync();
check('a relative path resolves as a link would, and only a change of path mounts the screen afresh', [kept, router.href, by_id('router')?.firstElementChild === first, text('screen')], [true, '/items/3', false, 'Item 3, mounted fresh for this path.']);
await navigate('/items/3');
await navigate('/items/3');
back();
check('a navigation to the route already shown replaces it rather than stacking another entry', router.href, '/items/9?page=2');
await navigate(href('/items', {}, { tag: ['a', 'b'], none: [null] }));
check("href() repeats an array's key, and router.search keeps every value", [router.href, router.search.getAll('tag'), router.query.tag], ['/items?tag=a&tag=b', ['a', 'b'], 'b']);
const releases: ((verdict: boolean) => void)[] = [];
const off_async = before((to) => (to.path.startsWith('/items/') ? new Promise<boolean>((resolve) => releases.push(resolve)) : true));
const slow = navigate('/items/1');
const waiting = [router.navigating?.path, router.path];
const fast = navigate('/items/2');
releases[1](true);
const fast_arrived = await fast;
releases[0](true);
const slow_arrived = await slow;
off_async();
flushSync();
check('an async hook is waited for, and a newer navigation overtakes one still waiting', [...waiting, fast_arrived, slow_arrived, router.path, router.navigating], ['/items/1', '/items', true, false, '/items/2', null]);

const first_hook = asking();
const heard: string[] = [];
const off_first = before(first_hook.hook);
const off_second = before((to) => {
	heard.push(to.path);
	return to.path !== '/nowhere';
});
const overtaken_one = navigate('/items/1');
const overtaking = navigate('/items/3');
first_hook.answers[0](true);
first_hook.answers[1](true);
const in_turn = [await overtaken_one, await overtaking];
const second_refuses = navigate('/nowhere');
first_hook.answers[2](true);
in_turn.push(await second_refuses);
const unsubscribed = navigate('/items/2');
off_second();
first_hook.answers[3](true);
in_turn.push(await unsubscribed);
off_first();
check('hooks are asked in turn: one after an async yes still decides, and neither an overtaken navigation nor a hook unsubscribed meanwhile reaches it', [in_turn, heard, router.path], [[false, true, false, true], ['/items/3', '/nowhere'], '/items/2']);
const sent = asking<string>();
const off_sent = before((to) => (to.path === '/a' ? sent.hook() : true));
const sending = navigate('/a');
sent.answers[0]('/items/1');
const was_sent = [await sending, router.path];
off_sent();
back();
check('an async hook redirects as well', [...was_sent, router.path], [true, '/items/1', '/items/2']);

quiet();
const off_throw = before(() => {
	throw new Error('boom');
});
const threw = await navigate('/');
off_throw();
const off_reject = before(() => Promise.reject(new Error('async boom')));
const rejected = await navigate('/');
off_reject();
const off_loop = before((to) => (to.path === '/a' ? '/b' : to.path === '/b' ? '/a' : true));
const looped = await navigate('/a');
off_loop();
console.error = error;
check('a hook that throws or rejects cancels the navigation, and so does a redirect loop, each logged', [threw, rejected, looped, router.path, logged.length], [false, false, false, '/items/2', 3]);
const off_nav = before((to) => {
	if (to.path === '/nowhere') void navigate('/items');
});
const outer = await navigate('/nowhere');
off_nav();
check("a hook's own navigate() takes over from the navigation it was asked about", [outer, router.path], [false, '/items']);
const arrivals: string[] = [];
const off_after = after((to, from) => void arrivals.push(`${from.path} > ${to.path}`));
await navigate('/items/1');
back();
off_after();
check('after() hears every arrival, back() included', arrivals, ['/items > /items/1', '/items/1 > /items']);

restart(null, { mode: 'memory', initial: '/a/b?x=1' });
check(
	'a path resolves as a link on the page would, by the router itself, to which a colon or a second slash names no scheme or host',
	[resolve('c').href, resolve('../c').href, resolve('./c/').href, resolve('').href, resolve('#top').href, resolve('?y=2').href, resolve('item:3').path, resolve('//host/x').path],
	['/a/c', '/c', '/a/c', '/a/b?x=1', '/a/b?x=1', '/a/b?y=2', '/a/item:3', '/host/x']
);
check(
	'a route is escaped as the address bar has it and its params decoded, and a path from the root keeps its dots, so a param that is all dots stays a param',
	[resolve('/items/café').path, resolve('/items/café').params, resolve("/s?q=it's a").href, resolve('/half\ud83d').path, resolve(href('/items/:id', { id: '..' })).params, resolve('/items/%2E').params, resolve('/items/../x').path],
	['/items/caf%C3%A9', { id: 'café' }, '/s?q=it%27s%20a', '/half%EF%BF%BD', { id: '..' }, { id: '.' }, '/items/../x']
);
await navigate('/items');
await navigate('');
await navigate('#top');
const stayed_put = router.href;
back();
check('an empty path and a bare fragment stay on the route, stacking nothing in a window', [stayed_put, router.href], ['/items', '/a/b?x=1']);

stop_router();
before((to) => (to.path === '/items/5' ? '/items' : true));
start_router({ mode: 'memory', initial: '/items/5' });
const redirected = [router.path, router.can_go_back];
stop_router();
let admit: (verdict: boolean) => void = () => {};
const first_seen: string[] = [];
before(() => new Promise<boolean>((resolve) => (admit = resolve)));
after((to, from) => void first_seen.push(`${from.href} > ${to.href}`));
start_router({ mode: 'memory', initial: '/items/6' });
flushSync();
const holding = [router.ready, text('screen'), first_seen.length];
admit(false);
await sleep(0);
flushSync();
check(
	'the hooks decide on the first screen too: a redirect replaces it, an async one is waited for, a no has nothing to stay on and lets it show, and after() hears of it',
	[...redirected, ...holding, router.ready, text('screen'), first_seen],
	['/items', false, false, '', 0, true, 'Item 6, mounted fresh for this path.', ['/items/6 > /items/6']]
);
stop_router();
history.pushState(null, '', '/items/5');
before((to) => (to.path === '/items/5' ? '/items' : true));
start_router({ mode: 'history' });
check('in a page a redirect of the first screen replaces its URL', [location.pathname, router.path, router.can_go_back], ['/items', '/items', false]);
stop_router();
const gate = asking();
before(gate.hook);
start_router({ mode: 'memory', initial: '/items/6' });
const overtook = navigate('/items/2');
gate.answers[1](true);
await within(overtook);
flushSync();
check('a navigation that overtakes the hooks of the first screen shows its own', [router.ready, text('screen'), router.can_go_back], [true, 'Item 2, mounted fresh for this path.', true]);

// The first screen as an app gets it, from the Router's own mount: the table is in place by the time the hooks are asked.
stop_router();
const admin = asking<string>();
const admitted: string[] = [];
before((to) => (to.pattern === '/admin/:id' && to.params.id === '7' ? admin.hook() : true));
after((to, from) => void admitted.push(`${from.href} > ${to.href}`));
const guarded_host = document.body.appendChild(document.createElement('div'));
const page = (name: string) => screen(createRawSnippet(() => ({ render: () => `<p>${name}</p>` })) as never);
// The showcase's table and a pattern it lacks, which only this Router's own registration can have matched.
const guarded = mount(Router, { target: guarded_host, props: { routes: { '/': page('home'), '/items': page('items'), '/items/:id': page('item'), '/admin/:id': page('secret'), '*': page('lost') }, mode: 'memory', initial: '/admin/7', testid: 'guarded' } });
flushSync();
const guarding = [router.ready, text('guarded'), admin.answers.length, admitted.length];
admin.answers[0]('/');
await sleep(0);
flushSync();
check(
	'a hook sees the pattern and params of a deep link, and its async redirect never shows the screen it guards',
	[...guarding, router.ready, text('guarded'), admitted, router.can_go_back],
	[false, '', 1, 0, true, 'home', ['/admin/7 > /'], false]
);
unmount(guarded);
guarded_host.remove();

restart('/repo/items/2', { mode: 'history', base: '/repo/' });
const based = [router.path, by_id('go-items')?.getAttribute('href'), by_id('go-items')?.getAttribute('aria-current'), by_id('go-home')?.getAttribute('aria-current')];
click(by_id('go-home'));
check('a base path is stripped before matching and put back on every URL, and the active Link says so', [...based, location.pathname, router.path], ['/items/2', '/repo/items', 'page', null, '/repo/', '/']);
restart('/repo', { mode: 'history', base: '/repo' });
const bare = router.path;
restart('/my repo/items', { mode: 'history', base: '/my repo' });
check('the base alone is the root, and one that needs escaping is stripped as the address bar has it', [bare, router.path, by_id('go-home')?.getAttribute('href'), location.pathname], ['/', '/items', '/my%20repo/', '/my%20repo/items']);

// Every move the router makes through history by itself, which is never one of 0: that reloads the page.
const moves: number[] = [];
const travel = history.go;
const watched_go = (delta = 0) => {
	moves.push(delta);
	if (delta !== 0) travel.call(history, delta);
};
history.go = watched_go;

restart('/', { mode: 'history' });
await navigate('/items');
const leaving = asking();
const off_leaving = before(leaving.hook);
await pop(() => history.back());
const asked = [location.pathname, router.path, router.navigating?.path, router.can_go_back, router.can_go_forward];
leaving.answers[0](false);
await pop();
off_leaving();
check(
	"an async hook refusing the browser's back puts the browser back where it was, flags included",
	[...asked, location.pathname, router.path, router.navigating, router.can_go_back, router.can_go_forward, moves.splice(0)],
	['/', '/items', '/', false, true, '/items', '/items', null, true, false, [1]]
);

async function back_then_forward(mode: 'history' | 'hash', answer: boolean) {
	restart('/', { mode });
	await navigate('/items');
	const leaving = asking();
	before(leaving.hook);
	await pop(() => history.back());
	const asked = leaving.answers.length;
	// The router's own forward() in one, the browser's button in the other.
	await pop(mode === 'hash' ? forward : () => history.forward());
	const returned = [router.navigating, leaving.answers.length];
	leaving.answers[0](answer);
	await pop();
	return [asked, ...returned, router.href, mode === 'hash' ? location.hash.slice(1) : location.pathname, router.can_go_back, router.can_go_forward, moves.splice(0)];
}
check(
	'back and then forward while a hook waits is back on the screen shown: the hook is not asked again, and neither answer moves anything',
	[await back_then_forward('history', true), await back_then_forward('hash', false)],
	[
		[1, null, 1, '/items', '/items', true, false, []],
		[1, null, 1, '/items', '/items', true, false, [1]]
	]
);

async function two_backs(mode: 'history' | 'memory', answer: boolean) {
	restart(mode === 'memory' ? null : '/', { mode, initial: '/' });
	await navigate('/items');
	await navigate('/items/2');
	const leaving = asking();
	before(leaving.hook);
	back();
	back();
	await pop();
	const waiting = [router.href, router.navigating?.href, router.can_go_back, router.can_go_forward, leaving.answers.length];
	leaving.answers[1](answer);
	await pop();
	return [...waiting, router.href, router.can_go_back, router.can_go_forward, moves.splice(0)];
}
check(
	'two back() calls while a hook waits go back two entries in a page and in a window alike, the flags describing where already',
	[await two_backs('history', true), await two_backs('memory', true)],
	[
		['/items/2', '/', false, true, 2, '/', false, true, [-1, -1]],
		['/items/2', '/', false, true, 2, '/', false, true, []]
	]
);
check(
	'and a no moves back over both',
	[await two_backs('history', false), await two_backs('memory', false)],
	[
		['/items/2', '/', false, true, 2, '/items/2', true, false, [-1, -1, 2]],
		['/items/2', '/', false, true, 2, '/items/2', true, false, []]
	]
);

restart('/', { mode: 'history' });
await navigate('/items');
await navigate('/items/2');
const refused_at_once: string[] = [];
const off_at_once = before((to) => {
	refused_at_once.push(to.href);
	return false;
});
back();
back();
await pop();
off_at_once();
check(
	'the router asks the browser for one move at a time, so two back() calls refused at once are each moved back before the next',
	[location.pathname, router.href, router.can_go_back, router.can_go_forward, refused_at_once, moves.splice(0)],
	['/items/2', '/items/2', true, false, ['/items', '/items'], [-1, 1, -1, 1]]
);
const crossing = asking();
const off_crossing = before(crossing.hook);
back();
await pop();
back();
crossing.answers[0](false);
await tick();
await pop();
const asked_next = router.navigating?.href;
crossing.answers[1](false);
await pop();
off_crossing();
check('a no that arrives while another back is on its way leaves the stack to that one', [asked_next, location.pathname, router.href, moves.splice(0)], ['/', '/items/2', '/items/2', [-1, -1, 2]]);
const behind = asking();
const off_behind = before((to) => (to.path === '/items/3' ? true : behind.hook()));
back();
await pop();
back();
const went_on = navigate('/items/3');
await pop();
const arrived_on = [await within(went_on), location.pathname, router.can_go_back, moves.splice(0)];
off_behind();
await pop(() => history.back());
check('a navigation made behind a back that is on its way waits for it, then starts from the screen shown as any other', [...arrived_on, location.pathname], [true, '/items/3', true, [-1, -1, 2], '/items/2']);
await pop(() => history.forward());
const off_lost = before((to) => to.path !== '/items/2');
// A move the browser never makes here, as when an iframe takes it.
history.go = (delta = 0) => void moves.push(delta);
await pop(() => history.back());
const kept_waiting = navigate('/items/9');
const meanwhile = await Promise.race([kept_waiting, sleep(200).then(() => 'held')]);
const released = await Promise.race([kept_waiting, sleep(1500).then(() => 'stuck')]);
off_lost();
history.go = watched_go;
check('a move back that never lands holds a navigation for a second, not for ever', [meanwhile, released, router.href, moves.splice(0)], ['held', true, '/items/9', [1]]);

async function overtaken(mode: 'history' | 'memory') {
	const press_back = mode === 'memory' ? back : () => history.back();
	restart(mode === 'memory' ? null : '/', { mode, initial: '/' });
	await navigate('/items');
	const leaving = asking();
	const off = before(leaving.hook);
	await pop(press_back);
	const lost = navigate('/nowhere');
	await pop();
	leaving.answers[1](false);
	const refused = [await within(lost), router.href, router.can_go_back, router.can_go_forward];
	await pop(press_back);
	const typed = navigate('?q=a', { replace: true });
	await pop();
	leaving.answers[3](true);
	const replaced = [await within(typed), router.href];
	off();
	await pop(press_back);
	return [...refused, ...replaced, router.href, router.can_go_forward, moves.splice(0)];
}
check(
	'a navigation made while a back waits for its hooks starts from the screen shown: the stack moves back first, so a refusal leaves it there and a replacement lands on that entry',
	[await overtaken('history'), await overtaken('memory')],
	[
		[false, '/items', true, false, true, '/items?q=a', '/', true, [1, 1]],
		[false, '/items', true, false, true, '/items?q=a', '/', true, []]
	]
);

restart('/', { mode: 'history' });
await navigate('/items');
await navigate('/items/3');
const staying = asking();
// Asked about the back alone, so the navigation after it would be written at once were it not held.
const off_staying = before((to) => (to.query.saved ? true : staying.hook()));
await pop(() => history.back());
staying.answers[0](false);
await tick();
const on_the_way = [moves.splice(0), location.pathname];
await within(navigate('?saved=1', { replace: true }));
off_staying();
const stayed = location.pathname + location.search;
await pop(() => history.back());
check('a navigation made right after a no waits for the browser to be back, and is written on the entry shown', [...on_the_way, stayed, location.pathname, router.can_go_forward], [[1], '/items', '/items/3?saved=1', '/items', true]);

restart('/', { mode: 'history' });
await navigate('/items');
const followed_fragment = asking();
const off_followed = before(followed_fragment.hook);
await pop(() => history.back());
// A fragment link followed meanwhile: its entry takes the place of the one shown, so there is no entry left to go back to.
history.pushState(null, '', '/#sec');
window.dispatchEvent(new PopStateEvent('popstate'));
followed_fragment.answers[1](false);
await pop();
off_followed();
check('a no with no entry left to go back to rewrites the one the browser is on, and never reloads', [location.pathname + location.hash, router.href, router.can_go_back, moves.splice(0)], ['/items', '/items', true, []]);

restart('/', { mode: 'hash' });
await navigate('/a');
await navigate('/b');
await pop(() => history.go(-2));
const off_typed = before(() => false);
history.pushState(null, '', '#/typed');
window.dispatchEvent(new PopStateEvent('popstate'));
await pop();
off_typed();
const typed_and_refused = [location.hash, router.path, router.can_go_forward, moves.splice(0)];
restart(null, { mode: 'hash' });
await pop(() => history.forward());
check('the entry gone back to after a no carries the stack as it is now, which a reload reads', [...typed_and_refused, router.path, router.can_go_forward], ['#/', '/', true, [-2, -1], '/typed', false]);

async function redirected_back(mode: 'history' | 'memory') {
	restart(mode === 'memory' ? null : '/items/7', { mode, initial: '/items/7' });
	await navigate('/items');
	flushSync();
	const login = asking<string>();
	const arrivals: string[] = [];
	before((to) => (to.params.id === '7' ? login.hook() : true));
	after((to, from) => void arrivals.push(`${from.href} > ${to.href}`));
	await pop(mode === 'memory' ? back : () => history.back());
	const waiting = [router.href, text('screen')?.startsWith('Three items'), arrivals.length];
	login.answers[0]('/');
	await pop();
	const landed = [router.href, text('screen')?.startsWith('Home.'), arrivals.slice(), router.can_go_back, router.can_go_forward];
	await pop(mode === 'memory' ? forward : () => history.forward());
	await pop(mode === 'memory' ? back : () => history.back());
	return [...waiting, ...landed, router.href];
}
check(
	'an async redirect on the way back replaces the entry gone to, and the screen it guards never shows and is never reported',
	[await redirected_back('history'), await redirected_back('memory')],
	[
		['/items', true, 0, '/', true, ['/items > /'], false, true, '/'],
		['/items', true, 0, '/', true, ['/items > /'], false, true, '/']
	]
);
moves.length = 0;

restart('/', { mode: 'hash' });
await navigate(href('/items/:id', { id: '..' }));
flushSync();
const dots = [location.hash, text('screen')];
restart(null, { mode: 'hash' });
check('a param that is all dots survives a reload in hash mode, whose fragment the browser leaves alone', [...dots, router.params], ['#/items/..', 'Item .., mounted fresh for this path.', { id: '..' }]);

restart('/items', { mode: 'history' });
const entries = history.length;
const mounted_screen = by_id('router')?.firstElementChild;
await navigate('/items');
const same_url = history.length - entries;
await navigate('/items#a');
await navigate('/items#b');
await navigate('/items#b');
const stacked = history.length - entries;
await pop(() => history.back());
check(
	'a navigation to the URL the page is on replaces its entry, while one to another fragment of it is a new entry to come back from, the screen staying mounted',
	[same_url, stacked, location.pathname + location.hash, router.path, router.can_go_forward, by_id('router')?.firstElementChild === mounted_screen],
	[0, 2, '/items#a', '/items', true, true]
);
history.go = travel;

const links = document.body.appendChild(document.createElement('div'));
const label = createRawSnippet(() => ({ render: () => '<span>link</span>' }));
mount(Link, { target: links, props: { href: 'https://example.com/', children: label, testid: 'away' } });
mount(Link, { target: links, props: { href: '/items?tab=a', children: label, testid: 'tab-a' } });
mount(Link, { target: links, props: { href: '/items?tab=b', children: label, testid: 'tab-b' } });
await navigate('/items?tab=a');
flushSync();
let followed_away: boolean | null = null;
document.addEventListener(
	'click',
	(e) => {
		followed_away = !e.defaultPrevented;
		e.preventDefault();
	},
	{ once: true }
);
by_id('away')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const inner = by_id('tab-b')!.querySelector('span')!;
inner.addEventListener('click', (e) => e.preventDefault());
click(inner);
check('a Link to another site is a plain link, one with a query is active only on that query, and one whose click was handled already stays put', [by_id('away')?.getAttribute('href'), followed_away, by_id('tab-a')?.classList.contains('active'), by_id('tab-b')?.classList.contains('active'), router.href], ['https://example.com/', true, true, false, '/items?tab=a']);
links.remove();

const lazy_host = document.body.appendChild(document.createElement('div'));
quiet();
mount(Router, { target: lazy_host, props: { routes: { '/items': lazy(async () => ({ default: Separator })), '*': lazy(() => Promise.reject(new Error('gone'))) }, testid: 'lazy-router' } });
flushSync();
await sleep(0);
flushSync();
const loaded = by_id('lazy-router')?.querySelector('[role="separator"]') != null;
await navigate('/elsewhere');
await sleep(0);
flushSync();
let imports = 0;
const flaky = lazy(async () => {
	if (imports++ === 0) throw new Error('offline');
	return { default: Separator };
}) as LazyScreen;
const flaked = await flaky.load().then(
	() => false,
	() => true
);
const retried = await flaky.load().then(
	(component) => component === Separator,
	() => false
);
console.error = error;
check('a lazy() screen mounts once its import resolves, and a failed one is logged and imported again on the next visit', [loaded, flaked, retried, imports, logged.length], [true, true, true, 2, 2]);
lazy_host.remove();

// --- components by themselves, for the props the showcase never gives them ------------
const host = document.body.appendChild(document.createElement('div'));
const lone_tabs = [
	{ value: 'a', label: 'A', disabled: true },
	{ value: 'b', label: 'B' },
	{ value: 'c', label: 'C' }
];
mount(Tabs, { target: host, props: { items: lone_tabs, value: 'gone', onchange: () => {}, testid: 'lone' } });
const stepped: number[] = [];
mount(Slider, { target: host, props: { value: 0.5, min: 0.5, max: 10.5, step: 1, onchange: (v: number) => stepped.push(v), testid: 'half' } });
mount(TextField, { target: host, props: { value: '', onchange: () => {}, error: 'Required', testid: 'bad' } });
mount(Avatar, { target: host, props: { name: '😀 smith', testid: 'face' } });
flushSync();
check('with a value that names no tab, the first enabled one is the tab stop', [by_id('lone-a')?.tabIndex, by_id('lone-b')?.tabIndex, by_id('lone-c')?.tabIndex, by_id('lone-a')?.getAttribute('aria-disabled')], [-1, 0, -1, 'true']);
key(by_id('half-track'), 'ArrowRight');
check('a Slider steps on its own grid where min has more decimals than step', stepped, [1.5]);
check('a field with an error says it is invalid, one without does not', [by_id('bad-input')?.getAttribute('aria-invalid'), by_id('name-input')?.getAttribute('aria-invalid')], ['true', 'false']);
check('Avatar initials keep a whole emoji', text('face'), '😀S');

finish('ui-dom', 135);
