/**
 * CSS text -> GPUI `StyleDesc`.
 *
 * Svelte hands the renderer the `style` attribute as CSS *text*, never as an
 * object: `set_css_text` calls `renderer.setAttribute(el, 'style', string)`.
 * GPUI wants a camelCase JSON object whose lengths are bare numbers (px).
 * So this is the translation layer between the two.
 *
 * Unknown keys need no allowlist — serde drops them when deserializing
 * `StyleDesc` on the Rust side.
 */

const PX = /^-?\d+(?:\.\d+)?px$/i;
const NUM = /^-?\d+(?:\.\d+)?$/;

function camel(key) {
	return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * GPUI takes numbers for lengths and `number | "N%" | "auto"` for dimensions,
 * so `12px` must become `12` while `50%`, `auto` and `#1e1e2e` stay strings.
 */
function coerce(value) {
	if (PX.test(value)) return parseFloat(value);
	if (NUM.test(value)) return parseFloat(value);
	return value;
}

/**
 * @param {string | null | undefined} css
 * @returns {Record<string, any>}
 */
export function parse_css_text(css) {
	/** @type {Record<string, any>} */
	const out = {};
	if (!css) return out;

	for (const decl of css.split(';')) {
		const colon = decl.indexOf(':');
		if (colon === -1) continue;

		const key = decl.slice(0, colon).trim();
		const value = decl.slice(colon + 1).trim();
		if (key === '' || value === '') continue;

		out[camel(key)] = coerce(value);
	}

	return out;
}

/**
 * `hover` and `active` are GPUI's natively-handled pseudo styles — they are
 * nested objects, which CSS text can't express, so they arrive as their own
 * attributes and get folded back in here.
 *
 * @param {Record<string, any>} attrs raw attribute strings off the shadow node
 */
export function build_style(attrs) {
	const style = parse_css_text(attrs.style);

	if (attrs.hover) style.hover = parse_css_text(attrs.hover);
	if (attrs.active) style.active = parse_css_text(attrs.active);

	return style;
}
