/**
 * Unknown keys need no allowlist — serde drops them when deserializing
 * `StyleDesc` on the Rust side. Values are the opposite: a key GPUI *does*
 * know, handed a string it can't parse, throws out of `applyBatch`.
 */

import type { StyleDesc } from '@gpuix/native/host';
import type { GpuiStyle, ShadowAttrs, ShadowNode, StyleRule, StyleValue } from './types.ts';

/** A set that has to name every one of `K`, so a key a native bump adds, or a typo, fails typecheck. */
export const set_of =
	<K extends string>() =>
	<const T extends readonly K[]>(keys: T & ([Exclude<K, T[number]>] extends [never] ? unknown : { missing: Exclude<K, T[number]> })): ReadonlySet<string> =>
		new Set<string>(keys);

type Value<K extends keyof StyleDesc> = Exclude<StyleDesc[K], undefined>;
/** `StyleDesc` keys every value of which is a `V`. */
type Only<V> = { [K in keyof StyleDesc]-?: [Value<K>] extends [V] ? K : never }[keyof StyleDesc];
/** `StyleDesc` keys some value of which is a `V`. */
type Takes<V> = { [K in keyof StyleDesc]-?: [Extract<Value<K>, V>] extends [never] ? never : K }[keyof StyleDesc];

const PX = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)px$/i;
const NUM = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const PERCENT = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$/;
const REM = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)rem$/i;
const NUMERIC_ISH = /^[-+.\d]/;

/** No declaration but a `:root` variable has a cascade to outrank, and left on a value it fails every check below. */
export const IMPORTANT = /\s*!\s*important$/i;

/** No GPUI sizing mode matches these, and `auto` is the nearest a `DimensionValue` can say. */
const INTRINSIC = /^(?:max-content|min-content|fit-content)(?:\(.*\))?$/;

/** Native matches only `scroll` and `hidden`, so `auto` would be accepted and then ignored. */
const OVERFLOW = new Set(['overflow', 'overflowX', 'overflowY']);

/** GPUI reads these as a bare `f64`, so any string at all fails to deserialize. */
const NUMBER_ONLY = set_of<Only<number>>()([
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

/** Rust `String`s (`background` an enum of one or a gradient), so `color: 123456` must not coerce into a number. */
const TEXT_ONLY = set_of<Exclude<Takes<string>, Takes<number>>>()([
	'display',
	'visibility',
	'flexDirection',
	'flexWrap',
	'alignItems',
	'alignSelf',
	'alignContent',
	'justifyContent',
	'gridColumnMin',
	'gridRowMin',
	'position',
	'background',
	'backgroundColor',
	'color',
	'borderColor',
	'borderStyle',
	'outlineColor',
	'fontFamily',
	'textAlign',
	'whiteSpace',
	'textOverflow',
	'textDecoration',
	'overflow',
	'overflowX',
	'overflowY',
	'scrollbarColor',
	'cursor',
	'pointerEvents',
	'userSelect',
	'selectionColor'
]);

/** Rust `bool`s: the string CSS text hands over would fail to deserialize. */
const BOOLEAN = set_of<Only<boolean>>()(['keyboardFocusDim']);

/** A unitless `aspect-ratio`, `1.5` or `16 / 9`; a length is no ratio, so it must not coerce like one. */
const RATIO = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*\/\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+)))?$/;

/** GPUI paints a thumb and no track, so only the first colour of `scrollbar-color: thumb track` applies. */
const FIRST_COLOR = /^(?:[^\s(]+\([^)]*\)|\S+)/;

/** The only keys GPUI reads as a `DimensionValue`, so the only ones `%` and `auto` survive; `fontWeight` is typed the same, but for weight names. */
const DIMENSION = set_of<Exclude<Extract<Takes<string>, Takes<number>>, 'fontWeight'>>()(['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight']);

const PSEUDO_ATTRS = [
	['hover', 'hover'],
	['active', 'active'],
	['focusVisible', 'focus-visible']
] as const;

/** A struct on the Rust side — CSS text can never produce one. */
const NEVER = set_of<Exclude<keyof StyleDesc, Takes<string | number | boolean>>>()(['boxShadow', 'hover', 'active', 'focusVisible']);

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

/** The docs' playground recompiles one source on every edit and has to hear a dropped value each time. */
export const forget_style_warnings = () => warned.clear();

/**
 * `var(--name)` values. The nearest declaration on the element or an ancestor wins, as a custom property inherits in a
 * browser. Past those come the three layers its cascade ranks on `<html>`: `:root` rules, over them what `set_css_vars()`
 * set (the DOM build writes those on `<html>`'s inline style), and over both the `:root` declarations marked `!important`.
 */
let sheet_vars: ReadonlyMap<string, string> = new Map();
const css_vars = new Map<string, string>();
let important_vars: ReadonlyMap<string, string> = new Map();
let vars_generation = 0;
let vars_read = false;
const warned_vars = new Set<string>();
const pending_vars: Array<[string, Scope | null]> = [];

/** As much of a shadow node as a lookup climbs. */
export type Scope = Pick<ShadowNode, 'vars'> & { parent: Scope | null };

/** A variable's value as written and the element that declares it, null for the `:root` layers. */
function declared(name: string, from: Scope | null): [string | undefined, Scope | null] {
	for (let at = from; at; at = at.parent) {
		const value = at.vars?.get(name);
		if (value !== undefined) return [value, at];
	}
	return [important_vars.get(name) ?? css_vars.get(name) ?? sheet_vars.get(name), null];
}

/** Records what an element's rules and inline style declare, the inline style last as the cascade has it; true when that changed. */
export function declare_vars(el: Pick<ShadowNode, 'attrs' | 'vars'>, rules: readonly StyleRule[]): boolean {
	let vars: Map<string, string> | null = null;
	for (const rule of rules) {
		for (const name in rule.vars) (vars ??= new Map()).set(name, rule.vars[name]);
	}
	const inline = el.attrs.style;
	if (typeof inline === 'string' && inline.includes('--')) {
		for (const [property, value] of split_declarations(inline)) {
			if (property.startsWith('--')) (vars ??= new Map()).set(property.slice(2), value);
		}
	}
	const before = el.vars;
	el.vars = vars;
	return vars === null || before === null ? vars !== before : !same_vars(vars, before);
}

/** Keys with or without the `--`; false when nothing moved, so an identical palette costs no restyle. */
export function define_css_vars(vars: Record<string, string | number | null>): boolean {
	let changed = false;

	for (const [key, value] of Object.entries(vars)) {
		const name = key.startsWith('--') ? key.slice(2) : key;
		// The DOM build's `style.setProperty` removes the property for an empty string too.
		if (value == null || value === '') {
			if (css_vars.delete(name)) changed = true;
		} else if (css_vars.get(name) !== String(value)) {
			css_vars.set(name, String(value));
			changed = true;
		}
	}

	if (changed) vars_generation++;
	return changed;
}

const same_vars = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>) => a.size === b.size && [...a].every(([name, value]) => b.get(name) === value);

export function define_sheet_vars(vars: ReadonlyMap<string, string>, important: ReadonlyMap<string, string>): boolean {
	if (same_vars(vars, sheet_vars) && same_vars(important, important_vars)) return false;
	sheet_vars = vars;
	important_vars = important;
	vars_generation++;
	return true;
}

/** Deferred to the commit, since Svelte styles the tree before the root's `$effect` can set the palette. */
export function flush_var_warnings() {
	for (const [name, from] of pending_vars) {
		if (warned_vars.has(name) || declared(name, from)[0] !== undefined) continue;
		warned_vars.add(name);
		console.warn(
			`[gpuix-svelte] \`var(--${name})\` is not defined — declare it in a \`:root\` rule or on an element around the one that reads it, set it with set_css_vars() or give it a fallback`
		);
	}
	pending_vars.length = 0;
}

/** Whether the last `build_style` read a variable, so the renderer knows what to restyle. */
export const used_css_vars = () => vars_read;

type Resolving = [name: string, at: Scope | null];
const resolving: Resolving[] = [];
const cyclic = new Set<Resolving>();

/**
 * As CSS has it, a variable that reads an unset one with no fallback is unset itself, and so is every member of a cycle.
 * The `var()`s in its value read from the element that declares it, not from the one reading it.
 */
function resolve_var(name: string, from: Scope | null): string | undefined {
	const [value, at] = declared(name, from);
	if (value === undefined || !value.includes('var(')) return value;

	const index = resolving.findIndex((entry) => entry[0] === name && entry[1] === at);
	if (index !== -1) {
		for (const member of resolving.slice(index)) cyclic.add(member);
		return undefined;
	}

	const entry: Resolving = [name, at];
	resolving.push(entry);
	const resolved = substitute_vars(value, at);
	resolving.pop();
	return cyclic.delete(entry) || resolved === null ? undefined : resolved;
}

/**
 * Replaces each `var(--name[, fallback])` in a value, read from `from` upwards. Null means a variable
 * was undefined with no fallback, and the declaration has to be dropped.
 */
function substitute_vars(value: string, from: Scope | null): string | null {
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

		let resolved: string | null | undefined = resolve_var(name, from);
		if (resolved === undefined) {
			if (comma === -1) {
				if (!warned_vars.has(name)) pending_vars.push([name, from]);
				return null;
			}
			resolved = substitute_vars(inner.slice(comma + 1).trim(), from);
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
	if (TEXT_ONLY.has(key) && typeof value === 'number') return false;
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
function split_declarations(css: string): Array<[property: string, value: string]> {
	const out: Array<[string, string]> = [];
	let quote = '';
	let depth = 0;
	let comment = false;
	let start = 0;

	const take = (end: number) => {
		const decl = css.slice(start, end);
		const colon = decl.indexOf(':');
		const property = decl.slice(0, colon).trim();
		const value = decl.slice(colon + 1).trim().replace(IMPORTANT, '');
		if (colon !== -1 && property !== '' && value !== '') out.push([property, value]);
	};

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
			take(i);
			start = i + 1;
		}
	}
	take(css.length);
	return out;
}

/** `from` is the element whose style this is, for the variables declared on it and around it. */
export function parse_css_text(css: string | null | undefined, from: Scope | null = null): GpuiStyle {
	const out: GpuiStyle = {};
	if (!css) return out;

	for (const [property, raw] of split_declarations(css)) {
		// A custom property styles nothing itself: `declare_vars` has it.
		if (property.startsWith('--')) continue;

		const value = raw.includes('var(') ? substitute_vars(raw, from) : raw;
		if (value === null) continue;

		const key = camel(property);
		if (!expand(out, key, value)) assign(out, key, value);
	}

	return out;
}

/**
 * A rule that reads a variable ships as CSS text and is parsed here: once per change of the `:root` layers where
 * no element from `el` up declares one, and once per element where one does (`scoped`), which leaves nothing to
 * invalidate when that element's rules, inline style or place in the tree change.
 */
function rule_style(rule: StyleRule, el: Scope | null, scoped: boolean): GpuiStyle {
	if (rule.css === undefined) return rule.style;

	vars_read = true;
	if (!scoped && rule.generation === vars_generation) return rule.resolved!;
	const style = parse_css_text(rule.css, el);
	if (!scoped) {
		rule.generation = vars_generation;
		rule.resolved = style;
	}
	return style;
}

/**
 * `hover`, `active` and `focusVisible` are GPUI's natively-handled pseudo styles —
 * nested objects, which CSS text can't express, so they arrive as their own
 * attributes (or as `:hover`/`:active`/`:focus-visible` rules) and get folded back in here.
 *
 * `attrs` are the raw attribute strings off the shadow node; `rules` the element's
 * matching `<style>` rules, weakest first; `el` the node itself, once `declare_vars` has seen it.
 */
export function build_style(attrs: ShadowAttrs, rules: readonly StyleRule[] = [], el: Scope | null = null): GpuiStyle {
	vars_read = false;
	const style: GpuiStyle = {};
	const pseudo: Partial<Record<'hover' | 'active' | 'focusVisible', GpuiStyle>> = {};

	let scoped = false;
	for (let at = el; at !== null && !scoped; at = at.parent) scoped = at.vars !== null;

	for (const rule of rules) {
		const declared = rule_style(rule, el, scoped);
		if (rule.pseudo) pseudo[rule.pseudo] = merge(pseudo[rule.pseudo] ?? {}, declared);
		else merge(style, declared);
	}

	// Inline wins over a class, as in CSS.
	merge(style, parse_css_text(attrs.style as string | undefined, el));
	for (const [key, attr] of PSEUDO_ATTRS) {
		const inline = attrs[attr] as string | undefined;
		if (pseudo[key] || inline) style[key] = merge(pseudo[key] ?? {}, parse_css_text(inline, el));
	}

	return style;
}
