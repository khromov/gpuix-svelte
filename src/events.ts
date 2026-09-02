/**
 * Deriving the map by lowercasing GPUI's own list keeps it in sync with the names
 * Svelte emits, which the compiler has already lowercased.
 */

export const GPUI_EVENTS: readonly string[] = [
	// custom elements (<diff>, <markdown>, <input>, <textarea>)
	'toggleFile',
	'showMore',
	'lineClick',
	'linkClick',
	'change',
	'submit',
	'click',
	'mouseDown',
	'mouseUp',
	'mouseEnter',
	'mouseLeave',
	'mouseMove',
	'mouseDownOutside',
	// keyboard — require focus (tabIndex or autofocus)
	'keyDown',
	'keyUp',
	'focus',
	'blur',
	'scroll',
	// `highlight={{ query }}` on div/text reports its match count
	'highlight',
	// `<virtual-list>` reports the rows it has in view instead of a scroll offset
	'visibleRange'
];

/** Not element events: they arrive on the id handed to `setWindowKeyEvents` (see `on_window_key`). */
export const WINDOW_KEY_EVENTS: Partial<Record<string, 'windowKeyDown' | 'windowKeyUp'>> = {
	keydown: 'windowKeyDown',
	keyup: 'windowKeyUp'
};

const BY_LOWERCASE = new Map(GPUI_EVENTS.map((name) => [name.toLowerCase(), name]));

/** The GPUI spelling of an event name as Svelte spells it (`mouseenter`), or null if GPUI has no such event. */
export function to_gpui_event(type: string): string | null {
	return BY_LOWERCASE.get(type.toLowerCase()) ?? null;
}
