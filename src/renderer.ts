/**
 * A JS shadow tree projected onto GPUI: it holds the fragments and comments GPUI has
 * no representation for, and allocates native ids lazily, because Svelte renders
 * offscreen constantly and eager creation would leak a Rust node per abandoned render.
 */

import { createRenderer } from 'svelte/renderer';
import { build_style, define_css_vars, used_css_vars } from './style.js';
import { to_gpui_event, WINDOW_KEY_EVENTS } from './events.js';

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
const UNIVERSAL_PROPS = new Set(['autoFocus', 'tabIndex', 'testId', 'motion', 'highlight']);

/** Attributes that feed `setStyle` rather than a custom prop — `class` via the component's `<style>` rules. */
const STYLE_ATTRS = new Set(['style', 'hover', 'active', 'class']);

/** Attributes the renderer consumes itself; never forwarded as props. */
const RENDERER_ATTRS = new Set(['hitbox', 'portal']);

// Focusability decides `hitbox="self"` shielding, so a change must restyle.
const FOCUS_ATTRS = new Set(['tabIndex', 'tabindex', 'autoFocus', 'autofocus']);

/** Native types that take input of their own, so `hitbox="self"` leaves their hitbox alone. */
const INTERACTIVE_TAGS = new Set(['input', 'textarea', 'code', 'diff', 'markdown', 'virtual-list', 'anchored', 'canvas']);

/** Always listen for focus/blur on these, so window key handlers can tell typing from a shortcut. */
const TEXT_INPUTS = new Set(['input', 'textarea']);

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

/** `<svg>`s painting their nearest ancestor's `color`, restyled when that ancestor is. */
let inheriting_svgs = new Set();

/** The text field with focus, if any — what `editing` on a window key event reports. */
let focused_input = null;

/** The node `create_root` made, where `portal` elements go natively. */
let root_node = null;

/**
 * `portal` nodes stay where Svelte put them in the shadow tree but hang off the root
 * natively, so paint order (document order in GPUI) puts them on top; an ancestor's
 * destroy never reaches them, so `commit` retires them itself.
 */
let portals = new Set();

/** Portals met while materialising a subtree, appended once that subtree is attached. */
let pending_portals = [];

const is_portal = (n) => 'portal' in n.attrs;

/**
 * Monotonic across remounts on purpose: `render_hot` builds a fresh tree while the old
 * GPUI nodes may still exist, and reused ids would collide with them.
 */
let next_id = 0;
let dirty = false;
let auto_commit = false;
let commit_scheduled = false;

const warned_tags = new Set();

/**
 * Window-level key events arrive on whatever id `setWindowKeyEvents` was given, so
 * one pseudo node, never materialised, holds their listeners under that id.
 */
const window_node = node('window', 'window', '');

/** scope class -> that component's `<style>` rules, weakest first (see compile.js). */
const stylesheets = new Map();
const NO_RULES = [];

/** Removals queue no op of their own, so they have to raise the flag themselves. */
function mark_dirty() {
	dirty = true;

	if (!auto_commit || commit_scheduled) return;
	commit_scheduled = true;
	// A microtask, so Svelte's effects finish emitting and the batch ships whole.
	queueMicrotask(() => {
		commit_scheduled = false;
		try {
			if (dirty) commit();
		} catch (error) {
			// Nothing else wraps this one, and an escaped throw here is an
			// uncaughtException that takes the whole process down.
			console.error('[gpuix-svelte] commit failed:', error);
		}
	});
}

function emit(op) {
	queue.push(op);
	mark_dirty();
}

function node(kind, name, data) {
	return {
		kind,
		name,
		data,
		attrs: /** @type {Record<string, any>} */ ({}),
		listeners: /** @type {Map<string, any[]>} */ (new Map()),
		nativeId: /** @type {number | null} */ (null),
		/** its style read a `var()`, so `set_css_vars` has to restyle it */
		uses_vars: false,
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

/** Siblings only: a native node can never hide beneath a virtual one. A portal is not in this parent's native list. */
function first_native_after(cursor) {
	for (let n = cursor; n !== null; n = n.next) {
		if (n.nativeId !== null && n.attached && !is_portal(n)) return n;
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

/**
 * The scope class the compiler stamps on every matched element doubles as the
 * sheet's key, so an element without one never pays for a lookup.
 */
function class_rules(el) {
	const value = el.attrs.class;
	if (typeof value !== 'string' || value === '') return NO_RULES;

	const names = value.split(/\s+/);
	let matched = null;
	for (const name of names) {
		const sheet = stylesheets.get(name);
		if (!sheet) continue;
		for (const rule of sheet) {
			if (rule.tag !== null && rule.tag !== el.name) continue;
			if (rule.classes.every((c) => names.includes(c))) (matched ??= []).push(rule);
		}
	}
	return matched ?? NO_RULES;
}

function hitbox_root(el) {
	for (let p = el.parent; p; p = p.parent) {
		if (p.kind === 'element' && p.attrs.hitbox === 'self') return p;
	}
	return null;
}

function descends(n, ancestor) {
	for (let p = n.parent; p; p = p.parent) if (p === ancestor) return true;
	return false;
}

/**
 * Under a `hitbox="self"` ancestor, anything that neither listens, takes input nor
 * scrolls must not occlude it — a painted badge or thumbnail would swallow the click.
 */
function shielded(el, style) {
	if (el.listeners.size > 0 || INTERACTIVE_TAGS.has(el.name)) return false;
	if ('tabIndex' in el.attrs || 'tabindex' in el.attrs || 'autoFocus' in el.attrs || 'autofocus' in el.attrs) return false;
	if (style.overflow === 'scroll' || style.overflowY === 'scroll' || style.overflowX === 'scroll') return false;
	return hitbox_root(el) !== null;
}

/** `<svg>` takes no `color` from its parent natively, so the nearest ancestor's is copied in. */
function inherit_color(el, style) {
	for (let p = el.parent; p; p = p.parent) {
		if (p.kind !== 'element') continue;
		const color = build_style(p.attrs, class_rules(p)).color;
		if (used_css_vars()) el.uses_vars = true;
		if (color !== undefined) {
			style.color = color;
			return;
		}
	}
}

function apply_style(el) {
	if (el.nativeId === null) return;
	const style = build_style(el.attrs, class_rules(el));
	el.uses_vars = used_css_vars();

	if (style.pointerEvents === undefined && shielded(el, style)) style.pointerEvents = 'none';

	if (el.name === 'svg') {
		if (style.color === undefined) {
			inherit_color(el, style);
			inheriting_svgs.add(el);
		} else {
			inheriting_svgs.delete(el);
		}
	} else if (inheriting_svgs.size > 0) {
		for (const svg of inheriting_svgs) {
			if (svg.nativeId !== null && descends(svg, el)) apply_style(svg);
		}
	}

	emit(['setStyle', el.nativeId, style]);
}

function restyle_subtree(el) {
	for (let c = el.first; c; c = c.next) {
		if (c.kind === 'element' && c.nativeId !== null) apply_style(c);
		restyle_subtree(c);
	}
}

/** `portal` toggled on a live node: GPUI reparents on the next appendChild/insertBefore. */
function reparent(el) {
	if (el.nativeId === null || !el.attached || !el.live) return;
	attach(el);
	attach_portals();
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

		if (Object.keys(n.attrs).length > 0 || hitbox_root(n) !== null) apply_style(n);
		for (const key of Object.keys(n.attrs)) {
			if (STYLE_ATTRS.has(key) || RENDERER_ATTRS.has(key)) continue;
			apply_prop(n, key, n.attrs[key]);
		}

		for (const type of n.listeners.keys()) {
			emit(['setEventListener', n.nativeId, type, true]);
		}
		if (TEXT_INPUTS.has(n.name)) {
			for (const type of ['focus', 'blur']) {
				if (!n.listeners.has(type)) emit(['setEventListener', n.nativeId, type, true]);
			}
		}
	}

	for (let c = n.first; c; c = c.next) {
		materialize(c);
		if (c.nativeId !== null && !c.attached) attach(c);
	}
}

function attach(n) {
	if (n.nativeId === null) return;

	if (is_portal(n)) {
		pending_portals.push(n);
		return;
	}

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

/**
 * After the subtree they sit in is attached — an app root materialising would
 * otherwise append its portals before itself. Always appended, so later ones paint on top.
 */
function attach_portals() {
	for (const n of pending_portals) {
		if (n.nativeId === null || root_node === null || root_node.nativeId === null) continue;
		emit(['appendChild', root_node.nativeId, n.nativeId]);
		n.attached = true;
		portals.add(n);
	}
	pending_portals = [];
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
		else if (key === 'portal') reparent(el);
		else if (RENDERER_ATTRS.has(key)) restyle_subtree(el);
		else {
			apply_prop(el, key, value);
			if (FOCUS_ATTRS.has(key) && hitbox_root(el) !== null) apply_style(el);
		}
	},

	removeAttribute(el, name) {
		if (!(name in el.attrs)) return;
		delete el.attrs[name];

		if (STYLE_ATTRS.has(name)) apply_style(el);
		else if (name === 'portal') {
			portals.delete(el);
			reparent(el);
		} else if (RENDERER_ATTRS.has(name)) restyle_subtree(el);
		else {
			apply_prop(el, name, null);
			if (FOCUS_ATTRS.has(name) && hitbox_root(el) !== null) apply_style(el);
		}
	},

	hasAttribute: (el, name) => name in el.attrs,

	setText(n, text) {
		if (n.kind === 'comment') {
			n.data = text;
			return;
		}

		n.data = text;

		if (n.nativeId !== null) {
			// Going blank has to give the id back, or the node keeps its slot in
			// GPUI's flex layout — the same reason blank text never gets one.
			if (n.kind === 'text' && is_blank(text)) {
				emit(['destroyElement', n.nativeId]);
				by_id.delete(n.nativeId);
				n.nativeId = null;
				n.attached = false;
				return;
			}

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
			attach_portals();
		} else if (n.nativeId !== null && n.attached) {
			// Native has no detach op (removeChild is gone in 0.6), so commit()
			// destroys the subtree; it re-materializes if it becomes live again.
			pending_destroy.add(n);
			mark_dirty();
		}
	},

	remove(n) {
		if (n.parent === null) return;

		unlink(n);
		// Never destroy here: Svelte removes and re-inserts the same node in
		// consecutive statements (see `each.js`'s controlled-anchor reset).
		set_live(n, false);
		pending_destroy.add(n);
		mark_dirty();
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
			// A listener earns the element its hitbox back under a `hitbox="self"` ancestor.
			if (hitbox_root(target) !== null) apply_style(target);
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
			// A text field keeps reporting focus and blur: `focused_input` depends on it.
			const tracked = TEXT_INPUTS.has(target.name) && (event === 'focus' || event === 'blur');
			if (target.nativeId !== null) {
				if (!tracked) emit(['setEventListener', target.nativeId, event, false]);
				if (hitbox_root(target) !== null) apply_style(target);
			}
		}
	}
});

export default renderer;

/** Runs at import time, from the call compile.js appends to every component with a `<style>`. */
export function define_styles(scope, rules) {
	stylesheets.set(scope, rules);
}

/**
 * A theme is one call: every live element whose style read a `var()` is restyled,
 * and the whole sweep ships in the next batch like any other frame.
 *
 * @param {Record<string, string | number | null>} vars `{ surface: '#fff' }` for `var(--surface)`
 */
export function set_css_vars(vars) {
	define_css_vars(vars);
	for (const n of by_id.values()) {
		if (n.uses_vars) apply_style(n);
	}
}

// Host wiring — used by `render.js`, not by compiled components.

export function set_native(instance) {
	native = instance;
	queue = [];
	by_id = new Map();
	pending_destroy = new Set();
	inheriting_svgs = new Set();
	focused_input = null;
	root_node = null;
	portals = new Set();
	pending_portals = [];
	dirty = false;
	commit_scheduled = false;

	// The id map is new, so the window key listeners need a fresh registration.
	window_node.nativeId = null;
	if (window_node.listeners.size > 0) sync_window_keys();
}

function sync_window_keys() {
	if (typeof native?.setWindowKeyEvents !== 'function') return;
	if (window_node.nativeId === null) window_node.nativeId = ++next_id;
	by_id.set(window_node.nativeId, window_node);
	native.setWindowKeyEvents(
		window_node.listeners.has('windowKeyDown'),
		window_node.listeners.has('windowKeyUp'),
		window_node.nativeId
	);
}

/**
 * A key handler that fires whatever has focus — the ⌘K kind — without a focused
 * root `div` to hold on to; `event.editing` says a text field is getting the same key.
 *
 * @param {'keydown' | 'keyup'} type
 * @param {(event: any) => void} handler
 */
export function on_window_key(type, handler) {
	const event = WINDOW_KEY_EVENTS[type.toLowerCase()];
	if (!event) throw new Error(`[gpuix-svelte] on_window_key: unknown type "${type}" (keydown or keyup)`);

	let handlers = window_node.listeners.get(event);
	if (!handlers) {
		handlers = [];
		window_node.listeners.set(event, handlers);
	}
	handlers.push(handler);
	sync_window_keys();

	return () => {
		const index = handlers.indexOf(handler);
		if (index !== -1) handlers.splice(index, 1);
		if (handlers.length === 0) window_node.listeners.delete(event);
		sync_window_keys();
	};
}

/** For components that need GPUI's answers back, e.g. scroll offsets and painted bounds. */
export const get_native = () => native;

/** `position: relative`, so a portal's `inset: 0` means the window. */
export function create_root(style = { display: 'flex', width: '100%', height: '100%', position: 'relative' }) {
	const root = node('element', 'div', '');
	root.nativeId = ++next_id;
	root.live = true;
	root.attached = true;
	by_id.set(root.nativeId, root);
	root_node = root;

	emit(['createElement', root.nativeId, 'div']);
	emit(['setStyle', root.nativeId, style]);
	emit(['setRoot', root.nativeId]);

	return root;
}

export const is_dirty = () => dirty;

/** Lets a remount retire the previous root inside the new tree's batch. */
export function queue_destroy(nativeId) {
	emit(['destroyElement', nativeId]);
}

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
	// Not under their shadow ancestors natively, so that ancestor's destroy misses them.
	for (const p of portals) {
		if (!p.live && p.nativeId !== null && !pending_destroy.has(p)) emit(['destroyElement', p.nativeId]);
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
	// descendants to purge from the id map.
	const destroyed = native.applyBatch(json);
	for (const id of destroyed) {
		const n = by_id.get(id);
		if (n) {
			n.nativeId = null;
			n.attached = false;
			if (n.name === 'svg') inheriting_svgs.delete(n);
			if (n === focused_input) focused_input = null;
			portals.delete(n);
		}
		by_id.delete(id);
	}

	// 0.6 removed commitMutations — applyBatch invalidates on its own there.
	native.commitMutations?.();
}

export function dispatch(payload) {
	const target = by_id.get(payload.elementId);
	if (!target) return;

	if (TEXT_INPUTS.has(target.name)) {
		if (payload.eventType === 'focus') focused_input = target;
		else if (payload.eventType === 'blur' && focused_input === target) focused_input = null;
	}

	const handlers = target.listeners.get(payload.eventType);
	if (!handlers || handlers.length === 0) return;

	const event = {
		...payload,
		type: payload.eventType,
		target,
		currentTarget: target,
		editing: focused_input !== null,
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
