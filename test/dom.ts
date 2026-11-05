/**
 * The DOM twin, mounted for real: happy-dom stands in for the browser, the components and the
 * cross-target example are compiled without the custom renderer (as Vite would), and every
 * `gpuix-svelte` import in them is pointed at src/dom.ts, because this process runs under the
 * custom-renderer condition and would otherwise hand them the GPUI entry. `test:cross-target`
 * is the same component on GPUI.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ width: 1024, height: 768 });

// After the registration, or Svelte's client runtime would be evaluated with no `document`.
const { compile } = await import('svelte/compiler');
const { flushSync } = await import('svelte');
const { check, finish } = await import('gpuix-svelte/test');
const dom = await import('../src/dom.ts');
const gpui = await import('../src/web.ts');

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = join(root, 'test/.dom-tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const DOM_MODULE = JSON.stringify(pathToFileURL(join(root, 'src/dom.ts')).href);

/** What a bundler does from the package's `exports`: the package name to the DOM entry, a component to its DOM twin. */
function compile_for_dom(path: string): string {
	const { js } = compile(readFileSync(path, 'utf8'), { filename: path, generate: 'client', runes: true, css: 'injected' });
	const code = js.code
		.replace(/(['"])gpuix-svelte\/components\/(\w+)\.svelte\1/g, '$1./$2.js$1')
		.replace(/(['"])\.\/(\w+)\.svelte\1/g, '$1./$2.js$1')
		.replace(/(['"])gpuix-svelte\1/g, DOM_MODULE);
	const out = join(tmp, `${basename(path, '.svelte')}.js`);
	writeFileSync(out, code);
	return pathToFileURL(out).href;
}

for (const name of ['Anchored', 'Scroller', 'Portal', 'Tooltip', 'Popover']) compile_for_dom(join(root, 'src/components/dom', `${name}.svelte`));
const CrossTarget = (await import(compile_for_dom(join(root, 'examples/cross-target/CrossTarget.svelte')))).default;

const by_id = (id: string) => document.querySelector<HTMLElement>(`[testid="${id}"], [data-testid="${id}"]`);
const text = (id: string) => by_id(id)?.textContent?.trim() ?? null;
const css_var = (name: string) => document.documentElement.style.getPropertyValue(`--${name}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function click(target: HTMLElement | null | undefined) {
	if (!target) throw new Error('nothing to click');
	target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	flushSync();
}

function mouse(target: HTMLElement | null | undefined, type: 'mousedown' | 'mouseenter' | 'mouseleave') {
	if (!target) throw new Error(`nothing to ${type}`);
	target.dispatchEvent(new MouseEvent(type, { bubbles: type === 'mousedown' }));
	flushSync();
}

function key(name: string, init: KeyboardEventInit = {}) {
	const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
	window.dispatchEvent(event);
	flushSync();
	return event;
}

// --- the entry --------------------------------------------------------------
check('is_gpuix() is false on the DOM entry', dom.is_gpuix(), false);
check('and true on the GPUI entry', gpui.is_gpuix(), true);

dom.set_css_vars({ surface: '#fff', '--gap': 8 });
check('set_css_vars writes custom properties on :root', [css_var('surface'), css_var('gap')], ['#fff', '8']);
dom.set_css_vars({ surface: null });
check('null removes one and leaves the rest', [css_var('surface'), css_var('gap')], ['', '8']);

const keys: Array<{ key?: string; cmd?: boolean; editing: boolean }> = [];
const off = dom.on_window_key('keydown', (e) => {
	keys.push({ key: e.key, cmd: e.modifiers?.cmd, editing: e.editing });
	if (e.key === 'escape') e.preventDefault();
});
key('ArrowUp', { metaKey: true });
check('a window key arrives GPUI-spelled, with modifiers', keys.at(-1), { key: 'up', cmd: true, editing: false });
const field = document.createElement('input');
document.body.append(field);
field.focus();
key(' ');
check('a key typed into a field is editing', keys.at(-1), { key: 'space', cmd: false, editing: true });
field.blur();
field.remove();
check('preventDefault reaches the DOM event', key('Escape').defaultPrevented, true);
off();
key('a');
check('the unsubscribe stops it', keys.length, 3);
let refused = '';
try {
	dom.on_window_key('keypress' as never, () => {});
} catch (error) {
	refused = (error as Error).message;
}
check('an unknown type throws', /unknown type "keypress"/.test(refused), true);

let selections = 0;
const off_selection = dom.on_selection_change((e) => {
	if (e.eventType === 'selectionChange') selections++;
});
document.dispatchEvent(new Event('selectionchange'));
off_selection();
document.dispatchEvent(new Event('selectionchange'));
check('on_selection_change hears selectionchange until unsubscribed', selections, 1);

const a = document.createElement('input');
const b = document.createElement('input');
document.body.append(a, b);
dom.focus_element(a);
check('focus_element focuses, focused_element reports it', dom.focused_element() === (a as unknown), true);
dom.focus_next();
check('focus_next moves to the next tab stop', document.activeElement === b, true);
dom.focus_next();
check('and wraps', document.activeElement === a, true);
dom.focus_previous();
check('focus_previous wraps back', document.activeElement === b, true);
dom.blur();
check('blur leaves nothing focused', dom.focused_element(), null);
a.remove();
b.remove();

const img = document.createElement('img');
dom.set_image(img, new Uint8Array([137, 80, 78, 71]));
check('set_image shows the bytes through an object URL', img.src.startsWith('blob:'), true);

check('the picker resolves to null', await dom.prompt_for_paths(), null);
check('read_native and get_native answer null', [dom.read_native(() => 1), dom.get_native()], [null, null]);
check('the overlay reads as undefined', [dom.set_debug_overlay('full'), dom.debug_overlay_stats()].map(String), ['undefined', 'undefined']);
check('window_size reads the viewport', [dom.window_size.width, dom.window_size.height], [1024, 768]);

// --- the cross-target example -----------------------------------------------
dom.render(CrossTarget, { title: 'Cross-target test' });
check('render() mounts into <body> and titles the page', [document.title, by_id('app') !== null], ['Cross-target test', true]);
check('the badge says DOM', text('target'), 'DOM');
check('window_size renders', text('size'), '1024 × 768');
(window as unknown as { happyDOM: { setViewport(viewport: { width: number; height: number }): void } }).happyDOM.setViewport({ width: 800, height: 600 });
window.dispatchEvent(new Event('resize'));
flushSync();
check('and follows a resize', text('size'), '800 × 600');

check('the palette landed through set_css_vars', css_var('bg'), '#1e1e2e');
click(by_id('theme'));
check('the theme button flips it', css_var('bg'), '#eff1f5');
key('t');
check('and so does the T shortcut', css_var('bg'), '#1e1e2e');

const rows = () => by_id('list')!.querySelectorAll('[class~="row"]').length;
check('the Scroller holds every row', rows(), 60);
click(by_id('list')!.querySelector<HTMLElement>('[class~="row"]'));
check('a click removes a row', rows(), 59);

mouse(by_id('theme'), 'mouseenter');
await sleep(350);
flushSync();
const tip = document.querySelector<HTMLElement>('[role="tooltip"]');
check('the tooltip shows after the delay, hung off <body>', [tip?.textContent, tip?.parentElement?.parentElement === document.body], ['Toggle the theme (T)', true]);
mouse(by_id('theme'), 'mouseleave');
await sleep(120);
flushSync();
check('and hides once the pointer leaves', document.querySelector('[role="tooltip"]'), null);

click(by_id('menu-trigger'));
check('the Popover opens its panel off <body>', [by_id('item-rename') !== null, by_id('menu-panel')?.parentElement?.parentElement === document.body], [true, true]);
click(by_id('item-rename'));
check('an item click reports and closes', [text('picked')?.startsWith('Picked: Rename'), by_id('menu-panel')], [true, null]);
click(by_id('menu-trigger'));
mouse(by_id('menu-panel'), 'mousedown');
check('a press inside the panel keeps it open', by_id('menu-panel') !== null, true);
mouse(document.body, 'mousedown');
check('a press outside closes it', by_id('menu-panel'), null);
click(by_id('menu-trigger'));
key('Escape');
check('so does Escape', by_id('menu-panel'), null);

click(by_id('open'));
check('the Portal paints the dialog from <body>', by_id('dialog')?.closest('[class~="portal"]')?.parentElement === document.body, true);
key('Escape');
check('Escape closes it through on_window_key', by_id('dialog'), null);
click(by_id('open'));
click(by_id('close'));
check('and so does its Close button', by_id('dialog'), null);
click(by_id('open'));
click(by_id('dialog'));
check('a click inside the dialog stays inside', by_id('dialog') !== null, true);
click(by_id('dialog')!.parentElement);
check('a click on the scrim closes it', by_id('dialog'), null);

dom.render(CrossTarget, { title: 'again' });
check('a second render() replaces the first', [document.querySelectorAll('[testid="app"]').length, document.title], [1, 'again']);

rmSync(tmp, { recursive: true, force: true });
finish('dom', 42);
