/**
 * A JS shadow tree projected onto GPUI: it holds the fragments and comments GPUI has
 * no representation for, and allocates native ids lazily, because Svelte renders
 * offscreen constantly and eager creation would leak a Rust node per abandoned render.
 */

import { createRenderer } from 'svelte/renderer';
import { build_style } from './style.js';
import { to_gpui_event } from './events.js';

/** Anything not listed here degrades to `div`. */
const GPUI_TAGS = new Set([
	'div',
	'text',
	'img',
	'svg',
	'canvas',
	'input',
	'textarea',
	'anchored',
	'code',
	'diff',
	'markdown',
	'virtual-list'
]);

/** GPUI only forwards a handful of props to `div`/`text`. */
const BUILT_IN_TAGS = new Set(['div', 'text']);
const UNIVERSAL_PROPS = new Set(['autoFocus', 'tabIndex', 'testId', 'motion']);

/** Attributes that feed `setStyle` rather than a custom prop. */
const STYLE_ATTRS = new Set(['style', 'hover', 'active']);

/** Svelte lowercases some attributes; GPUI wants them camelCased. */
const PROP_ALIASES = new Map([
	['autofocus', 'autoFocus'],
	['tabindex', 'tabIndex'],
	['testid', 'testId']
]);

/** @type {any} the live GpuixRenderer (or TestGpuixRenderer) */
let native = null;

/** Queued mutation tuples, flushed as one `applyBatch` call. */
let queue = [];

/** nativeId -> shadow node, for event dispatch and destroy bookkeeping. */
let by_id = new Map();

let pending_destroy = new Set();

/**
 * Monotonic across remounts on purpose: `render_hot` builds a fresh tree while the old
 * GPUI nodes may still exist, and reused ids would collide with them.
 */
let next_id = 0;
let dirty = false;
let auto_commit = false;
let commit_scheduled = false;

const warned_tags = new Set();

function emit(op) {
	queue.push(op);
	dirty = true;

	if (!auto_commit || commit_scheduled) return;
	commit_scheduled = true;
	// A microtask, so Svelte's effects finish emitting and the batch ships whole.
	queueMicrotask(() => {
		commit_scheduled = false;
		if (dirty) commit();
	});
}

function node(kind, name, data) {
	return {
		kind,
		name,
		data,
		attrs: /** @type {Record<string, any>} */ ({}),
		listeners: /** @type {Map<string, any[]>} */ (new Map()),
		nativeId: /** @type {number | null} */ (null),
		/** reachable from the designated GPUI root */
		live: false,
		/** currently appended to its native parent */
		attached: false,
		parent: null,
		first: null,
		last: null,
		prev: null,
		next: null
	};
}

function link(parent, child, anchor) {
	child.parent = parent;

	if (anchor == null) {
		child.prev = parent.last;
		child.next = null;
		if (parent.last) parent.last.next = child;
		else parent.first = child;
		parent.last = child;
	} else {
		child.prev = anchor.prev;
		child.next = anchor;
		if (anchor.prev) anchor.prev.next = child;
		else parent.first = child;
		anchor.prev = child;
	}
}

function unlink(child) {
	const parent = child.parent;
	if (!parent) return;

	if (child.prev) child.prev.next = child.next;
	else parent.first = child.next;

	if (child.next) child.next.prev = child.prev;
	else parent.last = child.prev;

	child.parent = null;
	child.prev = null;
	child.next = null;
}

const is_blank = (s) => s == null || s.trim() === '';

/**
 * Fragments are never children (every insert splats them), so a fragment parent
 * means "not attached to anything native yet".
 */
const native_parent_of = (parent) => (parent && parent.kind === 'element' ? parent : null);

/** Siblings only: a native node can never hide beneath a virtual one. */
function first_native_after(cursor) {
	for (let n = cursor; n !== null; n = n.next) {
		if (n.nativeId !== null && n.attached) return n;
	}
	return null;
}

function map_tag(name) {
	if (GPUI_TAGS.has(name)) return name;
	if (!warned_tags.has(name)) {
		warned_tags.add(name);
		console.warn(`[gpuix-svelte] <${name}> has no GPUI equivalent — rendering it as <div>.`);
	}
	return 'div';
}

function apply_style(el) {
	if (el.nativeId === null) return;
	emit(['setStyle', el.nativeId, build_style(el.attrs)]);
}

const prop_name = (key) => PROP_ALIASES.get(key.toLowerCase()) ?? key;

function normalize_prop(name, value) {
	if (name === 'autoFocus') return value !== false && value !== 'false';
	if (name === 'tabIndex') return Number(value);
	return value;
}

function apply_prop(el, key, value) {
	const name = prop_name(key);
	if (BUILT_IN_TAGS.has(map_tag(el.name)) && !UNIVERSAL_PROPS.has(name)) return;
	if (el.nativeId === null) return;
	emit(['setCustomProp', el.nativeId, name, value === null ? null : normalize_prop(name, value)]);
}

/** Idempotent. */
function materialize(n) {
	if (n.kind === 'comment' || n.kind === 'fragment') return;

	if (n.nativeId === null) {
		if (n.kind === 'text') {
			// Blank text is an anchor, not content — leave it virtual so it
			// doesn't occupy a slot in GPUI's flex layout.
			if (is_blank(n.data)) return;

			n.nativeId = ++next_id;
			by_id.set(n.nativeId, n);
			emit(['createElement', n.nativeId, 'text']);
			emit(['setText', n.nativeId, n.data]);
			return;
		}

		n.nativeId = ++next_id;
		by_id.set(n.nativeId, n);
		emit(['createElement', n.nativeId, map_tag(n.name)]);

		if (Object.keys(n.attrs).length > 0) {
			apply_style(n);
			for (const key of Object.keys(n.attrs)) {
				if (STYLE_ATTRS.has(key) || key === 'class') continue;
				apply_prop(n, key, n.attrs[key]);
			}
		}

		for (const type of n.listeners.keys()) {
			emit(['setEventListener', n.nativeId, type, true]);
		}
	}

	for (let c = n.first; c; c = c.next) {
		materialize(c);
		if (c.nativeId !== null && !c.attached) attach(c);
	}
}

function attach(n) {
	if (n.nativeId === null) return;

	const np = native_parent_of(n.parent);
	if (np === null || np.nativeId === null) return;

	const before = first_native_after(n.next);
	emit(
		before
			? ['insertBefore', np.nativeId, n.nativeId, before.nativeId]
			: ['appendChild', np.nativeId, n.nativeId]
	);
	n.attached = true;
}

function set_live(n, value) {
	if (n.live === value) return;
	n.live = value;
	for (let c = n.first; c; c = c.next) set_live(c, value);
}

const renderer = createRenderer({
	createFragment: () => node('fragment', '', ''),
	createElement: (name) => node('element', name, ''),
	createTextNode: (data) => node('text', '', data),
	createComment: (data) => node('comment', '', data),

	nodeType: (n) => n.kind,

	getNodeValue(n) {
		// Load-bearing for comments too: `first_child` skips a leading comment
		// only when this returns '', and `set_text` seeds its diff cache from it.
		if (n.kind === 'text' || n.kind === 'comment') return n.data;
		return null;
	},

	getAttribute(el, name) {
		const value = el.attrs[name];
		if (value == null) return null;
		return typeof value === 'string' ? value : String(value);
	},

	setAttribute(el, key, value) {
		if (value == null) {
			renderer.removeAttribute(el, key);
			return;
		}

		// Keep the raw string: Svelte does read-modify-write on the `style`
		// attribute for `style:` directives, so it must round-trip byte for byte.
		el.attrs[key] = value;

		if (STYLE_ATTRS.has(key)) apply_style(el);
		else if (key !== 'class') apply_prop(el, key, value);
	},

	removeAttribute(el, name) {
		if (!(name in el.attrs)) return;
		delete el.attrs[name];

		if (STYLE_ATTRS.has(name)) apply_style(el);
		else if (name !== 'class') apply_prop(el, name, null);
	},

	hasAttribute: (el, name) => name in el.attrs,

	setText(n, text) {
		if (n.kind === 'comment') {
			n.data = text;
			return;
		}

		n.data = text;

		if (n.nativeId !== null) {
			emit(['setText', n.nativeId, text]);
			return;
		}

		if (n.kind !== 'text' || is_blank(text) || !n.live) return;
		materialize(n);
		attach(n);
	},

	getFirstChild: (n) => n.first,
	getLastChild: (n) => n.last,
	getNextSibling: (n) => n.next,
	getParent: (n) => n.parent,

	insert(parent, n, anchor) {
		// Fragments are never nested, so this recurses at most one level.
		if (n.kind === 'fragment') {
			for (let c = n.first, next; c; c = next) {
				next = c.next;
				renderer.insert(parent, c, anchor);
			}
			return;
		}

		if (n.parent) unlink(n); // insert doubles as move
		link(parent, n, anchor);

		set_live(n, parent.live === true);

		if (n.live) {
			pending_destroy.delete(n); // resurrected before the next commit
			materialize(n);
			attach(n); // GPUI reparents on insertBefore/appendChild
		} else if (n.nativeId !== null && n.attached) {
			// Native has no detach op (removeChild is gone in 0.6), so commit()
			// destroys the subtree; it re-materializes if it becomes live again.
			pending_destroy.add(n);
		}
	},

	remove(n) {
		if (n.parent === null) return;

		unlink(n);
		// Never destroy here: Svelte removes and re-inserts the same node in
		// consecutive statements (see `each.js`'s controlled-anchor reset).
		set_live(n, false);
		pending_destroy.add(n);
	},

	addEventListener(target, type, handler) {
		const event = to_gpui_event(type);
		if (event === null) return;

		let handlers = target.listeners.get(event);
		if (!handlers) {
			handlers = [];
			target.listeners.set(event, handlers);
		}
		handlers.push(handler);

		// GPUI stores a bare "has listener" flag, so only the 0->1 edge matters.
		if (handlers.length === 1 && target.nativeId !== null) {
			emit(['setEventListener', target.nativeId, event, true]);
		}
	},

	removeEventListener(target, type, handler) {
		const event = to_gpui_event(type);
		if (event === null) return;

		const handlers = target.listeners.get(event);
		if (!handlers) return;

		const index = handlers.indexOf(handler);
		if (index !== -1) handlers.splice(index, 1);

		if (handlers.length === 0) {
			target.listeners.delete(event);
			if (target.nativeId !== null) {
				emit(['setEventListener', target.nativeId, event, false]);
			}
		}
	}
});

export default renderer;

// Host wiring — used by `render.js`, not by compiled components.

export function set_native(instance) {
	native = instance;
	queue = [];
	by_id = new Map();
	pending_destroy = new Set();
	dirty = false;
}

export function create_root(style = { display: 'flex', width: '100%', height: '100%' }) {
	const root = node('element', 'div', '');
	root.nativeId = ++next_id;
	root.live = true;
	root.attached = true;
	by_id.set(root.nativeId, root);

	emit(['createElement', root.nativeId, 'div']);
	emit(['setStyle', root.nativeId, style]);
	emit(['setRoot', root.nativeId]);

	return root;
}

export const is_dirty = () => dirty;

/** Where no frame loop polls `is_dirty()`, mutations have to drain themselves. */
export function set_auto_commit(enabled) {
	auto_commit = enabled;
}

/** Ships the whole frame's mutations as one call across the FFI boundary. */
export function commit() {
	for (const n of pending_destroy) {
		// Anything that left the live tree and was not rescued into it goes away —
		// including nodes parked in offscreen fragments, which native would
		// otherwise keep painting in their old spot.
		if (!n.live && n.nativeId !== null) emit(['destroyElement', n.nativeId]);
	}
	pending_destroy.clear();

	if (queue.length === 0) {
		dirty = false;
		return;
	}

	const json = JSON.stringify(queue);
	queue = [];
	dirty = false;

	// Rust destroys whole subtrees, so the returned ids are how we learn which
	// descendants to purge from the id map and the listener registry.
	const destroyed = native.applyBatch(json);
	for (const id of destroyed) {
		const n = by_id.get(id);
		if (n) {
			n.nativeId = null;
			n.attached = false;
			n.listeners.clear();
		}
		by_id.delete(id);
	}

	// 0.6 removed commitMutations — applyBatch invalidates on its own there.
	native.commitMutations?.();
}

export function dispatch(payload) {
	const target = by_id.get(payload.elementId);
	if (!target) return;

	const handlers = target.listeners.get(payload.eventType);
	if (!handlers || handlers.length === 0) return;

	const event = {
		...payload,
		type: payload.eventType,
		target,
		currentTarget: target,
		defaultPrevented: false,
		cancelBubble: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {
			this.cancelBubble = true;
		},
		stopImmediatePropagation() {
			this.cancelBubble = true;
		},
		composedPath: () => []
	};

	for (const handler of handlers.slice()) handler.call(target, event);
}
