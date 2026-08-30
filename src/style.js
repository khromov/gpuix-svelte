/**
 * Unknown keys need no allowlist — serde drops them when deserializing
 * `StyleDesc` on the Rust side. Values are the opposite: a key GPUI *does*
 * know, handed a string it can't parse, throws out of `applyBatch`.
 */

const PX = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)px$/i;
const NUM = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const PERCENT = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$/;
const NUMERIC_ISH = /^[+-.\d]/;

/** GPUI has no `inset` field, so that one expands even when it holds one value. */
const BOX = {
	padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
	margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
	borderWidth: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'],
	borderRadius: [
		'borderTopLeftRadius',
		'borderTopRightRadius',
		'borderBottomRightRadius',
		'borderBottomLeftRadius'
	],
	inset: ['top', 'right', 'bottom', 'left']
};

// The CSS 1-4 value rules; corners happen to fill in the same order as sides.
const FILL = [
	[0, 0, 0, 0],
	[0, 1, 0, 1],
	[0, 1, 2, 1],
	[0, 1, 2, 3]
];

const warned = new Set();

function camel(key) {
	return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** `12px` must become `12`, while `50%`, `auto` and `#1e1e2e` stay strings. */
function coerce(value) {
	if (PX.test(value) || NUM.test(value)) return parseFloat(value);
	return value;
}

/**
 * A value that still looks like a length after coercion (`1rem`, `12px 24px`,
 * `0 2px 4px rgba(...)`) would throw on the Rust side and take the frame loop
 * with it, so drop it and say so once.
 */
function assign(out, key, value) {
	const coerced = coerce(value);

	if (typeof coerced === 'string' && NUMERIC_ISH.test(coerced) && !PERCENT.test(coerced)) {
		const seen = `${key}: ${value}`;
		if (!warned.has(seen)) {
			warned.add(seen);
			console.warn(`[gpuix-svelte] dropped unsupported style value \`${seen}\``);
		}
		return;
	}

	out[key] = coerced;
}

function expand(out, key, value) {
	const parts = value.split(/\s+/);

	if (key === 'gap' && parts.length === 2) {
		assign(out, 'rowGap', parts[0]);
		assign(out, 'columnGap', parts[1]);
		return true;
	}

	const targets = BOX[key];
	if (!targets || parts.length > 4 || (parts.length === 1 && key !== 'inset')) return false;

	const fill = FILL[parts.length - 1];
	for (let i = 0; i < 4; i++) assign(out, targets[i], parts[fill[i]]);
	return true;
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

		const key = camel(decl.slice(0, colon).trim());
		const value = decl.slice(colon + 1).trim();
		if (key === '' || value === '') continue;

		if (!expand(out, key, value)) assign(out, key, value);
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
