/**
 * Window-level calls app code makes that the headless renderer cannot answer —
 * `TestGpuixRenderer` has no window to title, activate or blur — so each one is a
 * no-op there, which spares every component a guard.
 */

import type { PathPromptOptions } from '@gpuix/native';
import { get_native, node_of, with_native_id } from './renderer.ts';
import type { ShadowNode, WindowNative } from './types.ts';
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

export const set_window_title = (title: string) => win()?.setWindowTitle?.(title);

/** Brings a window opened with `show: false` or `focus: false` forward. */
export const activate_window = () => win()?.activateWindow?.();

export const minimize_window = () => win()?.minimizeWindow?.();

/** macOS's zoom, maximize elsewhere. */
export const zoom_window = () => win()?.zoomWindow?.();

export const toggle_fullscreen = () => win()?.toggleFullscreen?.();

/** The platform file picker: absolute paths, or null when the user cancels. Rejects in a browser. */
export const prompt_for_paths = (options?: PathPromptOptions): Promise<string[] | null> =>
	win()?.promptForPaths?.(options) ?? Promise.resolve(null);

/** Gives focus back from an `<input>` / `<textarea>` to the window. */
export const blur = () => win()?.blur?.();

type Host = { gpuixHost?: { openUrl(url: string): void }; window?: { open(url: string, target: string): unknown } };

/**
 * Opens a URL in the user's browser: the QuickJS host's opener, `window.open` in a
 * browser, the platform command under Node and Bun. The Node import is computed so
 * no bundler follows it into a browser or QuickJS bundle.
 */
export function open_url(url: string): void {
	const host = globalThis as unknown as Host;
	if (host.gpuixHost) return host.gpuixHost.openUrl(url);
	if (host.window?.open) {
		host.window.open(url, '_blank');
		return;
	}
	const child_process = 'node:child_process';
	import(child_process).then(
		({ spawn }: typeof import('node:child_process')) => {
			const command =
				process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['cmd', '/C', 'start', '', url] : ['xdg-open', url];
			const child = spawn(command[0], command.slice(1), { stdio: 'ignore', detached: true });
			// An unhandled 'error' event (no xdg-open on the box) would take the window down with it.
			child.on('error', (error) => console.error('[gpuix-svelte] could not open browser:', error.message));
			child.unref();
		},
		(error: unknown) => console.error('[gpuix-svelte] could not open browser:', (error as Error).message)
	);
}

export function focus_element(node: NodeRef) {
	with_native_id(node, (id) => win()?.focusElement?.(id));
}

export const focused_element = (): ShadowNode | null => node_of(win()?.getFocusedElementId?.());

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
	with_native_id(node, (id) => win()?.setImage?.(id, bytes));
}

/** Packed straight-alpha RGBA, scaled into the element's box like any image, so a 2× bitmap stays sharp on retina. */
export function set_image_pixels(node: NodeRef, width: number, height: number, rgba: Uint8Array) {
	with_native_id(node, (id) => win()?.setImagePixels?.(id, width, height, rgba));
}

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

export const debug_overlay = () => win()?.getDebugFrameOverlay?.() as DebugFrameOverlayMode | undefined;

/** Recorded whether or not the overlay is showing; the wasm build has none. */
export const debug_overlay_stats = (): DebugFrameOverlayStats | undefined => win()?.getDebugFrameOverlayStats?.();

/** Clears the draw samples behind the percentiles; the frame count keeps going. */
export const reset_debug_overlay_stats = () => win()?.resetDebugFrameOverlayStats?.();

// Looked up on every read, so a poll that outlives a remount follows the new native.
const geometry = {
	getWindowSize: () => win()?.getWindowSize?.(),
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

const size = polled(readWindowSize, observeWindowSize);
const insets = polled(readWindowInsets, observeWindowInsets);

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
