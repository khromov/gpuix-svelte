/**
 * The DOM side of the package, mirroring `web.ts`: what `gpuix-svelte` resolves to when the `custom-renderer`
 * condition is absent, i.e. under Vite, SvelteKit or any other browser toolchain. Same
 * names, same signatures; each does the DOM's equivalent where one is cheap and nothing
 * where only GPUI has the feature, so a component renders on both targets as written.
 */

import { mount, unmount, flushSync } from 'svelte';
import { createSubscriber } from 'svelte/reactivity';
import type { EventPayload, PathPromptOptions } from '@gpuix/native';
import type { DebugFrameOverlayMode, DebugFrameOverlayStats, EdgeInsets, WindowInsets, WindowSize } from '@gpuix/native/host';
import type { AnyComponent, DismissLayer, GpuixEvent, GpuiStyle, Native, PixelFormat, RenderOptions, ShadowNode, WindowKeyType } from './types.ts';
import { RESET_CSS } from './reset.ts';

export { parse_css_text, build_style } from './style.ts';
export { to_gpui_event, GPUI_EVENTS } from './events.ts';
export { TextSearch, find_ranges, type TextSearchOptions, type SearchMatches } from './search.ts';

/** False here; the GPUI entries answer true. Decided per build, so it can be read before anything is mounted. */
export const IS_GPUIX: boolean = false;

/** What an `{@attach}` hands over here: a DOM element. A GPUI shadow node is accepted and ignored. */
type NodeRef = Element | { nativeId?: number | null } | null | undefined;

// SvelteKit renders on the server first, where there is no document, so every helper is a no-op there.
const doc = (): Document | null => globalThis.document ?? null;
const win = (): Window | null => globalThis.window ?? null;
const element = (node: NodeRef): HTMLElement | null => (typeof Element !== 'undefined' && node instanceof Element ? (node as HTMLElement) : null);

const noop = () => {};

const BIN_HINT = 'a desktop app runs its entry through the gpuix-svelte bin, which selects the GPUI renderer';

// GPUI's `editing` means a text field; an `<input>` of these types takes keys without taking typing.
const NOT_TEXT = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

const is_editing = (): boolean => {
	const active = doc()?.activeElement as HTMLElement | null | undefined;
	if (!active) return false;
	if (active instanceof HTMLInputElement) return !NOT_TEXT.has(active.type);
	return active.tagName === 'TEXTAREA' || active.isContentEditable;
};

/** A GPUI-shaped event over a DOM one, so a handler reading `e.key`, `e.modifiers.cmd` or `e.editing` reads the same here. */
function shaped(type: string, source: Event, fields: Partial<EventPayload>): GpuixEvent {
	const event = {
		elementId: -1,
		eventType: type,
		type,
		target: source.target as unknown as ShadowNode,
		currentTarget: source.currentTarget as unknown as ShadowNode,
		editing: is_editing(),
		cancelBubble: false,
		get defaultPrevented() {
			return source.defaultPrevented;
		},
		preventDefault: () => source.preventDefault(),
		stopPropagation: () => {
			event.cancelBubble = true;
			source.stopPropagation();
		},
		stopImmediatePropagation: () => source.stopImmediatePropagation(),
		composedPath: () => [] as never[],
		...fields
	};
	return event as GpuixEvent;
}

const KEY_NAMES: Record<string, string> = { ' ': 'space', spacebar: 'space', esc: 'escape', del: 'delete' };

/**
 * GPUI spells keys the way `press()` does: lowercase, `space`, `up` rather than `ArrowUp`, and under Alt or Shift the
 * unshifted key (⌥T is `t` with `alt`, not `†`), which only the physical key tells once the layout has produced a symbol.
 */
function key_name(e: KeyboardEvent): string {
	const physical = /^(?:Key|Digit)(\w)$/.exec(e.code);
	if (physical && (e.altKey || e.shiftKey) && !/^[a-zA-Z0-9]$/.test(e.key)) return physical[1].toLowerCase();
	const lower = e.key.toLowerCase();
	return KEY_NAMES[lower] ?? (lower.startsWith('arrow') ? lower.slice(5) : lower);
}

const WINDOW_KEYS: Record<string, 'keydown' | 'keyup'> = { keydown: 'keydown', keyup: 'keyup' };

/** Listens on `window`, which hears a key after the focused element did, as GPUI's window handlers do. Returns the unsubscribe. */
export function on_window_key(type: WindowKeyType, handler: (event: GpuixEvent) => void): () => void {
	const name = Object.hasOwn(WINDOW_KEYS, type.toLowerCase()) ? WINDOW_KEYS[type.toLowerCase()] : undefined;
	if (!name) throw new Error(`[gpuix-svelte] on_window_key: unknown type "${type}" (keydown or keyup)`);
	const target = win();
	if (!target) return noop;
	const listener = (e: KeyboardEvent) =>
		handler(
			shaped(name === 'keydown' ? 'windowKeyDown' : 'windowKeyUp', e, {
				key: key_name(e),
				keyChar: e.key.length === 1 ? e.key : undefined,
				isHeld: e.repeat,
				modifiers: { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, cmd: e.metaKey }
			})
		);
	target.addEventListener(name, listener);
	return () => target.removeEventListener(name, listener);
}

/** The document's `selectionchange`; `e.value` is the selected text, `undefined` when it is empty. */
export function on_selection_change(handler: (event: GpuixEvent) => void): () => void {
	const document = doc();
	if (!document) return noop;
	const listener = (e: Event) => handler(shaped('selectionChange', e, { value: document.getSelection()?.toString() || undefined }));
	document.addEventListener('selectionchange', listener);
	return () => document.removeEventListener('selectionchange', listener);
}

/** Open overlays, the top one last. */
const layers: DismissLayer[] = [];

function escape(e: KeyboardEvent) {
	if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || key_name(e) !== 'escape') return;
	layers.at(-1)?.onEscape();
}

/**
 * Puts an open overlay on top of the page's stack until the returned function runs; an Escape that no key handler
 * prevented reaches the top layer's `onEscape` alone. The window listener is added as the first layer opens, so a
 * window handler subscribed after that hears the key too late to prevent it.
 */
export function dismiss_layer(layer: DismissLayer): () => void {
	const target = win();
	if (!target) return noop;
	const entry = { ...layer };
	if (layers.push(entry) === 1) target.addEventListener('keydown', escape);
	return () => {
		const index = layers.indexOf(entry);
		if (index === -1) return;
		layers.splice(index, 1);
		if (layers.length === 0) target.removeEventListener('keydown', escape);
	};
}

/** `var(--name)` resolves against `:root` here, which is where the DOM keeps a palette. A bare number stays bare, so give lengths a unit. */
export function set_css_vars(vars: Record<string, string | number | null>) {
	const root = doc()?.documentElement;
	if (!root) return;
	for (const [key, value] of Object.entries(vars)) {
		const name = key.startsWith('--') ? key : `--${key}`;
		if (value == null) root.style.removeProperty(name);
		else root.style.setProperty(name, String(value));
	}
}

export const set_keyboard_focus_dim: (enabled: boolean) => void = noop;

const UNITLESS = new Set(['opacity', 'flexGrow', 'flexShrink', 'flex', 'fontWeight', 'zIndex', 'order']);

/** `rootStyle` is GPUI-shaped (camelCase, bare pixel numbers); the nested pseudo styles have no inline equivalent. */
function apply_style(target: HTMLElement, style: GpuiStyle) {
	for (const [key, value] of Object.entries(style)) {
		if (value == null || typeof value === 'object' || typeof value === 'boolean') continue;
		(target.style as unknown as Record<string, string>)[key] = typeof value === 'number' && !UNITLESS.has(key) ? `${value}px` : String(value);
	}
}

/** GPUI's default root (`create_root`). */
const ROOT_BOX: GpuiStyle = { display: 'flex', position: 'relative', width: '100%', height: '100%' };
/** What a `<body>` needs on top to be the window, whatever the root box: no margin, the viewport for its height, and GPUI's default line height (the golden ratio), where a browser's `normal` follows the font. */
const PAGE: GpuiStyle = { margin: 0, height: '100vh', lineHeight: '1.618' };

let mounted: Record<string, unknown> | null = null;
let kept: Array<() => void> = [];
let root_keys: string[] = [];

/** Mounts the component into `document.body`, the DOM's window, styled like GPUI's root; a second call replaces the first, as a remount does. */
export function render(Component: AnyComponent, options: RenderOptions = {}): Record<string, unknown> {
	const { props = {}, rootStyle, onKeyDown, onKeyUp, onSelectionChange, title, app } = options;
	const document = doc();
	if (!document) throw new Error(`[gpuix-svelte] render() needs a document: in a browser, call it once the page has loaded; ${BIN_HINT}`);

	if (mounted) unmount(mounted);
	mounted = null;
	for (const off of kept) off();
	kept = [];
	if (onKeyDown) kept.push(on_window_key('keydown', onKeyDown));
	if (onKeyUp) kept.push(on_window_key('keyup', onKeyUp));
	if (onSelectionChange) kept.push(on_selection_change(onSelectionChange));

	const name = title ?? app?.name;
	if (name != null) document.title = name;

	// As on GPUI, `rootStyle` replaces the default box rather than adding to it, and so does the next render()'s;
	// the page's own needs sit under either. A box as tall as the window is, here, as tall as the viewport.
	const body = document.body;
	for (const key of root_keys) (body.style as unknown as Record<string, string>)[key] = '';
	const root: GpuiStyle = { ...PAGE, ...(rootStyle ?? ROOT_BOX) };
	if (root.height === '100%') root.height = '100vh';
	apply_style(body, root);
	// Dynamic viewport units leave out a mobile browser's chrome; where they are unknown the assignment is dropped and `vh` stays.
	if (root.height === '100vh') body.style.height = '100dvh';
	root_keys = Object.keys(root);

	if (!document.head.querySelector('style[data-gpuix-svelte]')) {
		const reset = document.createElement('style');
		reset.setAttribute('data-gpuix-svelte', '');
		reset.textContent = RESET_CSS;
		document.head.prepend(reset);
	}

	mounted = mount(Component, { target: body, props }) as Record<string, unknown>;
	flushSync();
	return mounted;
}
/** Hot reload belongs to the GPUI window; an entry that calls this landed in a DOM build, usually by skipping the bin. */
export const render_hot: (entry: string | URL, options?: RenderOptions) => Promise<void> = () =>
	Promise.reject(new Error(`[gpuix-svelte] render_hot() opens a GPUI window and this build resolved gpuix-svelte to its DOM build: ${BIN_HINT}; a browser entry calls render() with an imported component`));

// Window and desktop helpers: the browser's version where it has one.

export function set_window_title(title: string) {
	const document = doc();
	if (document) document.title = title;
}

export const activate_window = () => win()?.focus();
export const minimize_window: () => void = noop;
export const zoom_window: () => void = noop;

export const toggle_fullscreen = () => {
	const document = doc();
	if (!document) return;
	// Both reject outside a user gesture, which is no reason to throw at the caller.
	if (document.fullscreenElement) document.exitFullscreen().catch(noop);
	else document.documentElement.requestFullscreen?.().catch(noop);
};

/** A page cannot learn a chosen file's path, so this resolves to null, as it does headlessly. */
export const prompt_for_paths: (options?: PathPromptOptions) => Promise<string[] | null> = async () => null;

export const read_native: <T>(read: (native: Native) => T) => T | null = () => null;
export const get_native = (): Native | null => null;

export const blur = () => (doc()?.activeElement as HTMLElement | null)?.blur?.();

export function focus_element(node: NodeRef) {
	element(node)?.focus();
}

/** `document.activeElement`, or null while nothing but the body has focus; typed as the GPUI node for a shared signature. */
export const focused_element = (): ShadowNode | null => {
	const document = doc();
	const active = document?.activeElement;
	return !active || active === document?.body ? null : (active as unknown as ShadowNode);
};

const TABBABLE = 'a[href], button, input, textarea, select, summary, [tabindex], [contenteditable]';

function tab_stops(scope: ParentNode): HTMLElement[] {
	return Array.from(scope.querySelectorAll<HTMLElement>(TABBABLE)).filter(
		(el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.hidden && !(el instanceof HTMLInputElement && el.type === 'hidden')
	);
}

function step(scope: ParentNode | null, delta: 1 | -1) {
	const stops = scope ? tab_stops(scope) : [];
	const document = doc();
	if (stops.length === 0 || !document) return;
	let at = stops.indexOf(document.activeElement as HTMLElement);
	// A stop that is display: none, inert or inside a closed <details> refuses focus silently, so walk on until one takes it.
	for (let tried = 0; tried < stops.length; tried++) {
		at = at === -1 ? (delta === 1 ? 0 : stops.length - 1) : (at + delta + stops.length) % stops.length;
		stops[at].focus();
		if (document.activeElement === stops[at]) return;
	}
}

/** Moves focus to the next tab stop in the document, wrapping at the end. */
export const focus_next = () => step(doc(), 1);
export const focus_previous = () => step(doc(), -1);

export function focus_next_within(node: NodeRef) {
	step(element(node), 1);
}

export function focus_previous_within(node: NodeRef) {
	step(element(node), -1);
}

export function scroll_into_view(node: NodeRef) {
	element(node)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

const object_urls = new WeakMap<Element, string>();
const uploads = new WeakMap<Element, number>();

/** The newest upload per element wins, as on GPUI; a canvas encode that finishes after a later call is dropped. */
function claim(target: Element): number {
	const token = (uploads.get(target) ?? 0) + 1;
	uploads.set(target, token);
	return token;
}

function show(target: HTMLElement, blob: Blob) {
	const url = URL.createObjectURL(blob);
	const previous = object_urls.get(target);
	if (previous) URL.revokeObjectURL(previous);
	object_urls.set(target, url);
	if (target instanceof HTMLImageElement) target.src = url;
	else target.style.backgroundImage = `url(${url})`;
}

/** Browsers sniff raster formats from the bytes but never SVG, which has to carry its type. */
function blob_of(bytes: Uint8Array): Blob {
	const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
	const svg = head.startsWith('<') && /<svg[\s>]/i.test(head);
	return new Blob([bytes as Uint8Array<ArrayBuffer>], svg ? { type: 'image/svg+xml' } : undefined);
}

/** Encoded image bytes onto an `<img>` through an object URL, which the next upload revokes. */
export function set_image(node: NodeRef, bytes: Uint8Array) {
	const target = element(node);
	if (!target) return;
	claim(target);
	show(target, blob_of(bytes));
}

/** Packed straight-alpha pixels, drawn to a canvas and shown like `set_image`. */
export function set_image_pixels(node: NodeRef, width: number, height: number, pixels: Uint8Array, format: PixelFormat = 'rgba') {
	const target = element(node);
	const document = doc();
	if (!target || !document || width <= 0 || height <= 0) return;
	const token = claim(target);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) return;
	const rgba = new Uint8ClampedArray(width * height * 4);
	rgba.set(pixels.subarray(0, rgba.length));
	if (format === 'bgra') {
		for (let i = 0; i < rgba.length; i += 4) [rgba[i], rgba[i + 2]] = [rgba[i + 2], rgba[i]];
	}
	context.putImageData(new ImageData(rgba, width, height), 0, 0);
	canvas.toBlob((blob) => {
		if (blob && uploads.get(target) === token) show(target, blob);
	});
}

/** A font file carries its family name, but the DOM wants it spelled out: use `@font-face` instead. */
export const register_font: (bytes: Uint8Array) => void = noop;

/** `document.elementsFromPoint`, typed as GPUI nodes for a shared signature. */
export const elements_at = (x: number, y: number): ShadowNode[] => (doc()?.elementsFromPoint?.(x, y) ?? []) as unknown as ShadowNode[];

// GPUI's draw-time overlay has no counterpart; the browser's own profiler does.
export const set_debug_overlay: (mode: DebugFrameOverlayMode) => DebugFrameOverlayMode | undefined = () => undefined;
export const cycle_debug_overlay = (): DebugFrameOverlayMode | undefined => undefined;
export const debug_overlay = (): DebugFrameOverlayMode | undefined => undefined;
export const debug_overlay_stats = (): DebugFrameOverlayStats | undefined => undefined;
export const reset_debug_overlay_stats: () => void = noop;

// The browser does have a resize event, so no polling here.
const resized = createSubscriber((update) => {
	const target = win();
	if (!target) return;
	target.addEventListener('resize', update);
	return () => target.removeEventListener('resize', update);
});

/** `innerWidth` × `innerHeight`, reactive in a template or effect; 800×600 with no window. */
export const window_size: Readonly<WindowSize> = {
	get width() {
		resized();
		return win()?.innerWidth ?? 800;
	},
	get height() {
		resized();
		return win()?.innerHeight ?? 600;
	}
};

const zero = (): EdgeInsets => ({ top: 0, right: 0, bottom: 0, left: 0 });

/** The page is laid out inside the browser's own insets already, so these read as zero, like a headless window's. */
export const window_insets: Readonly<WindowInsets> = {
	get safeArea() {
		return zero();
	},
	get ime() {
		return zero();
	},
	get effective() {
		return zero();
	},
	get keyboardTop() {
		return window_size.height;
	},
	get keyboardVisible() {
		return false;
	},
	get visibleHeight() {
		return window_size.height;
	}
};

export type {
	ShadowNode,
	ShadowAttrs,
	NodeKind,
	EventHandler,
	GpuixEvent,
	GpuiStyle,
	StyleValue,
	StyleRule,
	ClassRule,
	Mutation,
	NativeSink,
	Native,
	RenderOptions,
	AppOptions,
	WindowKeyType,
	DismissLayer,
	PixelFormat,
	AnyComponent
} from './types.ts';
export type { GpuixTheme, HighlightSpec, MotionProps, DebugFrameOverlayMode, DebugFrameOverlayStats, WindowSize, WindowInsets, EdgeInsets } from '@gpuix/native/host';
