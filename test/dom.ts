/**
 * The DOM side of the package, mounted for real: happy-dom stands in for the browser, the components and the
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
const { flushSync, mount, unmount } = await import('svelte');
const { check, finish } = await import('gpuix-svelte/test');
const dom = await import('../src/dom.ts');
const gpui = await import('../src/web.ts');

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = join(root, 'test/.dom-tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const DOM_MODULE = JSON.stringify(pathToFileURL(join(root, 'src/dom.ts')).href);

/** What a bundler does from the package's `exports`: the package name to the DOM entry, a component to its DOM version. */
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
const tooltip = () => document.querySelector<HTMLElement>('[role="tooltip"]');

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

const inputs = (...types: string[]) =>
	types.map((type) => {
		const input = document.createElement('input');
		input.type = type;
		document.body.append(input);
		return input;
	});

/** happy-dom lays nothing out, so a trigger's box is whatever the test says it is. */
function box_of(target: HTMLElement, left: number, top: number, width: number, height: number) {
	const rect = { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => null };
	Object.defineProperty(target, 'getBoundingClientRect', { value: () => rect, configurable: true });
}

// --- the entry --------------------------------------------------------------
check('IS_GPUIX is false on the DOM entry', dom.IS_GPUIX, false);
check('and true on the GPUI entry', gpui.IS_GPUIX, true);

const HOST_ONLY = new Set(['renderer', 'set_native', 'create_root', 'commit', 'is_dirty', 'set_auto_commit', 'dispatch']);
check(
	'dom.ts exports everything web.ts does, bar the host plumbing',
	Object.keys(gpui).filter((name) => !HOST_ONLY.has(name) && !(name in dom)),
	[]
);
check(
	'and nothing web.ts lacks, bar the render_hot that names the bin',
	Object.keys(dom).filter((name) => !(name in gpui) && name !== 'render_hot'),
	[]
);
check('render_hot rejects, naming the bin', await dom.render_hot('app.svelte').then(() => '', (error: Error) => /gpuix-svelte bin/.test(error.message)), true);

dom.set_css_vars({ surface: '#fff', '--gap': 8 });
check('set_css_vars writes custom properties on :root', [css_var('surface'), css_var('gap')], ['#fff', '8']);
dom.set_css_vars({ surface: null });
check('null removes one and leaves the rest', [css_var('surface'), css_var('gap')], ['', '8']);

const keys: Array<{ key?: string; cmd?: boolean; alt?: boolean; editing: boolean }> = [];
const off = dom.on_window_key('keydown', (e) => {
	keys.push({ key: e.key, cmd: e.modifiers?.cmd, alt: e.modifiers?.alt, editing: e.editing });
	if (e.key === 'escape') e.preventDefault();
});
key('ArrowUp', { metaKey: true });
check('a window key arrives GPUI-spelled, with modifiers', keys.at(-1), { key: 'up', cmd: true, alt: false, editing: false });
const [field, box] = inputs('text', 'checkbox');
field.focus();
key(' ');
check('a key typed into a text field is editing', keys.at(-1), { key: 'space', cmd: false, alt: false, editing: true });
box.focus();
key('x');
check('a focused checkbox is not', keys.at(-1)?.editing, false);
box.blur();
field.remove();
box.remove();
key('†', { altKey: true, code: 'KeyT' });
check('⌥T is the key t with alt, as GPUI spells it', keys.at(-1), { key: 't', cmd: false, alt: true, editing: false });
key('!', { shiftKey: true, code: 'Digit1' });
check('and shift+1 is the digit', keys.at(-1)?.key, '1');
check('preventDefault reaches the DOM event', key('Escape').defaultPrevented, true);
off();
key('a');
check('the unsubscribe stops it', keys.length, 6);
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

{
	const [a, b] = inputs('text', 'text');
	dom.focus_element(a);
	check('focus_element focuses, focused_element reports it', dom.focused_element() === (a as unknown), true);
	dom.focus_next();
	check('focus_next moves to the next tab stop', document.activeElement === b, true);
	dom.focus_next();
	check('and wraps', document.activeElement === a, true);
	dom.focus_previous();
	check('focus_previous wraps back', document.activeElement === b, true);
	a.remove();
	b.remove();
}
{
	const [a, hidden, b] = inputs('text', 'hidden', 'text');
	dom.focus_element(a);
	dom.focus_next();
	check('a hidden input is no tab stop', document.activeElement === b, true);
	a.remove();
	hidden.remove();
	b.remove();
}
{
	const [a, shy, b] = inputs('text', 'text', 'text');
	// A stop inside a display: none or inert subtree behaves like this in a browser; happy-dom has no layout to make one.
	shy.focus = () => {};
	dom.focus_element(a);
	dom.focus_next();
	check('a stop that refuses focus is walked past', document.activeElement === b, true);
	a.remove();
	shy.remove();
	b.remove();
}
{
	const scope = document.createElement('div');
	document.body.append(scope);
	const [outside] = inputs('text');
	const p = document.createElement('input');
	const q = document.createElement('input');
	scope.append(p, q);
	dom.focus_element(p);
	dom.focus_next_within(scope);
	const first = document.activeElement === q;
	dom.focus_next_within(scope);
	check('focus_next_within wraps inside its scope', [first, document.activeElement === p], [true, true]);
	dom.blur();
	check('blur leaves nothing focused', dom.focused_element(), null);
	scope.remove();
	outside.remove();
}

{
	const img = document.createElement('img');
	const created: string[] = [];
	const create = URL.createObjectURL;
	URL.createObjectURL = (blob: Blob | MediaSource) => {
		created.push((blob as Blob).type);
		return create.call(URL, blob);
	};
	dom.set_image(img, new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
	const src = img.src;
	dom.set_image(img, new Uint8Array([137, 80, 78, 71]));
	URL.createObjectURL = create;
	check('set_image shows the bytes through an object URL', src.startsWith('blob:'), true);
	check('SVG bytes get the type browsers will not sniff', created[0], 'image/svg+xml');
	check('raster bytes are left to the browser to sniff', created[1], '');
}

dom.set_window_title('titled');
check('set_window_title sets document.title', document.title, 'titled');
{
	const target = document.createElement('div');
	const seen: Array<boolean | ScrollIntoViewOptions | undefined> = [];
	target.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => void seen.push(options);
	dom.scroll_into_view(target);
	check('scroll_into_view asks for the nearest edge', seen, [{ block: 'nearest', inline: 'nearest' }]);
}
check('elements_at answers a list', Array.isArray(dom.elements_at(1, 1)), true);
check('the picker resolves to null', await dom.prompt_for_paths(), null);
check('read_native and get_native answer null', [dom.read_native(() => 1), dom.get_native()], [null, null]);
check('the overlay reads as undefined', [dom.set_debug_overlay('full'), dom.debug_overlay_stats()].map(String), ['undefined', 'undefined']);
check('window_size reads the viewport', [dom.window_size.width, dom.window_size.height], [1024, 768]);
check(
	'window_insets are zero, with the keyboard fields following the height',
	[dom.window_insets.safeArea.top, dom.window_insets.keyboardVisible, dom.window_insets.keyboardTop, dom.window_insets.visibleHeight],
	[0, false, 768, 768]
);
{
	const search = new dom.TextSearch();
	search.query = 'row';
	check(
		'TextSearch is the shared code: find_ranges matches, nothing is counted without a native highlight',
		[dom.find_ranges('Row 1 row', 'row'), search.total, search.spec?.query],
		[
			[
				[0, 3],
				[6, 9]
			],
			0,
			'row'
		]
	);
}

// --- the cross-target example -----------------------------------------------
// Counted around both renders: the second render() has to take the first instance's window key handler with it.
let keydown_listeners = 0;
const add_listener = window.addEventListener.bind(window) as (...args: unknown[]) => void;
const remove_listener = window.removeEventListener.bind(window) as (...args: unknown[]) => void;
window.addEventListener = ((type: string, ...rest: unknown[]) => {
	if (type === 'keydown') keydown_listeners++;
	return add_listener(type, ...rest);
}) as typeof window.addEventListener;
window.removeEventListener = ((type: string, ...rest: unknown[]) => {
	if (type === 'keydown') keydown_listeners--;
	return remove_listener(type, ...rest);
}) as typeof window.removeEventListener;

dom.render(CrossTarget, { title: 'Cross-target test' });
const live_keydown = keydown_listeners;
check('render() mounts into <body> and titles the page', [document.title, by_id('app') !== null], ['Cross-target test', true]);
check("<body> gets GPUI's root box", [document.body.style.display, document.body.style.position, document.body.style.margin], ['flex', 'relative', '0px']);
check('the badge says DOM', text('target'), 'DOM');
check('window_size renders', text('size'), '1024 × 768');
(window as unknown as { happyDOM: { setViewport(viewport: { width: number; height: number }): void } }).happyDOM.setViewport({ width: 800, height: 600 });
window.dispatchEvent(new Event('resize'));
flushSync();
check('and follows a resize', text('size'), '800 × 600');

check('the palette landed through set_css_vars', css_var('bg'), '#000000');
click(by_id('theme'));
check('the theme button flips it', css_var('bg'), '#fafafa');
key('t');
check('and so does the T shortcut', css_var('bg'), '#000000');

const rows = () => by_id('list')!.querySelectorAll('[class~="row"]').length;
check('the Scroller holds every row', rows(), 60);
click(by_id('list')!.querySelector<HTMLElement>('[class~="row"]'));
check('a click removes a row', rows(), 59);

mouse(by_id('theme'), 'mouseenter');
check('the tooltip waits for its delay', tooltip(), null);
await sleep(350);
flushSync();
check(
	'then shows, hung off <body>, taking no pointer',
	[tooltip()?.textContent, tooltip()?.parentElement?.parentElement === document.body, tooltip()?.parentElement?.style.pointerEvents],
	['Toggle the theme (T)', true, 'none']
);
mouse(by_id('theme'), 'mouseleave');
await sleep(120);
flushSync();
check('and hides once the pointer leaves', tooltip(), null);
by_id('theme')!.dispatchEvent(new FocusEvent('focus'));
flushSync();
check('keyboard focus shows it at once', tooltip()?.textContent, 'Toggle the theme (T)');
key('Escape');
check('and Escape hides it', tooltip(), null);

box_of(by_id('menu')!, 100, 50, 80, 30);
click(by_id('menu-trigger'));
const panel_layer = () => by_id('menu-panel')?.parentElement ?? null;
check('the Popover opens its panel off <body>', [by_id('item-rename') !== null, panel_layer()?.parentElement === document.body], [true, true]);
check("placed below the trigger's box, gap included", [panel_layer()?.style.left, panel_layer()?.style.top], ['100px', '84px']);
box_of(by_id('menu')!, 300, 50, 80, 30);
await sleep(60);
check('and follows the trigger when it moves, frame by frame', panel_layer()?.style.left, '300px');
click(by_id('item-rename'));
check('an item click reports and closes', [text('picked')?.startsWith('Picked: Rename'), by_id('menu-panel')], [true, null]);
click(by_id('menu-trigger'));
mouse(by_id('menu-panel'), 'mousedown');
check('a press inside the panel keeps it open', by_id('menu-panel') !== null, true);
mouse(document.body, 'mousedown');
check('a press outside closes it', by_id('menu-panel'), null);
click(by_id('menu-trigger'));
click(by_id('menu-trigger'));
check('a click on the trigger while open closes it without reopening', by_id('menu-panel'), null);
click(by_id('menu-trigger'));
key('Escape');
check('so does Escape', by_id('menu-panel'), null);
box_of(by_id('menu')!, 900, 50, 80, 30);
click(by_id('menu-trigger'));
check('a layer past the right edge snaps inside the viewport', panel_layer()?.style.left, '792px');
key('Escape');

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

// The dialog shares its {#if} block with a sibling, and a tooltip layer sits after the dialog's in <body>: Svelte's
// teardown walks from the block's first node to its last, which must be the slot that stayed put, not the moved layer.
click(by_id('open'));
mouse(by_id('theme'), 'mouseenter');
await sleep(350);
flushSync();
const shown_before = tooltip() !== null && by_id('dialog-open') !== null;
click(by_id('close'));
check('tearing down a portal beside a sibling spares the layers after it', [shown_before, tooltip() !== null, by_id('dialog-open'), by_id('dialog')], [true, true, null, null]);
mouse(by_id('theme'), 'mouseleave');
await sleep(120);
flushSync();

// A keyed {#each} reorder moves the node Svelte holds on to. Behind a slot that is the slot, and every portal stays
// in <body>; without the slot, the reorder pulled the first layer back into the list.
writeFileSync(
	join(tmp, 'Toasts.svelte'),
	`<script>
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	let ids = $state(['a', 'b', 'c']);
	export function reverse() {
		ids = ids.toReversed();
	}
</script>
{#each ids as id (id)}<Portal><div class="toast" testid="toast-{id}">{id}</div></Portal>{/each}
`
);
const Toasts = (await import(compile_for_dom(join(tmp, 'Toasts.svelte')))).default;
const toasts_host = document.createElement('div');
document.body.append(toasts_host);
const toasts = mount(Toasts, { target: toasts_host }) as { reverse(): void };
flushSync();
toasts.reverse();
flushSync();
const toasts_in_body = [...document.querySelectorAll<HTMLElement>('[testid^="toast-"]')].map((t) => t.closest('[class~="portal"]')?.parentElement === document.body);
check('reversing a keyed {#each} of portals leaves every layer in <body>', toasts_in_body, [true, true, true]);
unmount(toasts as never);
toasts_host.remove();

dom.render(CrossTarget, { title: 'again', rootStyle: { padding: 4 } });
check(
	'a second render() replaces the first, rootStyle replacing the root box',
	[document.querySelectorAll('[testid="app"]').length, document.title, document.body.style.display, document.body.style.padding],
	[1, 'again', '', '4px']
);
key('t');
check("the first instance's window key handler went with it", [keydown_listeners, css_var('bg')], [live_keydown, '#fafafa']);

rmSync(tmp, { recursive: true, force: true });
finish('dom', 69);
