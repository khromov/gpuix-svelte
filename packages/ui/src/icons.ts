/**
 * The glyphs the components draw, as SVG markup: GPUI paints an `<svg source>` as a mask in the
 * element's `color`, and the DOM inlines the same markup, where `currentColor` does the same.
 */

const svg = (body: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
	check: svg('<path d="M3 8.5l3 3 7-7"/>'),
	'chevron-down': svg('<path d="M4 6l4 4 4-4"/>'),
	'chevron-up': svg('<path d="M4 10l4-4 4 4"/>'),
	'chevron-right': svg('<path d="M6 4l4 4-4 4"/>'),
	close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
	plus: svg('<path d="M8 3v10M3 8h10"/>'),
	minus: svg('<path d="M3 8h10"/>'),
	info: svg('<circle cx="8" cy="8" r="6.5"/><path d="M8 7.5v4M8 5v.1"/>'),
	warning: svg('<path d="M8 2.5l6 11H2z"/><path d="M8 7v3M8 12v.1"/>'),
	search: svg('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>')
} as const;

export type IconName = keyof typeof ICONS;
