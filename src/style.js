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

/**
 * GPUI reads a longhand over its shorthand whatever the order, so a later
 * `padding: 20px` has to clear the longhands an earlier `padding: 12px 24px` left.
 */
const SUPERSEDES = { ...BOX, gap: ['rowGap', 'columnGap'] };

function put(out, key, value) {
	const longhands = SUPERSEDES[key];
	if (longhands) for (const l of longhands) delete out[l];
	out[key] = value;
}

function merge(target, source) {
	for (const key in source) put(target, key, source[key]);
	return target;
}

// The CSS 1-4 value rules; corners happen to fill in the same order as sides.
const FILL = [
	[0, 0, 0, 0],
	[0, 1, 0, 1],
	[0, 1, 2, 1],
	[0, 1, 2, 3]
];

const warned = new Set();

/** `var(--name)` values, set from JS; every rule or inline style that reads one re-resolves on change. */
const css_vars = new Map();
let vars_generation = 0;
let vars_read = false;
const warned_vars = new Set();

/** @param {Record<string, string | number | null>} vars keys with or without the `--` */
export function define_css_vars(vars) {
	for (const [key, value] of Object.entries(vars)) {
		const name = key.startsWith('--') ? key.slice(2) : key;
		if (value == null) css_vars.delete(name);
		else css_vars.set(name, String(value));
	}
	vars_generation++;
}

/** Whether the last `build_style` read a variable, so the renderer knows what to restyle. */
export const used_css_vars = () => vars_read;

/**
 * Replaces each `var(--name[, fallback])` in a value. Null means a variable was
 * undefined with no fallback, and the declaration has to be dropped.
 */
function substitute_vars(value) {
	let out = '';
	let at = 0;

	for (;;) {
		const start = value.indexOf('var(', at);
		if (start === -1) return out + value.slice(at);

		// Balanced parens, since a fallback may be `rgba(...)`.
		let depth = 0;
		let end = -1;
		for (let i = start + 3; i < value.length; i++) {
			if (value[i] === '(') depth++;
			else if (value[i] === ')' && --depth === 0) {
				end = i;
				break;
			}
		}
		if (end === -1) return out + value.slice(at);

		const inner = value.slice(start + 4, end);
		const comma = inner.indexOf(',');
		const name = (comma === -1 ? inner : inner.slice(0, comma)).trim().replace(/^--/, '');
		vars_read = true;

		let resolved = css_vars.get(name);
		if (resolved === undefined) {
			if (comma === -1) {
				if (!warned_vars.has(name)) {
					warned_vars.add(name);
					console.warn(`[gpuix-svelte] \`var(--${name})\` is not defined — set it with set_css_vars() or give it a fallback`);
				}
				return null;
			}
			resolved = substitute_vars(inner.slice(comma + 1).trim());
			if (resolved === null) return null;
		}

		out += value.slice(at, start) + resolved;
		at = end + 1;
	}
}

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

	put(out, key, coerced);
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
		const raw = decl.slice(colon + 1).trim();
		if (key === '' || raw === '') continue;

		const value = raw.includes('var(') ? substitute_vars(raw) : raw;
		if (value === null) continue;

		if (!expand(out, key, value)) assign(out, key, value);
	}

	return out;
}

/** A rule that reads a variable ships as CSS text and is parsed here, once per change. */
function rule_style(rule) {
	if (rule.css === undefined) return rule.style;

	if (rule.generation !== vars_generation) {
		rule.generation = vars_generation;
		rule.resolved = parse_css_text(rule.css);
	}
	vars_read = true;
	return rule.resolved;
}

/**
 * `hover` and `active` are GPUI's natively-handled pseudo styles — they are
 * nested objects, which CSS text can't express, so they arrive as their own
 * attributes (or as `:hover`/`:active` rules) and get folded back in here.
 *
 * @param {Record<string, any>} attrs raw attribute strings off the shadow node
 * @param {{ pseudo: string | null, style?: Record<string, any>, css?: string }[]} [rules] the
 *   element's matching `<style>` rules, weakest first
 */
export function build_style(attrs, rules = []) {
	vars_read = false;
	const style = {};
	let hover = null;
	let active = null;

	for (const rule of rules) {
		const declared = rule_style(rule);
		if (rule.pseudo === 'hover') hover = merge(hover ?? {}, declared);
		else if (rule.pseudo === 'active') active = merge(active ?? {}, declared);
		else merge(style, declared);
	}

	// Inline wins over a class, as in CSS.
	merge(style, parse_css_text(attrs.style));
	if (hover || attrs.hover) style.hover = merge(hover ?? {}, parse_css_text(attrs.hover));
	if (active || attrs.active) style.active = merge(active ?? {}, parse_css_text(attrs.active));

	return style;
}
