/**
 * Unknown keys need no allowlist — serde drops them when deserializing
 * `StyleDesc` on the Rust side. Values are the opposite: a key GPUI *does*
 * know, handed a string it can't parse, throws out of `applyBatch`.
 */

import type { GpuiStyle, ShadowAttrs, StyleRule, StyleValue } from './types.ts';

const PX = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)px$/i;
const NUM = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const PERCENT = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$/;
const REM = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)rem$/i;
const NUMERIC_ISH = /^[-+.\d]/;

/** No GPUI sizing mode matches these, and `auto` is the nearest a `DimensionValue` can say. */
const INTRINSIC = /^(?:max-content|min-content|fit-content)(?:\(.*\))?$/;

/** Native matches only `scroll` and `hidden`, so `auto` would be accepted and then ignored. */
const OVERFLOW = new Set(['overflow', 'overflowX', 'overflowY']);

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
	'lineClamp',
	'aspectRatio',
	'outlineWidth',
	'outlineOffset',
	'scrollbarWidth'
]);

/** Rust `bool`s: the string CSS text hands over would fail to deserialize. */
const BOOLEAN = new Set(['keyboardFocusDim']);

/** A unitless `aspect-ratio`, `1.5` or `16 / 9`; a length is no ratio, so it must not coerce like one. */
const RATIO = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*\/\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+)))?$/;

/** GPUI paints a thumb and no track, so only the first colour of `scrollbar-color: thumb track` applies. */
const FIRST_COLOR = /^(?:[^\s(]+\([^)]*\)|\S+)/;

/** The only keys GPUI reads as a `DimensionValue`, so the only ones `%` and `auto` survive. */
const DIMENSION = new Set(['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight']);

const PSEUDO_ATTRS = [
	['hover', 'hover'],
	['active', 'active'],
	['focusVisible', 'focus-visible']
] as const;

/** A struct on the Rust side — CSS text can never produce one. */
const NEVER = new Set(['boxShadow', 'hover', 'active', 'focusVisible']);

/** GPUI has no `inset` field, so that one expands even when it holds one value. */
const BOX: Record<string, string[] | undefined> = {
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
const SUPERSEDES: Record<string, string[] | undefined> = { ...BOX, gap: ['rowGap', 'columnGap'] };

function put(out: GpuiStyle, key: string, value: GpuiStyle[string]) {
	const longhands = SUPERSEDES[key];
	if (longhands) for (const l of longhands) delete out[l];
	out[key] = value;
}

function merge(target: GpuiStyle, source: GpuiStyle): GpuiStyle {
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

const warned = new Set<string>();

/** `var(--name)` values, set from JS; every rule or inline style that reads one re-resolves on change. */
const css_vars = new Map<string, string>();
let vars_generation = 0;
let vars_read = false;
const warned_vars = new Set<string>();
const pending_vars = new Set<string>();

/** Keys with or without the `--`; false when nothing moved, so an identical palette costs no restyle. */
export function define_css_vars(vars: Record<string, string | number | null>): boolean {
	let changed = false;

	for (const [key, value] of Object.entries(vars)) {
		const name = key.startsWith('--') ? key.slice(2) : key;
		if (value == null) {
			if (css_vars.delete(name)) changed = true;
		} else if (css_vars.get(name) !== String(value)) {
			css_vars.set(name, String(value));
			changed = true;
		}
	}

	if (changed) vars_generation++;
	return changed;
}

/** Deferred to the commit, since Svelte styles the tree before the root's `$effect` can set the palette. */
export function flush_var_warnings() {
	for (const name of pending_vars) {
		if (css_vars.has(name)) continue;
		warned_vars.add(name);
		console.warn(`[gpuix-svelte] \`var(--${name})\` is not defined — set it with set_css_vars() or give it a fallback`);
	}
	pending_vars.clear();
}

/** Whether the last `build_style` read a variable, so the renderer knows what to restyle. */
export const used_css_vars = () => vars_read;

/**
 * Replaces each `var(--name[, fallback])` in a value. Null means a variable was
 * undefined with no fallback, and the declaration has to be dropped.
 */
function substitute_vars(value: string): string | null {
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

		let resolved: string | null | undefined = css_vars.get(name);
		if (resolved === undefined) {
			if (comma === -1) {
				if (!warned_vars.has(name)) pending_vars.add(name);
				return null;
			}
			resolved = substitute_vars(inner.slice(comma + 1).trim());
			if (resolved === null) return null;
		}

		out += value.slice(at, start) + resolved;
		at = end + 1;
	}
}

function camel(key: string) {
	return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** `12px` must become `12`, while `50%`, `auto` and `#1e1e2e` stay strings. */
function coerce(value: string): StyleValue {
	if (PX.test(value) || NUM.test(value)) return parseFloat(value);
	// GPUI's rem size is 16 px and gpuix never changes it.
	if (REM.test(value)) return parseFloat(value) * 16;
	return value;
}

function accepts(key: string, value: StyleValue) {
	if (NEVER.has(key)) return false;
	if (NUMBER_ONLY.has(key)) return typeof value === 'number';
	if (BOOLEAN.has(key)) return typeof value === 'boolean';
	if (DIMENSION.has(key)) {
		return typeof value === 'number' || value === 'auto' || (typeof value === 'string' && PERCENT.test(value));
	}
	// Not a key we have typed: serde drops it if GPUI doesn't know it either, but
	// a length-shaped string on one it does know would throw, so keep those out.
	return typeof value !== 'string' || !NUMERIC_ISH.test(value);
}

/**
 * A value GPUI's deserializer would reject (`1em`, `12px 24px`, `50%` on a
 * pixel-only key) throws out of `applyBatch` and takes the whole frame with it,
 * so drop it and say so once per property.
 */
function assign(out: GpuiStyle, key: string, value: string) {
	let coerced = coerce(value);
	if (key === 'aspectRatio') {
		const ratio = RATIO.exec(value);
		coerced = ratio ? parseFloat(ratio[1]) / (ratio[2] ? parseFloat(ratio[2]) : 1) : value;
	} else if (key === 'scrollbarColor') coerced = FIRST_COLOR.exec(value)?.[0] ?? value;
	else if (BOOLEAN.has(key) && (value === 'true' || value === 'false')) coerced = value === 'true';
	else if (coerced === 'auto' && OVERFLOW.has(key)) coerced = 'scroll';
	else if (typeof coerced === 'string' && DIMENSION.has(key) && INTRINSIC.test(coerced)) coerced = 'auto';

	if (!accepts(key, coerced)) {
		if (!warned.has(key)) {
			warned.add(key);
			console.warn(`[gpuix-svelte] dropped unsupported style value \`${key}: ${value}\``);
		}
		return;
	}

	put(out, key, coerced);
}

function expand(out: GpuiStyle, key: string, value: string) {
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

// Splits the way Svelte's `style:` read-modify-write does, so a `;` inside quotes, `(...)` or a comment stays in its value.
function split_declarations(css: string): string[] {
	const out: string[] = [];
	let quote = '';
	let depth = 0;
	let comment = false;
	let start = 0;

	for (let i = 0; i < css.length; i++) {
		const c = css[i];
		if (comment) {
			if (c === '/' && css[i - 1] === '*') comment = false;
		} else if (c === '\\') {
			i++;
		} else if (quote) {
			if (c === quote) quote = '';
		} else if (c === '/' && css[i + 1] === '*') {
			comment = true;
		} else if (c === '"' || c === "'") {
			quote = c;
		} else if (c === '(') {
			depth++;
		} else if (c === ')') {
			if (depth > 0) depth--;
		} else if (c === ';' && depth === 0) {
			out.push(css.slice(start, i));
			start = i + 1;
		}
	}
	out.push(css.slice(start));
	return out;
}

export function parse_css_text(css: string | null | undefined): GpuiStyle {
	const out: GpuiStyle = {};
	if (!css) return out;

	for (const decl of split_declarations(css)) {
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
function rule_style(rule: StyleRule): GpuiStyle {
	if (rule.css === undefined) return rule.style;

	if (rule.generation !== vars_generation) {
		rule.generation = vars_generation;
		rule.resolved = parse_css_text(rule.css);
	}
	vars_read = true;
	return rule.resolved!;
}

/**
 * `hover`, `active` and `focusVisible` are GPUI's natively-handled pseudo styles —
 * nested objects, which CSS text can't express, so they arrive as their own
 * attributes (or as `:hover`/`:active`/`:focus-visible` rules) and get folded back in here.
 *
 * `attrs` are the raw attribute strings off the shadow node; `rules` the element's
 * matching `<style>` rules, weakest first.
 */
export function build_style(attrs: ShadowAttrs, rules: readonly StyleRule[] = []): GpuiStyle {
	vars_read = false;
	const style: GpuiStyle = {};
	const pseudo: Partial<Record<'hover' | 'active' | 'focusVisible', GpuiStyle>> = {};

	for (const rule of rules) {
		const declared = rule_style(rule);
		if (rule.pseudo) pseudo[rule.pseudo] = merge(pseudo[rule.pseudo] ?? {}, declared);
		else merge(style, declared);
	}

	// Inline wins over a class, as in CSS.
	merge(style, parse_css_text(attrs.style as string | undefined));
	for (const [key, attr] of PSEUDO_ATTRS) {
		const inline = attrs[attr] as string | undefined;
		if (pseudo[key] || inline) style[key] = merge(pseudo[key] ?? {}, parse_css_text(inline));
	}

	return style;
}
