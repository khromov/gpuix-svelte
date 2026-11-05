/**
 * The DOM twin of `web.ts`: what `gpuix-svelte` resolves to when the `custom-renderer`
 * condition is absent, i.e. under Vite, SvelteKit or any other browser toolchain. Same
 * names, same signatures; each does the DOM's equivalent where one is cheap and nothing
 * where only GPUI has the feature, so a component renders on both targets as written.
 */

import { mount, unmount, flushSync } from 'svelte';
import { createSubscriber } from 'svelte/reactivity';
import type { EventPayload, PathPromptOptions } from '@gpuix/native';
import type { DebugFrameOverlayMode, DebugFrameOverlayStats, EdgeInsets, WindowInsets, WindowSize } from '@gpuix/native/host';
import type { AnyComponent, GpuixEvent, GpuiStyle, Native, PixelFormat, RenderOptions, ShadowNode, WindowKeyType } from './types.ts';

export { parse_css_text, build_style } from './style.ts';
export { to_gpui_event, GPUI_EVENTS } from './events.ts';
export { TextSearch, find_ranges, type TextSearchOptions } from './search.ts';

/** False here; the GPUI entries answer true. Decided per build, so it can be read before anything is mounted. */
export const is_gpuix = (): boolean => false;

/** What an `{@attach}` hands over here: a DOM element. A GPUI shadow node is accepted and ignored. */
type NodeRef = Element | { nativeId?: number | null } | null | undefined;

// SvelteKit renders on the server first, where there is no document, so every helper is a no-op there.
const doc = (): Document | null => globalThis.document ?? null;
const win = (): Window | null => globalThis.window ?? null;
const element = (node: NodeRef): HTMLElement | null => (typeof Element !== 'undefined' && node instanceof Element ? (node as HTMLElement) : null);

const noop = () => {};

const EDITING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const is_editing = (): boolean => {
	const active = doc()?.activeElement as HTMLElement | null | undefined;
	return !!active && (EDITING_TAGS.has(active.tagName) || active.isContentEditable);
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

/** GPUI spells keys the way `press()` does: lowercase, `space`, and `up` rather than `ArrowUp`. */
function key_name(key: string): string {
	const lower = key.toLowerCase();
	return KEY_NAMES[lower] ?? (lower.startsWith('arrow') ? lower.slice(5) : lower);
}

const WINDOW_KEYS: Record<string, 'keydown' | 'keyup'> = { keydown: 'keydown', keyup: 'keyup' };

/** Listens on `window`, which hears a key after the focused element did, as GPUI's window handlers do. Returns the unsubscribe. */
export function on_window_key(type: WindowKeyType, handler: (event: GpuixEvent) => void): () => void {
	const name = WINDOW_KEYS[type.toLowerCase()];
	if (!name) throw new Error(`[gpuix-svelte] on_window_key: unknown type "${type}" (keydown or keyup)`);
	const target = win();
	if (!target) return noop;
	const listener = (e: KeyboardEvent) =>
		handler(
			shaped(name === 'keydown' ? 'windowKeyDown' : 'windowKeyUp', e, {
				key: key_name(e.key),
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

/** `var(--name)` resolves against `:root` here, which is where the DOM keeps a palette. */
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

let mounted: Record<string, unknown> | null = null;
let kept: Array<() => void> = [];

/** Mounts the component into `document.body`, the DOM's window; a second call replaces the first, as a remount does. */
export function render(Component: AnyComponent, options: RenderOptions = {}): Record<string, unknown> {
	const { props = {}, rootStyle, onKeyDown, onKeyUp, onSelectionChange, title, app } = options;
	const document = doc();
	if (!document) throw new Error('[gpuix-svelte] render() needs a document; on a server, render nothing');

	if (mounted) unmount(mounted);
	for (const off of kept) off();
	kept = [];
	if (onKeyDown) kept.push(on_window_key('keydown', onKeyDown));
	if (onKeyUp) kept.push(on_window_key('keyup', onKeyUp));
	if (onSelectionChange) kept.push(on_selection_change(onSelectionChange));

	const name = title ?? app?.name;
	if (name != null) document.title = name;
	if (rootStyle) apply_style(document.body, rootStyle);

	mounted = mount(Component, { target: document.body, props }) as Record<string, unknown>;
	flushSync();
	return mounted;
}

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
	return Array.from(scope.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.hidden);
}

function step(scope: ParentNode | null, delta: 1 | -1) {
	const stops = scope ? tab_stops(scope) : [];
	if (stops.length === 0) return;
	const at = stops.indexOf(doc()?.activeElement as HTMLElement);
	const next = at === -1 ? (delta === 1 ? 0 : stops.length - 1) : (at + delta + stops.length) % stops.length;
	stops[next].focus();
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

function show(target: HTMLElement, blob: Blob) {
	const url = URL.createObjectURL(blob);
	const previous = object_urls.get(target);
	if (previous) URL.revokeObjectURL(previous);
	object_urls.set(target, url);
	if (target instanceof HTMLImageElement) target.src = url;
	else target.style.backgroundImage = `url(${url})`;
}

/** Encoded image bytes onto an `<img>` through an object URL, which the next upload revokes. */
export function set_image(node: NodeRef, bytes: Uint8Array) {
	const target = element(node);
	if (target) show(target, new Blob([bytes as Uint8Array<ArrayBuffer>]));
}

/** Packed straight-alpha pixels, drawn to a canvas and shown like `set_image`. */
export function set_image_pixels(node: NodeRef, width: number, height: number, pixels: Uint8Array, format: PixelFormat = 'rgba') {
	const target = element(node);
	const document = doc();
	if (!target || !document) return;
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
	canvas.toBlob((blob) => blob && show(target, blob));
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
	PixelFormat,
	AnyComponent
} from './types.ts';
export type { GpuixTheme, HighlightSpec, MotionProps, DebugFrameOverlayMode, DebugFrameOverlayStats, WindowSize, WindowInsets, EdgeInsets } from '@gpuix/native/host';
