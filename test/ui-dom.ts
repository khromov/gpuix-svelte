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

// After the registration, or Svelte's client runtime would be evaluated with no `document`.
const { check, finish } = await import('gpuix-svelte/test');
// The router API comes from the bundle, where it is the instance the showcase's Router drives.
const { Showcase, Avatar, Slider, Tabs, TextField, mount, flushSync, router, navigate, before, href, match, start_router, stop_router } = (await import(pathToFileURL(join(tmp, 'dist/showcase.js')).href)) as {
	Showcase: never;
	Avatar: never;
	Slider: never;
	Tabs: never;
	TextField: never;
	mount(component: never, options: { target: Element; props?: Record<string, unknown> }): unknown;
	flushSync(): void;
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
history.back();
await sleep(20);
flushSync();
check("the browser's back pops the stack, flags included", [...route(), router.can_go_back, router.can_go_forward], ['At /items', '/items', true, true]);
// A page leaves ⌘[ and ⌘] to the browser, which has them already; a window's Router handles them (test/ui.ts).
key(window, '[', { metaKey: true });
await sleep(20);
flushSync();
check('⌘[ is left to the browser in a page', route(), ['At /items', '/items']);
history.forward();
await sleep(20);
flushSync();
check("the browser's forward goes again", route(), ['At /items/2', '/items/2']);
history.back();
await sleep(20);
flushSync();
click(by_id('go-lost'));
check("an unmatched path renders the table's * entry", text('screen'), "Nothing at /nowhere; this is the table's * entry.");
const off = before((to) => (to.path === '/items/3' ? '/' : to.path !== '/nowhere'));
click(by_id('go-item'));
check('a before hook can redirect', route(), ['At /', '/']);
click(by_id('go-lost'));
check('or cancel', route(), ['At /', '/']);
history.back();
await sleep(20);
flushSync();
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
history.back();
await sleep(20);
flushSync();
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
history.back();
await sleep(20);
history.back();
await sleep(20);
stop_router();
start_router({ mode: 'history' });
flushSync();
const reloaded = [router.path, router.can_go_back, router.can_go_forward];
history.forward();
await sleep(20);
flushSync();
check('a reload on an older entry still knows what is ahead of it', [...reloaded, router.path, router.can_go_forward], ['/', false, true, '/items', true]);
const push = history.pushState;
history.pushState = () => {
	throw new DOMException('the state could not be cloned', 'DataCloneError');
};
let refused = false;
try {
	navigate('/nowhere');
} catch {
	refused = true;
}
history.pushState = push;
check('a state the history API refuses leaves the router where it was', [refused, router.path, router.can_go_forward], [true, '/items', true]);

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

finish('ui-dom', 99);
