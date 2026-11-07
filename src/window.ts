/**
 * Window-level calls app code makes that the headless renderer cannot answer —
 * `TestGpuixRenderer` has no window to title, activate or blur — so each one is a
 * no-op there, which spares every component a guard.
 */

import type { PathPromptOptions } from '@gpuix/native';
import { get_native, node_of, set_viewport_observer, with_native_id } from './renderer.ts';
import { set_titlebar_title } from './titlebar.ts';
import { MEDIA_FEATURES, media_matches, parse_media_query } from './media.ts';
import type { MediaQueryState, Native, PixelFormat, ShadowNode, WindowNative } from './types.ts';
import { createSubscriber } from 'svelte/reactivity';
import {
	observeWindowInsets,
	observeWindowSize,
	readWindowInsets,
	readWindowSize,
	type DebugFrameOverlayMode,
	type DebugFrameOverlayStats,
	type WindowInsets,
	type WindowInsetsHost,
	type WindowSize,
	type WindowSizeHost
} from '@gpuix/native/host';

/** A shadow node, from `{@attach}` or `use:`. */
type NodeRef = { nativeId?: number | null } | null | undefined;

const win = () => get_native() as WindowNative | null;

// Windows runs the picker inside a GPUI foreground task, so until it closes every call that waits
// on the UI thread stalls JS for 2 s and throws. Counted on Windows only, see `prompt_for_paths`.
let open_dialogs = 0;
let size_under_dialog: WindowSize | null = null;
const held_uploads = new Map<number, [NodeRef, (id: number) => void]>();

/** A call can also be in flight as the last window closes, which is no app error, least of all from a timer. */
function answered<T>(call: () => T): T | null {
	try {
		return call();
	} catch (error) {
		// Native gives these no error code of their own, so the text is all that sets them apart from a real failure.
		if (/^Timed out after|GPUI UI thread/.test((error as Error).message)) return null;
		throw error;
	}
}

/**
 * Runs a read that waits on GPUI's UI thread, for a timer or an effect that must not stall or throw:
 * null when there is no native, a dialog is open or the thread can't answer.
 */
export function read_native<T>(read: (native: Native) => T): T | null {
	const native = get_native();
	if (!native || open_dialogs > 0) return null;
	return answered(() => read(native));
}

/** An upload waits on the UI thread too, and only the newest one per element can still matter once the dialog closes. */
function upload(node: NodeRef, send: (id: number) => void) {
	with_native_id(node, (id) => {
		if (open_dialogs > 0) held_uploads.set(id, [node, send]);
		else answered(() => send(id));
	});
}

function release_uploads() {
	for (const [node, send] of held_uploads.values()) {
		upload(node, (id) => {
			// Inside the deferred call, because behind a commit a throw would cost every other call queued there.
			try {
				send(id);
			} catch (error) {
				console.error('[gpuix-svelte] an image held back during a dialog failed to upload:', error);
			}
		});
	}
	held_uploads.clear();
}

export function set_window_title(title: string) {
	win()?.setWindowTitle?.(title);
	set_titlebar_title(title);
}

/** Brings a window opened with `show: false` or `focus: false` forward. */
export const activate_window = () => win()?.activateWindow?.();

export const minimize_window = () => win()?.minimizeWindow?.();

/** macOS's zoom, maximize elsewhere. */
export const zoom_window = () => win()?.zoomWindow?.();

export const toggle_fullscreen = () => win()?.toggleFullscreen?.();

/** The platform file picker: absolute paths, or null when the user cancels. Rejects in a browser. */
export async function prompt_for_paths(options?: PathPromptOptions): Promise<string[] | null> {
	const native = win();
	if (!native?.promptForPaths) return null;
	// macOS and Linux keep the UI thread running behind their picker and the app stays usable, so nothing may hold still.
	if (globalThis.process?.platform !== 'win32') return native.promptForPaths(options);

	// The dialog disables the window it belongs to, so the size read here holds until it closes.
	if (open_dialogs === 0) size_under_dialog = read_native((n) => (n as WindowNative).getWindowSize?.() ?? null);
	open_dialogs++;
	try {
		return await native.promptForPaths(options);
	} finally {
		if (--open_dialogs === 0) {
			size_under_dialog = null;
			release_uploads();
		}
	}
}

/** Gives focus back from an `<input>` / `<textarea>` to the window. */
export const blur = () => win()?.blur?.();

export function focus_element(node: NodeRef) {
	with_native_id(node, (id) => win()?.focusElement?.(id));
}

export const focused_element = (): ShadowNode | null => node_of(read_native((n) => (n as WindowNative).getFocusedElementId?.()));

/** Moves focus to the next tab stop in the window, wrapping at the end; Tab itself moves nothing since native 0.7. */
export const focus_next = () => win()?.focusNext?.();

export const focus_previous = () => win()?.focusPrevious?.();

/** Moves focus to the next tab stop inside `node`, wrapping within it. */
export function focus_next_within(node: NodeRef) {
	with_native_id(node, (id) => win()?.focusNextWithin?.(id));
}

export function focus_previous_within(node: NodeRef) {
	with_native_id(node, (id) => win()?.focusPreviousWithin?.(id));
}

/** Scrolls the nearest scroll container or `<virtual-list>` until `node` is visible. */
export function scroll_into_view(node: NodeRef) {
	with_native_id(node, (id) => win()?.scrollIntoView?.(id));
}

/**
 * Encoded image bytes (PNG, JPEG, WebP, GIF, SVG, …) onto an `<img>`, no data URL in between.
 * Native forgets them when the element is destroyed or its `src` changes, so call it again then.
 */
export function set_image(node: NodeRef, bytes: Uint8Array) {
	upload(node, (id) => win()?.setImage?.(id, bytes));
}

/** Packed straight-alpha pixels, scaled into the element's box like any image, so a 2× bitmap stays sharp on retina. */
export function set_image_pixels(node: NodeRef, width: number, height: number, pixels: Uint8Array, format: PixelFormat = 'rgba') {
	upload(node, (id) => win()?.setImagePixels?.(id, width, height, pixels, format));
}

/**
 * A TrueType or OpenType file (or collection), usable by `font-family` under the names it declares.
 * Throws on a font GPUI can't use; the wasm build has no fonts to add to, so it does nothing there.
 */
export const register_font = (bytes: Uint8Array) => win()?.registerFont?.(bytes);

/** The elements painted under a window point, topmost first, like the DOM's `elementsFromPoint`. */
export const elements_at = (x: number, y: number): ShadowNode[] =>
	(read_native((n) => (n as WindowNative).getElementsAt?.(x, y)) ?? []).map(node_of).filter((n) => n !== null);

const OVERLAY_MODES = new Set<string>(['hidden', 'minimal', 'full']);
const warned_overlays = new Set<string>();

export function set_debug_overlay(mode: DebugFrameOverlayMode): DebugFrameOverlayMode | undefined {
	if (!OVERLAY_MODES.has(mode)) {
		// Native throws on it, and `GPUIX_FPS` carries any typo straight into `render()`.
		if (!warned_overlays.has(mode)) {
			warned_overlays.add(mode);
			console.warn(`[gpuix-svelte] unknown debug frame overlay "${mode}", expected hidden, minimal or full`);
		}
		return undefined;
	}
	return win()?.setDebugFrameOverlay?.(mode) as DebugFrameOverlayMode | undefined;
}

/** Hidden → minimal → full → hidden. */
export const cycle_debug_overlay = () => win()?.cycleDebugFrameOverlay?.() as DebugFrameOverlayMode | undefined;

export const debug_overlay = () => (read_native((n) => (n as WindowNative).getDebugFrameOverlay?.()) ?? undefined) as DebugFrameOverlayMode | undefined;

/** Recorded whether or not the overlay is showing; the wasm build has none. */
export const debug_overlay_stats = (): DebugFrameOverlayStats | undefined =>
	read_native((n) => (n as WindowNative).getDebugFrameOverlayStats?.()) ?? undefined;

/** Clears the draw samples behind the percentiles; the frame count keeps going. */
export const reset_debug_overlay_stats = () => win()?.resetDebugFrameOverlayStats?.();

// Looked up on every read, so a poll that outlives a remount follows the new native.
const geometry = {
	// Upstream's read swallows the timeout and reports its 800×600 fallback, which would reflow the app under the dialog.
	getWindowSize: () => size_under_dialog ?? win()?.getWindowSize?.(),
	getWindowInsets: () => win()?.getWindowInsets?.()
} as WindowSizeHost & WindowInsetsHost;

/** No native resize event exists, so this polls (every 100 ms), and only while an effect is reading. */
function polled<T>(
	read: (host: typeof geometry) => T,
	observe: (host: typeof geometry, callback: (value: T) => void) => () => void
): () => T {
	let value: T;
	let live = false;
	const subscribe = createSubscriber((update) => {
		// The observer reports its first read synchronously, inside the reading effect, which must not rerun for it.
		const stop = observe(geometry, (next) => {
			value = next;
			if (live) update();
		});
		live = true;
		return () => {
			stop();
			live = false;
		};
	});
	return () => {
		subscribe();
		return live ? value : read(geometry);
	};
}

// One poll for everything that watches the size: `window_size` and `media_query` readers and the renderer's
// `@media` rules, so they agree frame for frame and a Windows dialog stalls none of them.
const size_watchers = new Set<(size: WindowSize) => void>();
let stop_size: (() => void) | null = null;
let last_size: WindowSize | null = null;

function watch_size(callback: (size: WindowSize) => void): () => void {
	size_watchers.add(callback);
	if (stop_size === null) {
		stop_size = observeWindowSize(geometry, (next) => {
			last_size = next;
			for (const watcher of size_watchers) watcher(next);
		});
	} else {
		callback(last_size!);
	}
	return () => {
		size_watchers.delete(callback);
		if (size_watchers.size > 0) return;
		stop_size?.();
		stop_size = null;
		last_size = null;
	};
}

const size = polled(readWindowSize, (_host, callback) => watch_size(callback));
const insets = polled(readWindowInsets, observeWindowInsets);

set_viewport_observer(watch_size);

const warned_queries = new Set<string>();

/**
 * `matchMedia` for a window: `(min-width: 600px)`, `(width < 900px)`, `(orientation: portrait)` and
 * their `and` / comma combinations, reactive through the same poll as `window_size`. A query a window
 * cannot answer never matches, as a browser's `not all`, and is warned about once.
 */
export function media_query(query: string): MediaQueryState {
	const list = parse_media_query(query);
	if (list === null && !warned_queries.has(query)) {
		warned_queries.add(query);
		console.warn(`[gpuix-svelte] media_query("${query}") never matches on GPUI — a window answers only for ${MEDIA_FEATURES}`);
	}
	// A query with no answer never starts the poll either.
	if (list === null) return { current: false };
	return {
		get current() {
			return media_matches(list, size());
		}
	};
}

/** The window's logical size, reactive in a template or effect; 800×600 until a native exists. */
export const window_size: Readonly<WindowSize> = {
	get width() {
		return size().width;
	},
	get height() {
		return size().height;
	}
};

/** Safe-area, IME and combined insets and what follows from them, polled like `window_size`; zero headlessly. */
export const window_insets: Readonly<WindowInsets> = {
	get safeArea() {
		return insets().safeArea;
	},
	get ime() {
		return insets().ime;
	},
	get effective() {
		return insets().effective;
	},
	get keyboardTop() {
		return insets().keyboardTop;
	},
	get keyboardVisible() {
		return insets().keyboardVisible;
	},
	get visibleHeight() {
		return insets().visibleHeight;
	}
};
