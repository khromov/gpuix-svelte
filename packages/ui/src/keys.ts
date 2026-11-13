/**
 * Key names the GPUI way on both renderers: GPUI already says `enter`, `space` and `up`, while a DOM
 * KeyboardEvent says `Enter`, ` ` and `ArrowUp`. Element handlers get the raw event on each side
 * (only `on_window_key` normalises), so a shared component reads keys through here.
 */

export interface KeyLike {
	key?: string | null;
	/** GPUI's name for a key auto-repeating; the DOM's is `repeat`. */
	isHeld?: boolean;
	repeat?: boolean;
	/** GPUI's modifiers; the DOM's are the three flags below. */
	modifiers?: { alt?: boolean; ctrl?: boolean; cmd?: boolean } | null;
	altKey?: boolean;
	ctrlKey?: boolean;
	metaKey?: boolean;
	preventDefault(): void;
}

const NAMES: Record<string, string> = { ' ': 'space', spacebar: 'space', esc: 'escape', del: 'delete' };

export function key_of(e: { key?: string | null }): string {
	const lower = (e.key ?? '').toLowerCase();
	if (Object.hasOwn(NAMES, lower)) return NAMES[lower];
	return lower.startsWith('arrow') ? lower.slice(5) : lower;
}

/** Alt, Ctrl or Cmd held: a chord that belongs to the browser or the app (Alt+Left is Back), which a control's arrow keys must leave alone. */
export function chorded(e: KeyLike): boolean {
	const held = e.modifiers;
	return Boolean(held?.alt || held?.ctrl || held?.cmd || e.altKey || e.ctrlKey || e.metaKey);
}

/** A key auto-repeating while held, under either renderer's name for it. */
export const repeats = (e: KeyLike): boolean => Boolean(e.isHeld || e.repeat);

/**
 * Enter or Space, what presses a button-like element, once per press (a held key repeats the event); the
 * default (a page scroll on Space) is prevented for the repeats as well.
 */
export function activates(e: KeyLike): boolean {
	const key = key_of(e);
	if (key !== 'enter' && key !== 'space') return false;
	e.preventDefault();
	return !repeats(e);
}
