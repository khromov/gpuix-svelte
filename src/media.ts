/**
 * The media queries a GPUI window can answer. Nothing native evaluates CSS there, so the `@media`
 * blocks a `<style>` carries and the queries `media_query()` takes are parsed here, once per distinct
 * text, and matched against the window's size: width, height and orientation are all a window has to say.
 */

export interface Viewport {
	width: number;
	height: number;
}

type Dimension = 'width' | 'height';
type Operator = '<' | '<=' | '>' | '>=' | '=';

/** One parenthesised feature, or `never` for a media type no window is (`print`). */
type Condition =
	| { feature: Dimension; op: Operator; value: number }
	| { feature: 'orientation'; value: 'portrait' | 'landscape' }
	| { feature: 'never' };

/** One comma-separated alternative: every condition has to hold, unless `not` flips the answer. */
interface Query {
	negated: boolean;
	conditions: Condition[];
}

/** A parsed query list; `media_matches` says whether any alternative holds. */
export type MediaQueryList = Query[];

/** What a warning can offer in place of a refused query. */
export const MEDIA_FEATURES = 'width and height (min-, max- or range syntax, in px, rem or em) and orientation';

const LENGTH = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em)?$/i;

/** CSS's media types, so a typo in one is refused rather than quietly never matching, as `print` does. */
const MEDIA_TYPES = new Set(['all', 'screen', 'print', 'speech', 'aural', 'braille', 'embossed', 'handheld', 'projection', 'tty', 'tv']);
const OPERATORS = /\s*(<=|>=|<|>|=)\s*/;
const FLIP: Record<Operator, Operator> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' };

/** A unitless value is only valid at zero; `rem` is GPUI's 16 px and `em` is the initial font size, which is 16 px too. */
function length(text: string): number | null {
	const match = LENGTH.exec(text.trim());
	if (!match) return null;
	const value = parseFloat(match[1]);
	if (match[2] === undefined) return value === 0 ? 0 : null;
	return match[2].toLowerCase() === 'px' ? value : value * 16;
}

function dimension(text: string): Dimension | null {
	const name = text.trim().toLowerCase();
	return name === 'width' || name === 'height' ? name : null;
}

/** `width < 900px`, `600px <= width` or `600px <= width < 900px`, normalised to put the feature first. */
function range(parts: string[]): Condition[] | null {
	if (parts.length === 3) {
		const [a, op, b] = parts as [string, Operator, string];
		const left = dimension(a);
		if (left) {
			const value = length(b);
			return value === null ? null : [{ feature: left, op, value }];
		}
		const right = dimension(b);
		const value = length(a);
		return right && value !== null ? [{ feature: right, op: FLIP[op], value }] : null;
	}
	const [a, op1, b, op2, c] = parts as [string, Operator, string, Operator, string];
	const feature = dimension(b);
	const low = length(a);
	const high = length(c);
	if (!feature || low === null || high === null) return null;
	return [
		{ feature, op: FLIP[op1], value: low },
		{ feature, op: op2, value: high }
	];
}

/** The inside of one pair of parentheses. */
function feature(inner: string): Condition[] | null {
	const parts = inner.split(OPERATORS);
	if (parts.length === 3 || parts.length === 5) return range(parts);
	if (parts.length !== 1) return null;

	const colon = inner.indexOf(':');
	if (colon === -1) {
		const name = inner.trim().toLowerCase();
		if (name === 'width' || name === 'height') return [{ feature: name, op: '>', value: 0 }];
		// A window always has an orientation, so the bare feature is simply true.
		return name === 'orientation' ? [] : null;
	}

	const name = inner.slice(0, colon).trim().toLowerCase();
	const value = inner.slice(colon + 1).trim();
	if (name === 'orientation') {
		const which = value.toLowerCase();
		return which === 'portrait' || which === 'landscape' ? [{ feature: 'orientation', value: which }] : null;
	}
	const match = /^(min-|max-)?(width|height)$/.exec(name);
	const size = length(value);
	if (!match || size === null) return null;
	return [{ feature: match[2] as Dimension, op: match[1] === 'min-' ? '>=' : match[1] === 'max-' ? '<=' : '=', value: size }];
}

/** Top-level pieces of one alternative: each parenthesised group whole, and each bare word. */
function tokens(text: string): string[] | null {
	const out: string[] = [];
	let word = '';
	let depth = 0;
	let group = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (depth > 0) {
			if (c === '(') depth++;
			else if (c === ')' && --depth === 0) out.push(text.slice(group, i + 1));
			continue;
		}
		if (c === '(') {
			if (word) return null;
			depth = 1;
			group = i;
		} else if (c === ')') {
			return null;
		} else if (/\s/.test(c)) {
			if (word) out.push(word);
			word = '';
		} else {
			word += c;
		}
	}
	if (depth > 0) return null;
	if (word) out.push(word);
	return out;
}

/** `[only|not] [type] [and] (feature) [and (feature)]*` */
function query(text: string): Query | null {
	const parts = tokens(text);
	if (parts === null || parts.length === 0) return null;

	let at = 0;
	let negated = false;
	const first = parts[0].toLowerCase();
	if (first === 'not' || first === 'only') {
		negated = first === 'not';
		at = 1;
	}

	const conditions: Condition[] = [];
	let typed = false;
	if (at < parts.length && !parts[at].startsWith('(')) {
		const type = parts[at++].toLowerCase();
		if (!MEDIA_TYPES.has(type)) return null;
		if (type !== 'all' && type !== 'screen') conditions.push({ feature: 'never' });
		typed = true;
		if (at < parts.length) {
			if (parts[at++].toLowerCase() !== 'and' || at === parts.length) return null;
		}
	}
	if (!typed && at === parts.length) return null;

	while (at < parts.length) {
		const part = parts[at++];
		if (!part.startsWith('(')) return null;
		const parsed = feature(part.slice(1, -1).trim());
		if (parsed === null) return null;
		conditions.push(...parsed);
		if (at === parts.length) break;
		if (parts[at++].toLowerCase() !== 'and' || at === parts.length) return null;
	}

	return { negated, conditions };
}

/** Alternatives are separated by top-level commas; a comma inside parentheses belongs to its feature. */
function alternatives(text: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '(') depth++;
		else if (c === ')') depth--;
		else if (c === ',' && depth === 0) {
			out.push(text.slice(start, i));
			start = i + 1;
		}
	}
	out.push(text.slice(start));
	return out;
}

/**
 * Null for anything a window cannot answer (`prefers-color-scheme`, `hover`, a `vw` length, a syntax
 * error), as a browser's `not all`: callers warn and treat the query as never matching.
 */
export function parse_media_query(text: string): MediaQueryList | null {
	const list: MediaQueryList = [];
	for (const alternative of alternatives(text)) {
		const parsed = query(alternative);
		if (parsed === null) return null;
		list.push(parsed);
	}
	return list;
}

function holds(condition: Condition, viewport: Viewport): boolean {
	if (condition.feature === 'never') return false;
	// As CSS has it: a square window is portrait.
	if (condition.feature === 'orientation') return (viewport.height >= viewport.width ? 'portrait' : 'landscape') === condition.value;
	const actual = viewport[condition.feature];
	switch (condition.op) {
		case '<':
			return actual < condition.value;
		case '<=':
			return actual <= condition.value;
		case '>':
			return actual > condition.value;
		case '>=':
			return actual >= condition.value;
		default:
			return actual === condition.value;
	}
}

export function media_matches(list: MediaQueryList, viewport: Viewport): boolean {
	return list.some((q) => q.negated !== q.conditions.every((c) => holds(c, viewport)));
}

const parsed = new Map<string, MediaQueryList | null>();

/** Whether every `@media` prelude on a rule holds; each distinct text is parsed once per process. */
export function media_active(preludes: readonly string[], viewport: Viewport): boolean {
	for (const prelude of preludes) {
		let list = parsed.get(prelude);
		if (list === undefined) {
			list = parse_media_query(prelude);
			parsed.set(prelude, list);
		}
		if (list === null || !media_matches(list, viewport)) return false;
	}
	return true;
}
