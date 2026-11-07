/**
 * The few places a component has to say something per renderer, kept out of the components: GPUI has
 * attributes the DOM typecheck would refuse, so they travel as spreads, and it measures a box through
 * native rather than the element.
 */

import { IS_GPUIX, focus_element, media_query, read_native, type MediaQueryState } from 'gpuix-svelte';

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

/** GPUI's accessibility tree takes `aria-selected`; the DOM's checkboxes, radios and switches want `aria-checked`. */
export const aria_checked = (checked: boolean): Record<string, boolean> => (IS_GPUIX ? { 'aria-selected': checked } : { 'aria-checked': checked });

/** The value attributes a DOM slider or progress bar needs; GPUI forwards none of them. */
export const aria_value = (now: number, min: number, max: number): Record<string, number> => (IS_GPUIX ? {} : { 'aria-valuenow': now, 'aria-valuemin': min, 'aria-valuemax': max });

const overlays: object[] = [];

/**
 * Overlays that close on Escape register while open, so only the topmost one acts on the key: a Select
 * open inside a Dialog closes alone, and the Dialog on the next press.
 */
export function open_overlay(): { on_top(): boolean; release(): void } {
	const token = {};
	overlays.push(token);
	return {
		on_top: () => overlays[overlays.length - 1] === token,
		release: () => {
			const at = overlays.lastIndexOf(token);
			if (at !== -1) overlays.splice(at, 1);
		}
	};
}

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

/** A pointer's position in the coordinates `bounds_of` uses: GPUI's `e.x`, the DOM's `clientX`. */
export const pointer_x = (e: { x?: number; clientX?: number }): number => (IS_GPUIX ? e.x : e.clientX) ?? 0;

/** Whether a button is still held during a move: GPUI reports `pressedButton`, the DOM `buttons`. */
export const still_pressed = (e: { pressedButton?: number | null; buttons?: number }): boolean => (IS_GPUIX ? e.pressedButton != null : (e.buttons ?? 0) > 0);

/** GPUI takes one installed family name and draws every weight regular for one it lacks; a page takes a stack. */
export const MONO: string = IS_GPUIX
	? globalThis.process?.platform === 'win32'
		? 'Consolas'
		: globalThis.process?.platform === 'linux'
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
