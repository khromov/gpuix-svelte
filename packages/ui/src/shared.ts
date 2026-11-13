/**
 * The few places a component has to say something per renderer, kept out of the components: GPUI has
 * attributes the DOM typecheck would refuse, so they travel as spreads, and it measures a box through
 * native rather than the element.
 */

import { IS_GPUIX, focus_element, focused_element, media_query, read_native, type MediaQueryState } from 'gpuix-svelte';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface Option {
	value: string;
	label: string;
	disabled?: boolean;
	/** A second line under the label, where a component has room for one. */
	description?: string;
}

export type MenuEntry =
	| {
			label: string;
			onselect?: () => void;
			disabled?: boolean;
			danger?: boolean;
			/** Shown at the right as a `Kbd`, e.g. `⌘S`. */
			shortcut?: string;
			separator?: false;
	  }
	| { separator: true };

/** A clickable box with painted children asks GPUI for its own hitbox; the browser bubbles the click up itself. */
export const own_hitbox: Record<string, string> = IS_GPUIX ? { hitbox: 'self' } : {};

/** `testid` on GPUI, `data-testid` in the DOM, nothing when unset. */
export const test_id = (id: string | null | undefined): Record<string, string> => (id == null ? {} : IS_GPUIX ? { testid: id } : { 'data-testid': id });

type Pointer = { x?: number; clientX?: number; button?: number; pressedButton?: number | null; buttons?: number };
type Captured = Pointer & { pointerId?: number; currentTarget?: unknown };

/**
 * The handlers of a drag that stays with the element pressed, past its box and the window's edge. GPUI
 * captures the pointer for an element that listens for mousedown and mousemove; a page's element captures
 * it by hand, through pointer events so a finger drags too (give the element a `touch-action`).
 */
export function drag_handlers(down: (e: Pointer) => void, move: (e: Pointer) => void, release: () => void): Record<string, (e: Captured) => void> {
	if (IS_GPUIX) return { onmousedown: down, onmousemove: move, onmouseup: release };
	return {
		onpointerdown: (e) => {
			if ((e.button ?? 0) !== 0) return;
			try {
				(e.currentTarget as Element | null)?.setPointerCapture(e.pointerId ?? 0);
			} catch {
				// A pointer that is no longer down cannot be captured, and its drag ends at the element's edge.
			}
			down(e);
		},
		onpointermove: move,
		onpointerup: release,
		onpointercancel: release
	};
}

/** GPUI's accessibility tree takes `aria-selected`; the DOM's checkboxes, radios and switches want `aria-checked`. */
export const aria_checked = (checked: boolean): Record<string, boolean> => (IS_GPUIX ? { 'aria-selected': checked } : { 'aria-checked': checked });

/** What tells a page's screen reader a control is off; GPUI's accessibility tree has no disabled state to set. */
export const aria_disabled = (disabled: boolean | undefined): Record<string, boolean> => (IS_GPUIX || !disabled ? {} : { 'aria-disabled': true });

/** The value attributes a DOM slider or progress bar needs; GPUI forwards none of them. */
export const aria_value = (now: number, min: number, max: number): Record<string, number> => (IS_GPUIX ? {} : { 'aria-valuenow': now, 'aria-valuemin': min, 'aria-valuemax': max });

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The painted box of an attached node in window coordinates, or null before it has one. */
export function bounds_of(node: unknown): Box | null {
	if (!node) return null;
	if (IS_GPUIX) {
		const id = (node as { nativeId?: number | null }).nativeId;
		return id == null ? null : read_native((native) => native.getElementBounds(id));
	}
	const rect = (node as Element).getBoundingClientRect();
	return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

/** `focus_element` for whatever node an `{@attach}` handed over, on either renderer. */
export const focus_node = (node: unknown) => focus_element(node as Parameters<typeof focus_element>[0]);

/** Whether the keyboard focus is on an attached node or inside it. */
export function holds_focus(node: unknown): boolean {
	const focused: unknown = focused_element();
	if (!node || !focused) return false;
	if (!IS_GPUIX) return (node as Node).contains(focused as Node);
	for (let at = focused as { parent?: unknown } | null; at; at = (at.parent ?? null) as { parent?: unknown } | null) {
		if (at === node) return true;
	}
	return false;
}

/** A pointer's position in the coordinates `bounds_of` uses: GPUI's `e.x`, the DOM's `clientX`. */
export const pointer_x = (e: { x?: number; clientX?: number }): number => (IS_GPUIX ? e.x : e.clientX) ?? 0;

/** Whether a button is still held during a move: GPUI reports `pressedButton`, the DOM `buttons`. */
export const still_pressed = (e: { pressedButton?: number | null; buttons?: number }): boolean => (IS_GPUIX ? e.pressedButton != null : (e.buttons ?? 0) > 0);

const platform = globalThis.process?.platform;

/**
 * GPUI takes one installed family name and draws every weight regular for one it lacks; a page takes a
 * stack. With no `process` GPUI is its wasm build, which has only the faces it embeds.
 */
export const MONO: string = IS_GPUIX
	? platform === undefined
		? 'Lilex'
		: platform === 'win32'
			? 'Consolas'
			: platform === 'linux'
				? 'DejaVu Sans Mono'
				: 'Menlo'
	: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const BREAKPOINTS = { sm: 480, md: 768, lg: 1024, xl: 1280 } as const;
export type Breakpoint = keyof typeof BREAKPOINTS;

const px = (at: Breakpoint | number) => (typeof at === 'number' ? at : BREAKPOINTS[at]);

/** `media_query('(min-width: …)')` at a named breakpoint or a pixel width. */
export const min_width = (at: Breakpoint | number): MediaQueryState => media_query(`(min-width: ${px(at)}px)`);

/** Everything narrower than the breakpoint, `(width < 768px)` for `md`: the range form leaves no fractional width unmatched. */
export const max_width = (at: Breakpoint | number): MediaQueryState => media_query(`(width < ${px(at)}px)`);
