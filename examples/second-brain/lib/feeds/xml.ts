/**
 * A tolerant XML reader, just enough for feed documents. `HTMLRewriter` is next door
 * but it is an HTML parser: it voids `<link/>`, lowercases and reshapes the tree, and
 * Atom's `<link href>` and `<content type="html">` do not survive it.
 */

import { decode_entities } from '../scrape.ts';

export interface XmlNode {
	name: string;
	attrs: Record<string, string>;
	children: XmlNode[];
	text: string;
}

const node = (name: string, attrs: Record<string, string> = {}): XmlNode => ({ name, attrs, children: [], text: '' });

function parse_attrs(source: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source))) attrs[m[1].toLowerCase()] = decode_entities(m[3] ?? m[4] ?? m[5] ?? '');
	return attrs;
}

/** The document element, or null when nothing parsed. Unclosed tags close at the end. */
export function parse_xml(source: string): XmlNode | null {
	const root = node('#document');
	const stack: XmlNode[] = [root];
	let i = 0;
	let text_start = 0;

	const flush = (end: number) => {
		if (end <= text_start) return;
		const raw = source.slice(text_start, end);
		if (raw.trim()) stack[stack.length - 1].text += decode_entities(raw);
	};

	while (i < source.length) {
		const lt = source.indexOf('<', i);
		if (lt === -1) break;
		flush(lt);

		if (source.startsWith('<![CDATA[', lt)) {
			const end = source.indexOf(']]>', lt + 9);
			const stop = end === -1 ? source.length : end;
			stack[stack.length - 1].text += source.slice(lt + 9, stop);
			i = text_start = (end === -1 ? source.length : end + 3);
			continue;
		}
		if (source.startsWith('<!--', lt)) {
			const end = source.indexOf('-->', lt + 4);
			i = text_start = end === -1 ? source.length : end + 3;
			continue;
		}
		// <?xml …?>, <!DOCTYPE …>: nothing a feed needs.
		if (source.startsWith('<?', lt) || source.startsWith('<!', lt)) {
			const end = source.indexOf('>', lt);
			i = text_start = end === -1 ? source.length : end + 1;
			continue;
		}

		const gt = source.indexOf('>', lt);
		if (gt === -1) break;
		const inner = source.slice(lt + 1, gt);
		i = text_start = gt + 1;

		if (inner.startsWith('/')) {
			const name = inner.slice(1).trim().toLowerCase();
			// A stray close tag for something never opened is ignored, not unwound.
			for (let depth = stack.length - 1; depth > 0; depth--) {
				if (stack[depth].name === name) {
					stack.length = depth;
					break;
				}
			}
			continue;
		}

		const self_closing = inner.endsWith('/');
		const body = self_closing ? inner.slice(0, -1) : inner;
		const space = body.search(/\s/);
		const name = (space === -1 ? body : body.slice(0, space)).toLowerCase();
		if (!name) continue;
		const el = node(name, space === -1 ? {} : parse_attrs(body.slice(space)));
		stack[stack.length - 1].children.push(el);
		if (!self_closing) stack.push(el);
	}
	flush(source.length);
	return root.children[0] ?? null;
}

/** First child by name; several names try each in turn, so callers read as a preference list. */
export function child(parent: XmlNode | null | undefined, ...names: string[]): XmlNode | null {
	if (!parent) return null;
	for (const name of names) {
		const found = parent.children.find((c) => c.name === name);
		if (found) return found;
	}
	return null;
}

export const children = (parent: XmlNode | null | undefined, name: string): XmlNode[] => parent?.children.filter((c) => c.name === name) ?? [];

/** All descendants with this name, depth first. */
export function descendants(parent: XmlNode | null | undefined, name: string): XmlNode[] {
	const out: XmlNode[] = [];
	const walk = (n: XmlNode) => {
		for (const c of n.children) {
			if (c.name === name) out.push(c);
			walk(c);
		}
	};
	if (parent) walk(parent);
	return out;
}

export const text_of = (parent: XmlNode | null | undefined, ...names: string[]): string => child(parent, ...names)?.text.trim() ?? '';
