/**
 * Key names the GPUI way on both renderers: GPUI already says `enter`, `space` and `up`, while a DOM
 * KeyboardEvent says `Enter`, ` ` and `ArrowUp`. Element handlers get the raw event on each side
 * (only `on_window_key` normalises), so a shared component reads keys through here.
 */

export interface KeyLike {
	key?: string | null;
	preventDefault(): void;
}

const NAMES: Record<string, string> = { ' ': 'space', spacebar: 'space', esc: 'escape', del: 'delete' };

export function key_of(e: { key?: string | null }): string {
	const lower = (e.key ?? '').toLowerCase();
	if (Object.hasOwn(NAMES, lower)) return NAMES[lower];
	return lower.startsWith('arrow') ? lower.slice(5) : lower;
}

/** Enter or Space, what presses a button-like element; the default (a page scroll on Space) is prevented when it is. */
export function activates(e: KeyLike): boolean {
	const key = key_of(e);
	if (key !== 'enter' && key !== 'space') return false;
	e.preventDefault();
	return true;
}
