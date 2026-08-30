/**
 * Event-name translation.
 *
 * Svelte lowercases event names when it compiles `onmouseenter={...}` down to
 * `$.event('mouseenter', ...)`. GPUI's retained tree keys listeners by the
 * camelCase names in `@gpuix/react`'s EVENT_PROPS (`mouseEnter`). Deriving the
 * map by lowercasing GPUI's own list keeps the two in sync automatically,
 * including the custom-element events.
 */

/** The event types GPUI knows about, spelled the way GPUI spells them. */
export const GPUI_EVENTS = [
	// custom elements (<diff>, <markdown>, <input>, <textarea>)
	'toggleFile',
	'showMore',
	'lineClick',
	'linkClick',
	'change',
	'submit',
	// mouse
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
	// focus
	'focus',
	'blur',
	// scroll
	'scroll'
];

const BY_LOWERCASE = new Map(GPUI_EVENTS.map((name) => [name.toLowerCase(), name]));

/**
 * @param {string} type an event name as Svelte spells it, e.g. `mouseenter`
 * @returns {string | null} the GPUI spelling, or null if GPUI has no such event
 */
export function to_gpui_event(type) {
	return BY_LOWERCASE.get(type.toLowerCase()) ?? null;
}
