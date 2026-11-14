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
	const words = document.createElement('p');
	words.textContent = 'Pick these words';
	document.body.append(words);
	const range = document.createRange();
	range.selectNodeContents(words);
	document.getSelection()!.addRange(range);
	const picked = dom.selected_text();
	dom.clear_selection();
	check('selected_text reads the document selection, and clear_selection empties it to null', [picked, dom.selected_text()], ['Pick these words', null]);
	words.remove();
}
check('a page is never a terminal', dom.is_terminal(), false);

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
// The last one is what tells matchMedia from the window's parser, which answers false for a feature it cannot read.
check(
	'media_query is matchMedia',
	[dom.media_query('(min-width: 900px)').current, dom.media_query('(prefers-color-scheme: dark)').current, dom.media_query('(prefers-color-scheme: light)').current],
	[true, false, true]
);
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
check("<body> gets GPUI's line height", document.body.style.lineHeight, '1.618');
check('the badge says DOM', text('target'), 'DOM');
check('window_size renders', text('size'), '1024 × 768');
const viewport = (width: number, height: number) => {
	(window as unknown as { happyDOM: { setViewport(viewport: { width: number; height: number }): void } }).happyDOM.setViewport({ width, height });
	window.dispatchEvent(new Event('resize'));
	flushSync();
};
viewport(800, 600);
check('and follows a resize', text('size'), '800 × 600');
check('media_query renders what the viewport says', text('layout'), 'wide');
viewport(500, 600);
check('and follows a resize too', text('layout'), 'narrow');
viewport(800, 600);

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
by_id('theme')!.dispatchEvent(new FocusEvent('blur'));
mouse(by_id('theme'), 'mouseenter');
await sleep(350);
flushSync();
const hovered = tooltip() !== null;
key('Escape');
check('Escape hides a tip that hover showed too', [hovered, tooltip()], [true, null]);
by_id('theme')!.dispatchEvent(new FocusEvent('blur'));
await sleep(350);
flushSync();
check('and focus leaving while the pointer stays does not bring it back', tooltip(), null);
mouse(by_id('theme'), 'mouseleave');
await sleep(120);
flushSync();

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
key('Escape', { repeat: true });
check('a repeat of a held Escape leaves it open', by_id('menu-panel') !== null, true);
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

writeFileSync(
	join(tmp, 'Nested.svelte'),
	`<script>
	import Popover from 'gpuix-svelte/components/Popover.svelte';
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
	let open = $state(false);
</script>
<Popover {open} onclose={() => (open = false)} testid="nest">
	<div onclick={() => (open = !open)} testid="nest-trigger">Nest</div>
	{#snippet content()}
		<Tooltip content="Inner" testid="nest-inner">
			{#snippet children(hover, focus)}<div tabindex="0" {...hover} {...focus} testid="nest-inner-trigger">Inner</div>{/snippet}
		</Tooltip>
		<div tabindex="0" onkeydown={(e) => e.key === 'Escape' && e.preventDefault()} testid="nest-keep">Keep</div>
	{/snippet}
</Popover>
`
);
const Nested = (await import(compile_for_dom(join(tmp, 'Nested.svelte')))).default;
const nested_host = document.createElement('div');
document.body.append(nested_host);
const nested = mount(Nested, { target: nested_host });
flushSync();
click(by_id('nest-trigger'));
by_id('nest-inner-trigger')!.dispatchEvent(new FocusEvent('focus'));
flushSync();
const opened = [by_id('nest-panel') !== null, by_id('nest-inner-tip') !== null];
key('Escape');
check('Escape closes only the top layer, the tip inside the popover', [opened, by_id('nest-inner-tip'), by_id('nest-panel') !== null], [[true, true], null, true]);
key('Escape');
check('and the next one the popover under it', by_id('nest-panel'), null);
click(by_id('nest-trigger'));
by_id('nest-keep')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
flushSync();
const kept = by_id('nest-panel') !== null;
key('Escape');
check("a key handler's preventDefault keeps it open, where the same key unprevented closes it", [kept, by_id('nest-panel')], [true, null]);
unmount(nested as never);
nested_host.remove();

dom.render(CrossTarget, { title: 'again', rootStyle: { padding: 4 } });
check(
	'a second render() replaces the first, rootStyle replacing the root box',
	[document.querySelectorAll('[testid="app"]').length, document.title, document.body.style.display, document.body.style.padding],
	[1, 'again', '', '4px']
);
check('the line height stays under a rootStyle that sets none', document.body.style.lineHeight, '1.618');
key('t');
check("the first instance's window key handler went with it", [keydown_listeners, css_var('bg')], [live_keydown, '#fafafa']);
const resets = [...document.head.querySelectorAll('style[data-gpuix-svelte]')];
check(
	"render() takes the browser's button look off once, under any rule of the app's",
	[resets.length, document.head.firstElementChild === resets[0], resets[0]?.textContent?.startsWith(':where(button){')],
	[1, true, true]
);

// --- :root rules under set_css_vars: test:root-vars expects the same three answers of GPUI ---
compile_for_dom(join(root, 'test/RootVarsChild.svelte'));
const RootVars = (await import(compile_for_dom(join(root, 'test/RootVars.svelte')))).default;
const vars_host = document.createElement('div');
document.body.append(vars_host);
const with_vars = mount(RootVars, { target: vars_host });
flushSync();
const painted = (id: string, property: 'backgroundColor' | 'color') => getComputedStyle(vars_host.querySelector<HTMLElement>(`[testid="${id}"]`)!)[property];
const cascade = () => [painted('card', 'backgroundColor'), painted('derived', 'backgroundColor'), painted('locked', 'color')];
check("a component's :root rule is global, and a class rule reads its variables", cascade(), ['#101010', '#abcabc', '#0000aa']);
dom.set_css_vars({ surface: '#222222', js: '#111111', locked: '#00aa00' });
check('set_css_vars outranks the rule from the inline style of <html>, bar a declaration marked !important', cascade(), ['#222222', '#111111', '#0000aa']);
dom.set_css_vars({ surface: null, js: '', locked: null });
check('and null or an empty string gives the rule its say back', cascade(), ['#101010', '#abcabc', '#0000aa']);
unmount(with_vars as never);
vars_host.remove();

// --- style props and variables on elements: test:style-props and test:scoped-vars expect the same of GPUI ---
for (const name of ['ScopedCard', 'StylePropsBeside', 'StylePropsPass', 'StylePropsText']) compile_for_dom(join(root, 'test', `${name}.svelte`));
const shade = (id: string, property: 'backgroundColor' | 'color' = 'backgroundColor') => getComputedStyle(by_id(id)!)[property];

const StyleProps = (await import(compile_for_dom(join(root, 'test/StyleProps.svelte')))).default;
const props_host = document.createElement('div');
document.body.append(props_host);
const with_props = mount(StyleProps, { target: props_host }) as { recolor(value: string | null): void };
flushSync();
const wrapper = by_id('s')?.parentElement;
check('a style prop reaches the component and no other', [shade('s'), shade('s-tail'), shade('p')], ['#cc0000', '#cc0000', '#000001']);
check("through Svelte's own wrapper, which a browser gives no box", [wrapper?.localName, wrapper?.style.display], ['svelte-css-wrapper', 'contents']);
check('each row of an {#each} has its own, a wrapper inside a wrapper hands it on', [shade('g'), shade('b-tail'), shade('deep-r')], ['#00ff00', '#0000ff', '#ff0000']);
check('it outranks a declaration around the component, reaches markup rendered inside it, and may read a variable from around it', [shade('inherits'), shade('overrides'), shade('slot', 'color'), shade('reads-around')], ['#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd']);
with_props.recolor('#654321');
flushSync();
const recolored = shade('shown');
with_props.recolor(null);
flushSync();
check('a new value restyles the component, and null takes the variable away', [recolored, shade('shown')], ['#654321', '#000001']);
check('a portal hangs its content off <body>, outside the wrapper, where the style prop does not reach as it does on GPUI', [by_id('ported')?.closest('svelte-css-wrapper') ?? null, shade('ported', 'color')], [null, '#000002']);
const group = by_id('beside')?.parentElement;
check('beside nothing but a <text> the wrapper is an SVG <g>, which a browser paints no HTML in: what docs/dom.md keeps a <div> around', [group?.localName, group?.namespaceURI], ['g', 'http://www.w3.org/2000/svg']);
unmount(with_props as never);
props_host.remove();

const ScopedVars = (await import(compile_for_dom(join(root, 'test/ScopedVars.svelte')))).default;
const scoped_host = document.createElement('div');
document.body.append(scoped_host);
const with_scoped = mount(ScopedVars, { target: scoped_host }) as { set_alt(on: boolean): void };
flushSync();
check('a variable declared by a class rule or an inline style is that element\'s and what is inside it', [shade('outside'), shade('by-class'), shade('reader', 'color'), shade('by-inline')], ['#00aa00', '#aa0000', '#aa0000', '#0000bb']);
check('an element reads its own, the inline style over the rule, and outranks a :root declaration marked !important', [shade('self', 'color'), shade('pinned', 'color')], ['#5e1f00', '#aa5500']);
dom.set_css_vars({ tint: '#123123', pinned: '#00ff00' });
check('set_css_vars reaches a reader outside and loses to an element\'s own declaration', [shade('outside'), shade('by-class'), shade('pinned', 'color')], ['#123123', '#aa0000', '#aa5500']);
dom.set_css_vars({ tint: null, pinned: null });
with_scoped.set_alt(true);
flushSync();
check('a class change on the declaring element reaches the readers below it, bar one under a nearer declaration', [shade('by-class'), shade('by-inline')], ['#aa00aa', '#0000bb']);
unmount(with_scoped as never);
scoped_host.remove();

rmSync(tmp, { recursive: true, force: true });
finish('dom', 97);
