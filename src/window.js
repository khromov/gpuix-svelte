/**
 * Window-level calls app code makes that the headless renderer cannot answer —
 * `TestGpuixRenderer` has no window to title, activate or blur — so each one is a
 * no-op there rather than a guard in every component.
 */

import { get_native } from './renderer.js';

export const set_window_title = (title) => get_native()?.setWindowTitle?.(title);

/** Brings a window opened with `show: false` or `focus: false` forward. */
export const activate_window = () => get_native()?.activateWindow?.();

/** Gives focus back from an `<input>` / `<textarea>` to the window. */
export const blur = () => get_native()?.blur?.();

/** @param {any} node a shadow node, from `{@attach}` or `use:` */
export function focus_element(node) {
	if (node?.nativeId != null) get_native()?.focusElement?.(node.nativeId);
}
