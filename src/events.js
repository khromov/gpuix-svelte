/**
 * Deriving the map by lowercasing GPUI's own list keeps it in sync with the names
 * Svelte emits, which the compiler has already lowercased.
 */

export const GPUI_EVENTS = [
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
	'highlight'
];

const BY_LOWERCASE = new Map(GPUI_EVENTS.map((name) => [name.toLowerCase(), name]));

/**
 * @param {string} type an event name as Svelte spells it, e.g. `mouseenter`
 * @returns {string | null} the GPUI spelling, or null if GPUI has no such event
 */
export function to_gpui_event(type) {
	return BY_LOWERCASE.get(type.toLowerCase()) ?? null;
}
