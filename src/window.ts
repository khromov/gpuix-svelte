/**
 * Window-level calls app code makes that the headless renderer cannot answer —
 * `TestGpuixRenderer` has no window to title, activate or blur — so each one is a
 * no-op there rather than a guard in every component.
 */

import { get_native } from './renderer.ts';
import type { WindowNative } from './types.ts';

const win = () => get_native() as WindowNative | null;

export const set_window_title = (title: string) => win()?.setWindowTitle?.(title);

/** Brings a window opened with `show: false` or `focus: false` forward. */
export const activate_window = () => win()?.activateWindow?.();

/** Gives focus back from an `<input>` / `<textarea>` to the window. */
export const blur = () => win()?.blur?.();

/** `node` is a shadow node, from `{@attach}` or `use:`. */
export function focus_element(node: { nativeId?: number | null } | null | undefined) {
	if (node?.nativeId != null) win()?.focusElement?.(node.nativeId);
}
