/**
 * The playground's read of what the renderer shipped: a mirror of GPUI's element tree rebuilt from
 * the `applyBatch` operations alone, and the HTML for showing it, the operations and a DOM tree.
 */

import type { Mutation } from '../src/types.ts';

export interface MirrorNode {
	id: number;
	type: string;
	text: string | null;
	style: Record<string, unknown> | null;
	props: Record<string, unknown>;
	listeners: string[];
	children: MirrorNode[];
	parent: MirrorNode | null;
}

export class Mirror {
	nodes = new Map<number, MirrorNode>();
	root: MirrorNode | null = null;

	apply(ops: Mutation[]) {
		for (const op of ops) this.#one(op);
	}

	#detach(node: MirrorNode) {
		const siblings = node.parent?.children;
		if (siblings) siblings.splice(siblings.indexOf(node), 1);
		node.parent = null;
	}

	#destroy(node: MirrorNode) {
		for (const child of node.children) {
			child.parent = null;
			this.#destroy(child);
		}
		this.nodes.delete(node.id);
		if (this.root === node) this.root = null;
	}

	#one(op: Mutation) {
		if (op[0] === 'setKeyboardFocusDim') return;
		if (op[0] === 'createElement') {
			this.nodes.set(op[1], { id: op[1], type: op[2], text: null, style: null, props: {}, listeners: [], children: [], parent: null });
			return;
		}
		const node = this.nodes.get(op[1]);
		if (!node) return;
		switch (op[0]) {
			case 'destroyElement':
				this.#detach(node);
				this.#destroy(node);
				break;
			case 'appendChild':
			case 'insertBefore': {
				const child = this.nodes.get(op[2]);
				if (!child) break;
				this.#detach(child);
				child.parent = node;
				const before = op[0] === 'insertBefore' ? node.children.findIndex((c) => c.id === op[3]) : -1;
				node.children.splice(before === -1 ? node.children.length : before, 0, child);
				break;
			}
			case 'setStyle':
				node.style = op[2] as Record<string, unknown>;
				break;
			case 'setText':
				node.text = op[2];
				break;
			case 'setEventListener':
				node.listeners = node.listeners.filter((type) => type !== op[2]);
				if (op[3]) node.listeners.push(op[2]);
				break;
			case 'setRoot':
				this.root = node;
				break;
			case 'setCustomProp':
				if (op[3] == null) delete node.props[op[2]];
				else node.props[op[2]] = op[3];
				break;
		}
	}
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const span = (kind: string, text: string) => `<span class="pg-t-${kind}">${escape(text)}</span>`;
const literal = (value: unknown) => span(typeof value === 'string' ? 'string' : 'number', JSON.stringify(value) ?? 'undefined');

function node_html(node: MirrorNode): string {
	const head = [span('tag', node.type), span('id', `#${node.id}`)];
	if (node.text !== null) head.push(literal(node.text));
	for (const [name, value] of Object.entries(node.props)) head.push(`${span('attr', name)}=${literal(value)}`);
	if (node.listeners.length) head.push(span('on', `on: ${node.listeners.join(', ')}`));
	const style = Object.entries(node.style ?? {});
	const declarations = style.length ? `<div class="pg-style">${style.map(([key, value]) => `<span>${span('attr', key)}: ${literal(value)}</span>`).join(' ')}</div>` : '';
	const children = node.children.length ? `<div class="pg-children">${node.children.map(node_html).join('')}</div>` : '';
	return `<div class="pg-node"><div class="pg-line">${head.join(' ')}</div>${declarations}${children}</div>`;
}

export const tree_html = (mirror: Mirror) => (mirror.root ? node_html(mirror.root) : '');

export const count_nodes = (mirror: Mirror) => mirror.nodes.size;

const SHOWN_OPS = 400;

export function batch_html(index: number, ops: Mutation[]): string {
	const lines = ops.slice(0, SHOWN_OPS).map(([name, ...args]) => `<div class="pg-line">${span('tag', name)} ${args.map((arg, i) => (i === 0 && typeof arg === 'number' ? span('id', `#${arg}`) : literal(arg))).join(' ')}</div>`);
	if (ops.length > SHOWN_OPS) lines.push(`<div class="pg-line">${span('id', `… ${ops.length - SHOWN_OPS} more`)}</div>`);
	return `<div class="pg-batch"><div class="pg-batch-head">applyBatch ${index} · ${ops.length} ${ops.length === 1 ? 'operation' : 'operations'}</div>${lines.join('')}</div>`;
}

function element_html(el: Element): string {
	if (el.tagName === 'SCRIPT') return '';
	const tag = el.tagName.toLowerCase();
	const attrs = [...el.attributes].map((a) => ` ${span('attr', a.name)}=${span('string', JSON.stringify(a.value))}`).join('');
	const children: string[] = [];
	for (const child of el.childNodes) {
		if (child.nodeType === 1) children.push(element_html(child as Element));
		else if (child.nodeType === 3 && child.textContent?.trim()) children.push(`<div class="pg-line">${literal(child.textContent.trim())}</div>`);
	}
	const inner = children.join('');
	return `<div class="pg-node"><div class="pg-line">&lt;${span('tag', tag)}${attrs}&gt;</div>${inner ? `<div class="pg-children">${inner}</div>` : ''}</div>`;
}

/** The DOM renderer's counterpart of the element tree: what Svelte put in the frame's `<body>`. */
export function dom_html(html: string): string {
	const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
	return [...body.children].map(element_html).join('');
}
