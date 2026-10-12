/**
 * Window-level calls app code makes that the headless renderer cannot answer —
 * `TestGpuixRenderer` has no window to title, activate or blur — so each one is a
 * no-op there rather than a guard in every component.
 */

import type { PathPromptOptions } from '@gpuix/native';
import type { DebugFrameOverlayMode, DebugFrameOverlayStats } from '@gpuix/native/host';
import { get_native, node_of, with_native_id } from './renderer.ts';
import type { ShadowNode, WindowNative } from './types.ts';

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
