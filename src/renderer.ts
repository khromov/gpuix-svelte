/**
 * A JS shadow tree projected onto GPUI: it holds the fragments and comments GPUI has
 * no representation for, and allocates native ids lazily, because Svelte renders
 * offscreen constantly and eager creation would leak a Rust node per abandoned render.
 */

import type { EventPayload } from '@gpuix/native';
import { BUILT_IN_TYPES, UNIVERSAL_PROPS } from '@gpuix/native/host';
import type {
	AnchoredProps,
	CodeProps,
	DiffProps,
	ElementType,
	ImgProps,
	MarkdownProps,
	SvgProps,
	TextareaProps,
	VirtualListProps
} from '@gpuix/native/host';
import { createRenderer } from 'svelte/renderer';
import { observeWindowSize, type WindowSizeHost } from '@gpuix/native/host';
import { build_style, define_css_vars, define_sheet_vars, flush_var_warnings, set_of, used_css_vars } from './style.ts';
import { media_active, media_changed, type Viewport } from './media.ts';
import { to_gpui_event, WINDOW_KEY_EVENTS } from './events.ts';
import { place_layer } from './layers.ts';
import type {
	ClassRule,
	DismissLayer,
	EventHandler,
	GpuiStyle,
	GpuixEvent,
	Mutation,
	Native,
	NativeSink,
	NodeKind,
	RootRule,
	ShadowNode,
	WindowKeyType,
	WindowNative
} from './types.ts';

/** Anything not listed here degrades to `div`; that includes `canvas`, which native 0.11 lacks and would paint nothing for. */
const GPUI_TAGS = set_of<Exclude<ElementType, 'canvas'>>()([
	'div',
	'text',
	'img',
	'svg',
	'input',
	'textarea',
	'anchored',
	'code',
	'diff',
	'markdown',
	'virtual-list'
]);

/** Every element's props as native types them (`TextareaProps` holds `InputProps` and `HostProps`). */
type NativeProps = TextareaProps | CodeProps | DiffProps | MarkdownProps | ImgProps | SvgProps | AnchoredProps | VirtualListProps;
type Value<T, K extends keyof T> = Exclude<T[K], undefined>;
/** The props of any element whose every value is a `V`; `itemCount?: never` is no prop of either kind. */
type PropsOf<V, T = NativeProps> = T extends unknown
	? { [K in keyof T]-?: [Value<T, K>] extends [never] ? never : [Value<T, K>] extends [V] ? K : never }[keyof T]
	: never;

/** A static attribute reaches the renderer as text (a bare one as `''`), and native ignores a prop whose JSON type is wrong. */
const BOOLEAN_PROPS = set_of<PropsOf<boolean>>()([
	'autoFocus',
	'aria-expanded',
	'aria-selected',
	'readOnly',
	'showLineNumbers',
	'wordDiff',
	'scroll',
	'deferred',
	'occlude',
	'followTail'
]);
const NUMBER_PROPS = set_of<PropsOf<number>>()([
	'tabIndex',
	'aria-level',
	'minRows',
	'maxRows',
	'maxLines',
	'gap',
	'snapMargin',
	'priority',
	'overdraw',
	'estimatedItemHeight',
	'itemCount',
	'windowStart'
]);

/** Attributes that feed `setStyle`; `class` does so through the component's `<style>` rules. */
const STYLE_ATTRS = new Set(['style', 'hover', 'active', 'focus-visible', 'class']);

/** Attributes the renderer consumes itself; never forwarded as props. */
const RENDERER_ATTRS = new Set(['hitbox', 'portal']);

// Focusability decides `hitbox="self"` shielding, so a change must restyle.
const FOCUS_ATTRS = new Set(['tabIndex', 'tabindex', 'autoFocus', 'autofocus']);

/** Native types that take input of their own, so `hitbox="self"` leaves their hitbox alone. */
const INTERACTIVE_TAGS = new Set(['input', 'textarea', 'code', 'diff', 'markdown', 'virtual-list', 'anchored']);

/** Reports that need no pointer, so listening for one leaves a decorative element shielded. */
const PASSIVE_EVENTS = new Set(['layout', 'scrollChange', 'motionComplete', 'highlight']);

/** Always listen for focus/blur on these, so window key handlers can tell typing from a shortcut. */
const TEXT_INPUTS = new Set(['input', 'textarea']);

/** HTML spells these lowercase (`readonly`, `tabindex`); GPUI wants them camelCased. */
const PROP_ALIASES = new Map([...BOOLEAN_PROPS, ...NUMBER_PROPS, 'testId'].map((name) => [name.toLowerCase(), name]));

const warned_props = new Set<string>();

/** The live GpuixRenderer (or TestGpuixRenderer). */
let native: NativeSink | null = null;

/** Queued mutation tuples, flushed as one `applyBatch` call. */
let queue: Mutation[] = [];

/** nativeId -> shadow node, for event dispatch and destroy bookkeeping. */
let by_id = new Map<number, ShadowNode>();

let pending_destroy = new Set<ShadowNode>();

/** `<svg>`s painting their nearest ancestor's `color`, restyled when that ancestor is. */
let inheriting_svgs = new Set<ShadowNode>();

/** Live nodes with a rule under `@media`, restyled when the window's size changes. */
let media_nodes = new Set<ShadowNode>();

/** Whether `class_rules` met an `@media` rule since `apply_style` last reset it. */
let media_read = false;

type ViewportObserver = (callback: (size: Viewport) => void) => () => void;

/**
 * Reports the window's size now and on every change, until stopped. Native's own poll by default, since a
 * test through `gpuix-svelte/test` alone never loads window.ts; window.ts replaces it with the poll
 * `window_size` shares, guarded against a Windows file dialog.
 */
let observe_viewport: ViewportObserver = (callback) => observeWindowSize(native as unknown as WindowSizeHost | null, callback);
let stop_viewport: (() => void) | null = null;
let viewport: Viewport | null = null;

/** What `window_size` reads before any window exists. */
const NO_WINDOW: Viewport = { width: 800, height: 600 };

/** The text field with focus, if any — what `editing` on a window key event reports. */
let focused_input: ShadowNode | null = null;

/** The node `create_root` made, where `portal` elements go natively. */
let root_node: ShadowNode | null = null;

/**
 * `portal` nodes stay where Svelte put them in the shadow tree but hang off the root
 * natively, so paint order (document order in GPUI) puts them on top; an ancestor's
 * destroy never reaches them, so `commit` retires them itself.
 */
let portals = new Set<ShadowNode>();

/** Portals met while materialising a subtree, appended once that subtree is attached. */
let pending_portals: ShadowNode[] = [];

/** Native calls on a node whose `createElement` is still queued, run once the batch has shipped. */
let after_commit: Array<() => void> = [];

const is_portal = (n: ShadowNode) => {
	const flag = n.attrs.portal;
	return flag != null && flag !== false && flag !== 'false';
};

/**
 * Monotonic across remounts on purpose: `render_hot` builds a fresh tree while the old
 * GPUI nodes may still exist, and reused ids would collide with them.
 */
let next_id = 0;
let dirty = false;
let auto_commit = false;
let commit_scheduled = false;

const warned_tags = new Set<string>();

/**
 * Window-level key and selection events arrive on whatever id `setWindowKeyEvents` and
 * `setWindowSelectionChange` were given, so
 * one pseudo node, never materialised, holds their listeners under that id.
 */
const window_node = node('window' as NodeKind, 'window', '');

/** Tab moves focus after every handler had its say, as `@gpuix/react` and `@gpuix/solid` do. */
let tab_navigation = true;

const KEY_EVENTS = new Set(['keyDown', 'keyUp', 'windowKeyDown', 'windowKeyUp']);

type KeystrokeFlags = { id: number | undefined; prevented: boolean; stopped: boolean };

// Native emits one keystroke's element events and then its window event back to back,
// so only the latest keystroke needs flags.
let keystroke: KeystrokeFlags = { id: undefined, prevented: false, stopped: false };

/** Open overlays, the top one last. */
let layers: DismissLayer[] = [];

/**
 * GPUI's X11 client reports a held key's repeats as fresh presses, with no release in between. So on Linux an
 * Escape with none since the last one is a repeat; only for this long, in case the release went to another window.
 */
const REPEAT_MS = 1000;
let escape_down = -Infinity;
const untold_repeats = () => globalThis.process?.platform === 'linux';

/** scope class -> that component's `<style>` rules, weakest first (see compile.ts). */
const stylesheets = new Map<string, ClassRule[]>();
const NO_RULES: readonly ClassRule[] = [];

/**
 * file -> its `:root` rules, files in the order they first evaluated, which is where a browser's cascade keeps a sheet.
 * `mount` is the mount a hot file declared them for, null for a file that evaluates once.
 */
const root_sheets = new Map<string, { rules: RootRule[]; mount: number | null }>();
let mounts = 0;

/** A `:root` rule under `@media` keeps the window observed while no element depends on its size. */
let root_media = false;

/** A variable changed, and the next commit restyles what reads one. */
let vars_moved = false;

let on_dirty: (() => void) | null = null;

/** How the frame loop hears of a mutation made between its ticks (a timer, a fetch), which a display-link wake never reports. */
export function set_on_dirty(callback: (() => void) | null) {
	on_dirty = callback;
}

/** Removals queue no op of their own, so they have to raise the flag themselves. */
function mark_dirty() {
	if (!dirty) on_dirty?.();
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

function emit(op: Mutation) {
	queue.push(op);
	mark_dirty();
}

function node(kind: NodeKind, name: string, data: string): ShadowNode {
	return {
		kind,
		name,
		data,
		attrs: {},
		listeners: new Map(),
		nativeId: null,
		textId: null,
		uses_vars: false,
		uses_media: false,
		own_color: undefined,
		live: false,
		attached: false,
		parent: null,
		first: null,
		last: null,
		prev: null,
		next: null
	};
}

function link(parent: ShadowNode, child: ShadowNode, anchor: ShadowNode | null) {
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

function unlink(child: ShadowNode) {
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

const is_blank = (s: string | null | undefined) => s == null || s.trim() === '';

/**
 * Fragments are never children (every insert splats them), so a fragment parent
 * means "not attached to anything native yet".
 */
const native_parent_of = (parent: ShadowNode | null) => (parent && parent.kind === 'element' ? parent : null);

/** Siblings only: a native node can never hide beneath a virtual one. A portal is not in this parent's native list. */
function first_native_after(cursor: ShadowNode | null) {
	for (let n = cursor; n !== null; n = n.next) {
		if (n.nativeId !== null && n.attached && !is_portal(n)) return n;
	}
	return null;
}

const BUTTON_ATTRS = new Set(['role', 'tabindex', 'tabIndex', 'disabled']);

const is_disabled = (el: ShadowNode) => el.attrs.disabled != null && el.attrs.disabled !== false && el.attrs.disabled !== 'false';

/** `<button>` is a div with what a browser's has for free: the role, a tab stop, and Enter or Space as a click. */
function button_defaults(el: ShadowNode) {
	if (el.name !== 'button' || el.nativeId === null) return;
	if (!('role' in el.attrs)) emit(['setCustomProp', el.nativeId, 'role', 'button']);
	if (!('tabindex' in el.attrs) && !('tabIndex' in el.attrs)) emit(['setCustomProp', el.nativeId, 'tabIndex', is_disabled(el) ? null : 0]);
}

function map_tag(name: string) {
	if (GPUI_TAGS.has(name)) return name;
	if (name === 'button') return 'div';
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
function class_rules(el: ShadowNode): readonly ClassRule[] {
	const value = el.attrs.class;
	if (typeof value !== 'string' || value === '') return NO_RULES;

	const names = value.split(/\s+/);
	let matched: ClassRule[] | null = null;
	for (const name of names) {
		const sheet = stylesheets.get(name);
		if (!sheet) continue;
		for (const rule of sheet) {
			if (rule.tag !== null && rule.tag !== el.name) continue;
			if (!rule.classes.every((c) => names.includes(c))) continue;
			if (rule.media) {
				// Whether or not it holds now, the element depends on the window's size from here on.
				media_read = true;
				if (!media_active(rule.media, current_viewport())) continue;
			}
			(matched ??= []).push(rule);
		}
	}
	return matched ?? NO_RULES;
}

/** The size the first `@media` rule starts observing; the observer's first report is synchronous. */
function current_viewport(): Viewport {
	if (viewport === null && stop_viewport === null && native !== null) {
		stop_viewport = observe_viewport(on_viewport);
	}
	return viewport ?? NO_WINDOW;
}

/** A size change restyles the dependent nodes only when some query answers differently for it. */
function on_viewport(size: Viewport) {
	if (viewport !== null && viewport.width === size.width && viewport.height === size.height) return;
	const before = viewport;
	viewport = { width: size.width, height: size.height };
	if (before === null || !media_changed(before, viewport)) return;
	if (root_media) cascade_root_vars();
	for (const n of media_nodes) {
		if (n.nativeId !== null) apply_style(n);
	}
}

function vars_changed() {
	vars_moved = true;
	mark_dirty();
}

function cascade_root_vars() {
	const vars = new Map<string, string>();
	const important = new Map<string, string>();
	root_media = false;
	for (const sheet of root_sheets.values()) {
		for (const rule of sheet.rules) {
			if (rule.media) {
				root_media = true;
				if (!media_active(rule.media, current_viewport())) continue;
			}
			for (const [name, value] of Object.entries(rule.vars)) vars.set(name, value);
			for (const [name, value] of Object.entries(rule.important ?? {})) important.set(name, value);
		}
	}
	if (define_sheet_vars(vars, important)) vars_changed();
}

function stop_viewport_observer() {
	stop_viewport?.();
	stop_viewport = null;
	viewport = null;
}

function track_media(el: ShadowNode) {
	el.uses_media = media_read;
	if (media_read) media_nodes.add(el);
	else media_nodes.delete(el);
}

function hitbox_root(el: ShadowNode) {
	for (let p = el.parent; p; p = p.parent) {
		if (p.kind === 'element' && p.attrs.hitbox === 'self') return p;
	}
	return null;
}

function descends(n: ShadowNode, ancestor: ShadowNode) {
	for (let p = n.parent; p; p = p.parent) if (p === ancestor) return true;
	return false;
}

/**
 * Under a `hitbox="self"` ancestor, anything that neither listens, takes input nor
 * scrolls must not occlude it — a painted badge or thumbnail would swallow the click.
 */
function shielded(el: ShadowNode, style: GpuiStyle) {
	if (INTERACTIVE_TAGS.has(el.name) || el.name === 'button') return false;
	for (const event of el.listeners.keys()) if (!PASSIVE_EVENTS.has(event)) return false;
	if ('tabIndex' in el.attrs || 'tabindex' in el.attrs || 'autoFocus' in el.attrs || 'autofocus' in el.attrs) return false;
	if (style.overflow === 'scroll' || style.overflowY === 'scroll' || style.overflowX === 'scroll') return false;
	return hitbox_root(el) !== null;
}

/** `<svg>` takes no `color` from its parent natively, so the nearest ancestor's is copied in. */
function inherit_color(el: ShadowNode, style: GpuiStyle) {
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

function apply_style(el: ShadowNode) {
	if (el.nativeId === null) return;
	media_read = false;
	const style = build_style(el.attrs, class_rules(el));
	el.uses_vars = used_css_vars();

	if (style.pointerEvents === undefined && shielded(el, style)) style.pointerEvents = 'none';

	if (el.name === 'svg') {
		if (style.color === undefined) {
			// The ancestor whose colour it takes is tracked itself, and its restyle sweeps the <svg>.
			const own = media_read;
			inherit_color(el, style);
			media_read = own;
			inheriting_svgs.add(el);
		} else {
			inheriting_svgs.delete(el);
		}
	}
	// Before the `<svg>` sweep below, whose nested calls reset the flag.
	track_media(el);

	if (el.name !== 'svg' && style.color !== el.own_color) {
		// Only a new colour changes what an `<svg>` below inherits, and a drag restyles its panel every frame.
		el.own_color = style.color;
		if (el.first) {
			for (const svg of inheriting_svgs) {
				if (svg.nativeId !== null && descends(svg, el)) apply_style(svg);
			}
		}
	}

	emit(['setStyle', el.nativeId, style]);
}

function restyle_subtree(el: ShadowNode) {
	for (let c = el.first; c; c = c.next) {
		if (c.kind === 'element' && c.nativeId !== null) apply_style(c);
		restyle_subtree(c);
	}
}

/** `portal` toggled on a live node: GPUI reparents on the next appendChild/insertBefore. */
function reparent(el: ShadowNode) {
	if (!is_portal(el)) portals.delete(el);
	if (el.nativeId === null || !el.attached || !el.live) return;
	attach(el);
	attach_portals();
	rewrap_beside(el.prev, el.next);
}

const prop_name = (key: string) => PROP_ALIASES.get(key.toLowerCase()) ?? key;

/** As HTML reads a boolean attribute, `readonly`, `readonly=""` and `readonly="readonly"` are all true; `"false"` is not. */
function normalize_prop(name: string, value: unknown) {
	if (BOOLEAN_PROPS.has(name)) return typeof value === 'string' ? value !== 'false' : Boolean(value);
	if (!NUMBER_PROPS.has(name)) return value;
	const blank = typeof value === 'string' && value.trim() === '';
	// A bare `tabindex` has always meant a tab stop here, and a `<button>` that carries one skips its default 0.
	if (blank && name === 'tabIndex') return 0;
	const number = blank ? NaN : Number(value);
	if (Number.isFinite(number)) return number;
	if (!warned_props.has(name)) {
		warned_props.add(name);
		console.warn(`[gpuix-svelte] ${name}="${String(value)}" is not a number, so it is left unset`);
	}
	return null;
}

function apply_prop(el: ShadowNode, key: string, value: unknown) {
	const name = prop_name(key);
	if (BUILT_IN_TYPES.has(map_tag(el.name)) && !UNIVERSAL_PROPS.has(name)) return;
	if (el.nativeId === null) return;
	emit(['setCustomProp', el.nativeId, name, value === null ? null : normalize_prop(name, value)]);
}

function real_sibling(from: ShadowNode | null, dir: 'prev' | 'next') {
	for (let s = from; s; s = s[dir]) {
		if (s.kind === 'comment' || (s.kind === 'text' && is_blank(s.data)) || is_portal(s)) continue;
		return s;
	}
	return null;
}

// Native searches, selects and copies adjacent text leaves as one run, which a wrapper would split, so text beside text stays bare and unlabelled.
const wants_wrapper = (n: ShadowNode) =>
	n.parent?.name !== 'text' && real_sibling(n.prev, 'prev')?.kind !== 'text' && real_sibling(n.next, 'next')?.kind !== 'text';

/** Rebuilds a live text node whose neighbours changed, so its wrapper matches `wants_wrapper` again. */
function rewrap(n: ShadowNode | null) {
	if (n === null || n.kind !== 'text' || n.nativeId === null || !n.attached || !n.live) return;
	if ((n.textId !== null) === wants_wrapper(n)) return;
	emit(['destroyElement', n.nativeId]);
	by_id.delete(n.nativeId);
	n.nativeId = null;
	n.textId = null;
	n.attached = false;
	materialize(n);
	attach(n);
}

const rewrap_beside = (prev: ShadowNode | null, next: ShadowNode | null) => {
	rewrap(real_sibling(prev, 'prev'));
	rewrap(real_sibling(next, 'next'));
};

/** Idempotent. */
function materialize(n: ShadowNode) {
	if (n.kind === 'comment' || n.kind === 'fragment') return;

	if (n.nativeId === null) {
		if (n.kind === 'text') {
			// Blank text is only an anchor, so it stays virtual and
			// doesn't occupy a slot in GPUI's flex layout.
			if (is_blank(n.data)) return;

			n.nativeId = ++next_id;
			by_id.set(n.nativeId, n);
			emit(['createElement', n.nativeId, 'text']);
			if (!wants_wrapper(n)) {
				emit(['setText', n.nativeId, n.data]);
				return;
			}
			// Native labels only a `text` holding no string of its own, so text outside a `<text>` gets one around it or screen readers never hear it.
			n.textId = ++next_id;
			emit(['createElement', n.textId, 'text']);
			emit(['setText', n.textId, n.data]);
			emit(['appendChild', n.nativeId, n.textId]);
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
		if (n.name === 'button') {
			button_defaults(n);
			if (!n.listeners.has('keyDown')) emit(['setEventListener', n.nativeId, 'keyDown', true]);
		}
	}

	for (let c = n.first; c; c = c.next) {
		materialize(c);
		if (c.nativeId !== null && !c.attached) attach(c);
	}
}

function attach(n: ShadowNode) {
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
			? ['insertBefore', np.nativeId, n.nativeId, before.nativeId!]
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

function set_live(n: ShadowNode, value: boolean) {
	if (n.live === value) return;
	n.live = value;
	for (let c = n.first; c; c = c.next) set_live(c, value);
}

type Nodes = { fragment: ShadowNode; element: ShadowNode; text: ShadowNode; comment: ShadowNode };
type GpuixSvelteRenderer = ReturnType<typeof createRenderer<Nodes>>;

const renderer: GpuixSvelteRenderer = createRenderer<Nodes>({
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
			if (BUTTON_ATTRS.has(key)) button_defaults(el);
			if (FOCUS_ATTRS.has(key) && hitbox_root(el) !== null) apply_style(el);
		}
	},

	removeAttribute(el, name) {
		if (!(name in el.attrs)) return;
		delete el.attrs[name];

		if (STYLE_ATTRS.has(name)) apply_style(el);
		else if (name === 'portal') reparent(el);
		else if (RENDERER_ATTRS.has(name)) restyle_subtree(el);
		else {
			apply_prop(el, name, null);
			if (BUTTON_ATTRS.has(name)) button_defaults(el);
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
				n.textId = null;
				n.attached = false;
				rewrap_beside(n.prev, n.next);
				return;
			}

			emit(['setText', n.textId ?? n.nativeId, text]);
			return;
		}

		if (n.kind !== 'text' || is_blank(text) || !n.live) return;
		materialize(n);
		attach(n);
		rewrap_beside(n.prev, n.next);
	},

	getFirstChild: (n) => n.first,
	getLastChild: (n) => n.last,
	getNextSibling: (n) => n.next,
	getParent: (n) => n.parent,

	insert(parent, n, anchor) {
		// Fragments are never nested, so this recurses at most one level.
		if (n.kind === 'fragment') {
			for (let c = n.first, next: ShadowNode | null; c; c = next) {
				next = c.next;
				renderer.insert(parent, c, anchor);
			}
			return;
		}

		const [left, right, was_live] = [n.prev, n.next, n.live];
		if (n.parent) unlink(n); // insert doubles as move
		link(parent, n, anchor);

		set_live(n, parent.live === true);

		if (n.live) {
			pending_destroy.delete(n); // resurrected before the next commit
			materialize(n);
			attach(n); // GPUI reparents on insertBefore/appendChild
			attach_portals();
			rewrap(n);
			rewrap_beside(n.prev, n.next);
		} else if (n.nativeId !== null && n.attached) {
			// Native has no detach op (removeChild is gone in 0.6), so commit()
			// destroys the subtree; it re-materializes if it becomes live again.
			pending_destroy.add(n);
			mark_dirty();
		}

		// Only once `n` is in its new native place, because rebuilding a neighbour's wrapper anchors on the shadow order.
		if (was_live) rewrap_beside(left, right);
	},

	remove(n) {
		if (n.parent === null) return;

		const [left, right, was_live] = [n.prev, n.next, n.live];
		unlink(n);
		// Never destroy here: Svelte removes and re-inserts the same node in
		// consecutive statements (see `each.js`'s controlled-anchor reset).
		set_live(n, false);
		pending_destroy.add(n);
		mark_dirty();
		if (was_live) rewrap_beside(left, right);
	},

	addEventListener(target, type, handler: EventHandler) {
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

	removeEventListener(target, type, handler: EventHandler) {
		const event = to_gpui_event(type);
		if (event === null) return;

		const handlers = target.listeners.get(event);
		if (!handlers) return;

		const index = handlers.indexOf(handler);
		if (index !== -1) handlers.splice(index, 1);

		if (handlers.length === 0) {
			target.listeners.delete(event);
			// A text field keeps reporting focus and blur: `focused_input` depends on it.
			const tracked =
				(TEXT_INPUTS.has(target.name) && (event === 'focus' || event === 'blur')) || (target.name === 'button' && event === 'keyDown');
			if (target.nativeId !== null) {
				if (!tracked) emit(['setEventListener', target.nativeId, event, false]);
				if (hitbox_root(target) !== null) apply_style(target);
			}
		}
	}
});

export default renderer;

/** Runs at import time, from the call compile.ts appends to every component with a `<style>`. */
export function define_styles(scope: string, rules: ClassRule[]) {
	stylesheets.set(scope, rules);
}

/** At import time too, as a browser has a sheet's variables once the sheet loads; `hot` is a file `render_hot` evaluates again on every reload. */
export function define_root_vars(file: string, rules: RootRule[], hot = false) {
	root_sheets.set(file, { rules, mount: hot ? mounts : null });
	cascade_root_vars();
}

/**
 * How the renderer learns the window's size for `@media` rules: window.ts installs the poll behind
 * `window_size`, started by the first such rule and stopped once none is live.
 */
export function set_viewport_observer(observe: ViewportObserver) {
	observe_viewport = observe;
}

/**
 * A theme is one call: every live element whose style read a `var()` is restyled,
 * and the whole sweep ships in the next batch like any other frame. A palette identical
 * to the one in force — a theme effect re-running — is a no-op.
 *
 * `vars` is `{ surface: '#fff' }` for `var(--surface)`; a value outranks a `:root` rule's, and `null` gives that one back.
 */
export function set_css_vars(vars: Record<string, string | number | null>) {
	if (define_css_vars(vars)) vars_changed();
}

// Host wiring for `render.ts` and the test harness.

export function set_native(instance: NativeSink) {
	native = instance;
	queue = [];
	by_id = new Map();
	pending_destroy = new Set();
	inheriting_svgs = new Set();
	media_nodes = new Set();
	stop_viewport_observer();
	// A reload evaluates every hot file it still imports before it remounts, so the rules one did not declare again have left the app.
	for (const [file, sheet] of root_sheets) {
		if (sheet.mount !== null && sheet.mount !== mounts) root_sheets.delete(file);
	}
	mounts++;
	cascade_root_vars();
	vars_moved = false;
	focused_input = null;
	root_node = null;
	portals = new Set();
	pending_portals = [];
	after_commit = [];
	layers = [];
	escape_down = -Infinity;
	dirty = false;
	commit_scheduled = false;

	// The id map is new, so the window listeners need a fresh registration.
	window_node.nativeId = null;
	if (window_node.listeners.size > 0 || tab_navigation) sync_window_events();
}

/** `render`'s `tabNavigation`: false leaves Tab to the app, as before native 0.11. */
export function set_tab_navigation(enabled: boolean) {
	if (enabled === tab_navigation) return;
	tab_navigation = enabled;
	if (native) sync_window_events();
}

/** Native 0.11's 40% dim of every other focusable while one has keyboard focus. */
export function set_keyboard_focus_dim(enabled: boolean) {
	emit(['setKeyboardFocusDim', enabled]);
}

function sync_window_events() {
	if (window_node.nativeId === null) window_node.nativeId = ++next_id;
	by_id.set(window_node.nativeId, window_node);
	native?.setWindowKeyEvents?.(
		tab_navigation || layers.length > 0 || window_node.listeners.has('windowKeyDown'),
		(layers.length > 0 && untold_repeats()) || window_node.listeners.has('windowKeyUp'),
		window_node.nativeId
	);
	native?.setWindowSelectionChange?.(window_node.listeners.has('selectionChange'), window_node.nativeId);
}

function on_window_event(event: string, handler: (event: GpuixEvent) => void): () => void {
	let handlers = window_node.listeners.get(event);
	if (!handlers) {
		handlers = [];
		window_node.listeners.set(event, handlers);
	}
	handlers.push(handler);
	sync_window_events();

	let subscribed = true;
	return () => {
		// Once its emptied array is dropped, a repeat call would delete a later subscription's.
		if (!subscribed) return;
		subscribed = false;
		const index = handlers.indexOf(handler);
		if (index !== -1) handlers.splice(index, 1);
		if (handlers.length === 0) window_node.listeners.delete(event);
		sync_window_events();
	};
}

/**
 * A key handler that fires whatever has focus — the ⌘K kind — without a focused
 * root `div` to hold on to; `event.editing` says a text field is getting the same key.
 * Returns the unsubscribe.
 */
export function on_window_key(type: WindowKeyType, handler: (event: GpuixEvent) => void): () => void {
	const event = WINDOW_KEY_EVENTS[type.toLowerCase()];
	if (!event) throw new Error(`[gpuix-svelte] on_window_key: unknown type "${type}" (keydown or keyup)`);
	return on_window_event(event, handler);
}

/** Fires once per change of the window's text selection, a clear included; `event.value` is the selected text. */
export const on_selection_change = (handler: (event: GpuixEvent) => void) => on_window_event('selectionChange', handler);

/**
 * Puts an open overlay on top of the window's stack until the returned function runs. An Escape that
 * no key handler prevented reaches the top layer's `onEscape` alone, so a tip in a popover closes first.
 */
export function dismiss_layer(layer: DismissLayer): () => void {
	const entry = { ...layer };
	place_layer(layers, entry);
	if (layers.length === 1) sync_window_events();
	return () => {
		const index = layers.indexOf(entry);
		if (index === -1) return;
		layers.splice(index, 1);
		if (layers.length > 0) return;
		// The release that would clear it is no longer listened for.
		escape_down = -Infinity;
		sync_window_events();
	};
}

/** For components that need GPUI's answers back, e.g. scroll offsets and painted bounds. */
export const get_native = (): Native | null => native as Native | null;

export const node_of = (id: number | null | undefined): ShadowNode | null => (id == null ? null : (by_id.get(id) ?? null));

/** A tree read from native, with each wrapper `materialize` put around plain text folded back into that text, as the app wrote it. */
export function unwrap_text<T extends { id: number; children?: T[] }>(node: T): T {
	const inner = by_id.get(node.id)?.kind === 'text' && node.children?.length === 1 ? node.children[0] : null;
	if (inner) return { ...inner, id: node.id };
	return node.children ? { ...node, children: node.children.map(unwrap_text) } : node;
}

export function unwrap_text_json(json: string) {
	const tree = json ? (JSON.parse(json) as { id: number } | null) : null;
	return tree ? JSON.stringify(unwrap_text(tree)) : json;
}

/** `position: relative`, so a portal's `inset: 0` means the window; a `null` dim leaves native's flag as it is. */
export function create_root(
	style: GpuiStyle = { display: 'flex', width: '100%', height: '100%', position: 'relative' },
	keyboard_focus_dim: boolean | null = false
): ShadowNode {
	const root = node('element', 'div', '');
	root.nativeId = ++next_id;
	root.live = true;
	root.attached = true;
	by_id.set(root.nativeId, root);
	root_node = root;

	emit(['createElement', root.nativeId, 'div']);
	emit(['setStyle', root.nativeId, style]);
	emit(['setRoot', root.nativeId]);
	if (keyboard_focus_dim !== null) set_keyboard_focus_dim(keyboard_focus_dim);

	return root;
}

export const is_dirty = () => dirty;

/** Lets a remount retire the previous root inside the new tree's batch. */
export function queue_destroy(nativeId: number) {
	emit(['destroyElement', nativeId]);
}

/** Where no frame loop polls `is_dirty()`, mutations have to drain themselves. */
export function set_auto_commit(enabled: boolean) {
	auto_commit = enabled;
}

/** Ships the whole frame's mutations as one call across the FFI boundary. */
export function commit() {
	if (vars_moved) {
		vars_moved = false;
		// Not what left the tree, which is destroyed below: after a hot reload that is the old tree, and it would be reported for every variable the edit removed.
		for (const n of by_id.values()) {
			if (n.uses_vars && n.live) apply_style(n);
		}
	}

	// Above the empty-queue return below: a frame that only restyled still has to report.
	flush_var_warnings();

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
		run_after_commit();
		return;
	}

	const ops = queue;
	queue = [];
	dirty = false;

	// Rust destroys whole subtrees, so the returned ids are how we learn which
	// descendants to purge from the id map.
	const destroyed = ship(ops);
	for (const id of destroyed) {
		const n = by_id.get(id);
		if (n) {
			n.nativeId = null;
			n.textId = null;
			n.attached = false;
			if (n.name === 'svg') inheriting_svgs.delete(n);
			if (n.uses_media) media_nodes.delete(n);
			if (n === focused_input) focused_input = null;
			portals.delete(n);
		}
		by_id.delete(id);
	}
	if (media_nodes.size === 0 && !root_media) stop_viewport_observer();

	run_after_commit();
}

/** How native reports a batch it decoded and applied none of; it can also apply one and then fail to wake a closed window. */
const REFUSED = /^(?:Failed to parse batch|Batch op \d)/;

/** The wasm build throws plain strings. */
const error_text = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Whatever a value's `toJSON` threw, nothing reached native. */
class Unserializable extends Error {}

/** Costs one op rather than the frame; anything else may have come after the batch applied. */
const costs_one_op = (error: unknown) => error instanceof Unserializable || REFUSED.test(error_text(error));

/** JSON.stringify escapes a lone surrogate, an emoji cut by `.slice()` say, and native refuses the escape. */
function to_json(ops: Mutation[]): string {
	try {
		const json = JSON.stringify(ops);
		return json.includes('\\ud') ? JSON.stringify(ops, (_key, value) => (typeof value === 'string' ? value.toWellFormed() : value)) : json;
	} catch (error) {
		throw new Unserializable(error_text(error));
	}
}

/**
 * Native decodes a whole batch before applying any of it, so one op it refuses would lose the
 * frame while the shadow tree goes on believing those ids exist; sent singly, only that op is lost.
 */
function ship(ops: Mutation[]): number[] {
	try {
		return native!.applyBatch(to_json(ops));
	} catch (error) {
		if (!costs_one_op(error)) throw error;
	}

	const destroyed: number[] = [];
	for (const op of ops) {
		try {
			destroyed.push(...native!.applyBatch(to_json([op])));
		} catch (error) {
			// The window went away, and every op after this one would say so too.
			if (!costs_one_op(error)) throw error;
			console.error(`[gpuix-svelte] native refused ${op[0]}: ${error_text(error)}`);
		}
	}
	return destroyed;
}

function run_after_commit() {
	const calls = after_commit;
	after_commit = [];
	for (const call of calls) call();
}

/** Runs `call` with the node's id once native has the element, which is now unless mutations are queued. */
export function with_native_id(node: { nativeId?: number | null } | null | undefined, call: (id: number) => void) {
	const run = () => {
		if (node?.nativeId != null) call(node.nativeId);
	};
	if (dirty) after_commit.push(run);
	else run();
}

export function dispatch(payload: EventPayload) {
	const target = by_id.get(payload.elementId);
	if (!target) return;

	if (TEXT_INPUTS.has(target.name)) {
		if (payload.eventType === 'focus') focused_input = target;
		else if (payload.eventType === 'blur' && focused_input === target) focused_input = null;
	}

	const button = target.name === 'button';
	if (button && payload.eventType === 'click' && is_disabled(target)) return;

	const flags = KEY_EVENTS.has(payload.eventType) ? flags_for(payload) : null;
	// Window handlers sit beside the overlays' old window listeners, where their stopPropagation never reached them.
	const element_stopped = flags?.stopped ?? false;
	const handlers = target.listeners.get(payload.eventType);
	if (handlers && handlers.length > 0 && !flags?.stopped) {
		let immediate = false;
		const event: GpuixEvent = {
			...payload,
			type: payload.eventType,
			target,
			currentTarget: target,
			editing: focused_input !== null,
			defaultPrevented: flags?.prevented ?? false,
			cancelBubble: false,
			preventDefault() {
				event.defaultPrevented = true;
				if (flags) flags.prevented = true;
			},
			stopPropagation() {
				event.cancelBubble = true;
				if (flags) flags.stopped = true;
			},
			stopImmediatePropagation() {
				event.stopPropagation();
				immediate = true;
			},
			composedPath: () => []
		};

		for (const handler of handlers.slice()) {
			handler.call(target, event);
			if (immediate) break;
		}
	}

	if (button && payload.eventType === 'keyDown' && !payload.isHeld && !flags?.prevented && (payload.key === 'enter' || payload.key === 'space')) {
		dispatch({ ...payload, eventType: 'click' });
	}
	if (payload.eventType === 'windowKeyDown' && !flags?.prevented) key_default(payload, element_stopped);
	if (payload.eventType === 'windowKeyUp' && payload.key === 'escape') escape_down = -Infinity;
}

/** A key event without an id is synthetic and never shares flags with another. */
function flags_for(payload: EventPayload): KeystrokeFlags {
	if (payload.keystrokeId == null) return { id: undefined, prevented: false, stopped: false };
	if (keystroke.id !== payload.keystrokeId) keystroke = { id: payload.keystrokeId, prevented: false, stopped: false };
	return keystroke;
}

/** Runs on the window event, which native sends after every element's, so any handler could have prevented it. */
function key_default(payload: EventPayload, stopped: boolean) {
	const modifiers = payload.modifiers;
	if (modifiers?.ctrl || modifiers?.alt || modifiers?.cmd) return;
	if (payload.key === 'escape') {
		// A handler that stopped Escape has used it, and a held key would close one layer per repeat.
		if (layers.length === 0) return;
		const now = performance.now();
		const held = payload.isHeld || (untold_repeats() && now - escape_down < REPEAT_MS);
		escape_down = now;
		if (!stopped && !held) layers.at(-1)?.onEscape();
		return;
	}
	if (!tab_navigation || payload.key !== 'tab') return;
	const host = native as WindowNative | null;
	if (modifiers?.shift) host?.focusPrevious?.();
	else host?.focusNext?.();
}
