/**
 * Window-level calls app code makes that the headless renderer cannot answer —
 * `TestGpuixRenderer` has no window to title, activate or blur — so each one is a
 * no-op there rather than a guard in every component.
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

export function focus_element(node: NodeRef) {
	with_native_id(node, (id) => win()?.focusElement?.(id));
}

export const focused_element = (): ShadowNode | null => node_of(win()?.getFocusedElementId?.());

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
