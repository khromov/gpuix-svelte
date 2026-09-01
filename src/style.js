/**
 * Unknown keys need no allowlist — serde drops them when deserializing
 * `StyleDesc` on the Rust side. Values are the opposite: a key GPUI *does*
 * know, handed a string it can't parse, throws out of `applyBatch`.
 */

const PX = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)px$/i;
const NUM = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const PERCENT = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$/;
const NUMERIC_ISH = /^[-+.\d]/;

/** GPUI reads these as a bare `f64`, so any string at all fails to deserialize. */
const NUMBER_ONLY = new Set([
	'flexGrow',
	'flexShrink',
	'flexBasis',
	'gap',
	'rowGap',
	'columnGap',
	'gridTemplateColumns',
	'gridTemplateRows',
	'padding',
	'paddingTop',
	'paddingRight',
	'paddingBottom',
	'paddingLeft',
	'margin',
	'marginTop',
	'marginRight',
	'marginBottom',
	'marginLeft',
	'top',
	'right',
	'bottom',
	'left',
	'opacity',
	'borderWidth',
	'borderTopWidth',
	'borderRightWidth',
	'borderBottomWidth',
	'borderLeftWidth',
	'borderRadius',
	'borderTopLeftRadius',
	'borderTopRightRadius',
	'borderBottomLeftRadius',
	'borderBottomRightRadius',
	'fontSize',
	'lineHeight',
	'lineClamp'
]);

/** The only keys GPUI reads as a `DimensionValue`, so the only ones `%` and `auto` survive. */
const DIMENSION = new Set(['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight']);

/** A struct on the Rust side — CSS text can never produce one. */
const NEVER = new Set(['boxShadow']);

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

function accepts(key, value) {
	if (NEVER.has(key)) return false;
	if (NUMBER_ONLY.has(key)) return typeof value === 'number';
	if (DIMENSION.has(key)) {
		return typeof value === 'number' || value === 'auto' || PERCENT.test(value);
	}
	// Not a key we have typed: serde drops it if GPUI doesn't know it either, but
	// a length-shaped string on one it does know would throw, so keep those out.
	return typeof value !== 'string' || !NUMERIC_ISH.test(value);
}

/**
 * A value GPUI's deserializer would reject (`1rem`, `12px 24px`, `50%` on a
 * pixel-only key) throws out of `applyBatch` and takes the whole frame with it,
 * so drop it and say so once per property.
 */
function assign(out, key, value) {
	const coerced = coerce(value);

	if (!accepts(key, coerced)) {
		if (!warned.has(key)) {
			warned.add(key);
			console.warn(`[gpuix-svelte] dropped unsupported style value \`${key}: ${value}\``);
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
 * attributes (or as `:hover`/`:active` rules) and get folded back in here.
 *
 * @param {Record<string, any>} attrs raw attribute strings off the shadow node
 * @param {{ pseudo: string | null, style: Record<string, any> }[]} [rules] the
 *   element's matching `<style>` rules, weakest first
 */
export function build_style(attrs, rules = []) {
	const style = {};
	let hover = null;
	let active = null;

	for (const rule of rules) {
		if (rule.pseudo === 'hover') hover = Object.assign(hover ?? {}, rule.style);
		else if (rule.pseudo === 'active') active = Object.assign(active ?? {}, rule.style);
		else Object.assign(style, rule.style);
	}

	// Inline wins over a class, as in CSS.
	Object.assign(style, parse_css_text(attrs.style));
	if (hover || attrs.hover) style.hover = Object.assign(hover ?? {}, parse_css_text(attrs.hover));
	if (active || attrs.active) style.active = Object.assign(active ?? {}, parse_css_text(attrs.active));

	return style;
}
