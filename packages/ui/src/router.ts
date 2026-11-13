/**
 * Paths with a history stack, for the screens of a window and a page alike. The store lives in this
 * module, so a window keeps its screen across a hot reload; in a browser the stack is the history
 * API's (or the hash's), so the address bar, back and forward and deep links keep working. One
 * `<Router>` per app owns the route table; everything else reads and drives this store.
 */

import type { Snippet } from 'svelte';
import { createSubscriber } from 'svelte/reactivity';
import { IS_GPUIX, type AnyComponent } from 'gpuix-svelte';

/** `history` keeps the URL through the history API, `hash` through `#/path`; a window is always `memory`. */
export type Mode = 'history' | 'hash' | 'memory';

export interface Route {
	/** The pathname, without the query. */
	path: string;
	/** The pathname with its query string, as navigated to. */
	href: string;
	query: Record<string, string>;
	params: Record<string, string>;
	/** The table entry that matched: a pattern, `*` for the fallback, null for none. */
	pattern: string | null;
	/** What `navigate()` carried, kept out of the URL. */
	state: unknown;
}

export interface RouteProps {
	params: Record<string, string>;
	query: Record<string, string>;
}

/** A screen is a component, or a snippet wrapped by `screen()` for an app that keeps its screens in one file. */
export type Screen = AnyComponent | { render: Snippet<[RouteProps]> };
export type RouteTable = Record<string, Screen>;

// Taken as a plain function, since an app's markup snippets are typed against its own copy of svelte, which need not be the one this package's declarations resolve.
export const screen = (render: (props: RouteProps) => unknown): Screen => ({ render: render as Snippet<[RouteProps]> });

/** The params a pattern names: `'/items/:id/:tab'` gives `{ id, tab }`. */
export type Params<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
	? { [K in Name]: string | number } & Params<`/${Rest}`>
	: P extends `${string}:${infer Name}`
		? { [K in Name]: string | number }
		: Record<never, never>;

export type NavigateOptions = { replace?: boolean; state?: unknown };

/** False cancels the navigation, a string redirects it, anything else lets it through. */
export type Hook = (to: Route, from: Route) => boolean | string | void;

interface Entry {
	href: string;
	state: unknown;
}

/** What rides in each history entry's state: the position in the stack, and the hidden state. */
interface Saved {
	index: number;
	length: number;
	state: unknown;
	/** Which arrival the entry shows: a fragment link's entry shares the one it was followed from, so moving between the two is no navigation. */
	visit: number;
}

const win = (): Window | null => (IS_GPUIX ? null : (globalThis.window ?? null));

let mode: Mode = 'memory';
let started = false;
let patterns: readonly string[] = [];
let hooks: Hook[] = [];
// Memory mode's stack; in a browser the history API holds the entries and only the position is kept here.
let stack: Entry[] = [{ href: '/', state: undefined }];
let index = 0;
let length = 1;
// The current entry's `visit`, and the highest one handed out, seeded from the clock so a reload never reuses one.
let visit = 0;
let visits = 0;
let generation = 0;
let current: Route = describe('/', undefined);
let swallow_pops = 0;

let notify = () => {};
const subscribe = createSubscriber((update) => {
	notify = update;
	return () => {
		notify = () => {};
	};
});

function normalize(pathname: string): string {
	const slashed = pathname.startsWith('/') ? pathname : `/${pathname}`;
	return slashed.length > 1 && slashed.endsWith('/') ? slashed.slice(0, -1) : slashed;
}

// Declarations, since `current` above is described at module load, before any `const` here is initialised.
function segments(path: string): string[] {
	return path.split('/').filter(Boolean);
}

/** A malformed escape (`/items/100%`) is a deep link someone typed, not a reason to throw out of the Router. */
function decode(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

/**
 * The pattern a pathname matches, with its params decoded. Where two patterns fit, the one with a literal
 * at the earliest position where they differ wins, whatever the table order, so `/items/new` beats
 * `/items/:id`; `*` catches the rest.
 */
export function match(patterns: readonly string[], pathname: string): { pattern: string; params: Record<string, string> } | null {
	const parts = segments(normalize(pathname)).map(decode);
	let best: { pattern: string; params: Record<string, string>; shape: number[] } | null = null;
	for (const pattern of patterns) {
		if (pattern === '*') continue;
		const shape = segments(pattern);
		if (shape.length !== parts.length) continue;
		const params: Record<string, string> = {};
		const literals: number[] = [];
		let ok = true;
		for (let i = 0; i < shape.length && ok; i++) {
			if (shape[i].startsWith(':')) {
				params[shape[i].slice(1)] = parts[i];
				literals.push(0);
			} else if (shape[i] === parts[i]) literals.push(1);
			else ok = false;
		}
		if (ok && (best === null || literals.join('') > best.shape.join(''))) best = { pattern, params, shape: literals };
	}
	if (best) return { pattern: best.pattern, params: best.params };
	return patterns.includes('*') ? { pattern: '*', params: {} } : null;
}

function describe(given: string, state: unknown): Route {
	// A fragment is the browser's, and no part of the route.
	const href = given.split('#')[0];
	const at = href.indexOf('?');
	const path = normalize(at === -1 ? href : href.slice(0, at));
	const search = at === -1 ? '' : href.slice(at + 1);
	const query = Object.fromEntries(new URLSearchParams(search));
	const found = match(patterns, path);
	return { path, href: search ? `${path}?${search}` : path, query, params: found?.params ?? {}, pattern: found?.pattern ?? null, state };
}

/** A path for a pattern and its params, URL-encoded, plus an optional query: `href('/items/:id', { id: 3 })`. */
export function href<P extends string>(pattern: P, params: Params<P>, query?: Record<string, string | number | boolean | null | undefined>): string {
	const values = params as Record<string, string | number>;
	const path = pattern.replace(/:([^/]+)/g, (_, name: string) => {
		if (!(name in values)) throw new Error(`[gpuix-svelte-ui] href('${pattern}') needs a '${name}' param`);
		return encodeURIComponent(String(values[name]));
	});
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(query ?? {})) if (value != null) search.set(key, String(value));
	const text = search.toString();
	return text ? `${path}?${text}` : path;
}

/** The current route and the stack's position, reactive wherever a template or effect reads them. */
export const router = {
	get path() {
		subscribe();
		return current.path;
	},
	get href() {
		subscribe();
		return current.href;
	},
	get query() {
		subscribe();
		return current.query;
	},
	get params() {
		subscribe();
		return current.params;
	},
	get pattern() {
		subscribe();
		return current.pattern;
	},
	get state() {
		subscribe();
		return current.state;
	},
	get can_go_back() {
		subscribe();
		return index > 0;
	},
	get can_go_forward() {
		subscribe();
		return index < length - 1;
	},
	/** Counts navigations, so a screen can be keyed on it and mount fresh for each one. */
	get generation() {
		subscribe();
		return generation;
	},
	get mode() {
		subscribe();
		return mode;
	}
};

const read_location = (w: Window) => (mode === 'hash' ? w.location.hash.slice(1) || '/' : w.location.pathname + w.location.search);
const url_for = (route_href: string) => (mode === 'hash' ? `#${route_href}` : route_href);
const saved_in = (w: Window): Saved | undefined => (w.history.state as { __ui?: Saved } | null)?.__ui;

// A replacement merges into whatever state the entry already carries, since a SvelteKit page keeps its own
// there; without a URL it only stamps the entry, and the address bar keeps what it says, fragment included.
function save(w: Window, replace: boolean, url: string | undefined, at: Saved) {
	const kept = replace ? (w.history.state as Record<string, unknown> | null) : null;
	w.history[replace ? 'replaceState' : 'pushState']({ ...kept, __ui: at }, '', url);
}

function guard(to: Route): boolean | string {
	for (const hook of hooks.slice()) {
		const verdict = hook(to, current);
		if (verdict === false || typeof verdict === 'string') return verdict;
	}
	return true;
}

function arrive(to: Route) {
	current = to;
	generation++;
	notify();
}

/** `<Router>` registers its table's patterns here, so `router.params` reads right anywhere. */
export function use_routes(table: readonly string[]) {
	patterns = table;
	current = describe(current.href, current.state);
	notify();
}

/**
 * Called by `<Router>` once per process; a later call (a hot-reload remount) keeps the current screen. In a
 * browser the position lives in each history entry's state, so back and forward keep the flags right, a
 * reload included. The `before` hooks do not run for this first screen: nothing has registered them yet.
 */
export function start_router({ mode: wanted = 'history', initial = '/' }: { mode?: Mode; initial?: string } = {}) {
	if (started) return;
	started = true;
	const w = win();
	mode = w && wanted !== 'memory' ? wanted : 'memory';
	if (!w || mode === 'memory') {
		stack = [{ href: initial, state: undefined }];
		index = 0;
		length = 1;
		current = describe(initial, undefined);
	} else {
		const saved = saved_in(w);
		index = saved?.index ?? 0;
		length = Math.max(index + 1, saved?.length ?? 0);
		visits = Math.max(Date.now(), saved?.visit ?? 0);
		visit = saved?.visit ?? ++visits;
		current = describe(read_location(w), saved?.state);
		// In history mode the address bar already says where this is, so the entry is stamped and the URL left alone.
		if (!saved) save(w, true, mode === 'hash' ? url_for(current.href) : undefined, { index, length, state: undefined, visit });
		w.addEventListener('popstate', on_pop);
	}
	notify();
}

/** Undoes `start_router`, for a test that switches modes; an app never needs it. */
export function stop_router() {
	if (!started) return;
	started = false;
	win()?.removeEventListener('popstate', on_pop);
	hooks = [];
	mode = 'memory';
}

/** Returns false when a hook cancelled it; a hook's redirect navigates there instead, with the same options. */
export function navigate(path: string, { replace = false, state = undefined }: NavigateOptions = {}): boolean {
	const to = describe(path, state);
	const verdict = guard(to);
	if (verdict === false) return false;
	if (typeof verdict === 'string') return navigate(verdict, { replace, state });

	const entry: Entry = { href: to.href, state };
	const w = win();
	if (mode === 'memory' || !w) {
		if (replace) stack[index] = entry;
		else {
			stack = [...stack.slice(0, index + 1), entry];
			index++;
		}
		length = stack.length;
	} else {
		// A replacement keeps the browser's forward entries; only a push cuts them off. The position moves once
		// the history API has taken the entry, since a state it cannot clone makes it throw.
		const at = replace ? index : index + 1;
		const count = replace ? length : at + 1;
		// Only history mode's URL has room for a fragment; a hash route is one already.
		const fragment = mode === 'history' && path.includes('#') ? path.slice(path.indexOf('#')) : '';
		save(w, replace, url_for(to.href) + fragment, { index: at, length: count, state, visit: visits + 1 });
		index = at;
		length = count;
		visit = ++visits;
	}
	arrive(to);
	return true;
}

function on_pop() {
	if (swallow_pops > 0) {
		swallow_pops--;
		return;
	}
	const w = win()!;
	const saved = saved_in(w);
	// An entry without a position was not ours: a hash edited in the address bar, a plain fragment link. It
	// joins the stack as a push, and gets its position so the next pop can find its way back.
	const foreign = saved === undefined;
	const to_index = foreign ? index + 1 : saved.index;
	const to = describe(read_location(w), saved?.state);
	// An entry carrying this one's own position is this entry again (a popstate dispatched by hand), where
	// nothing moved, or a copy of its state other code pushed for another URL.
	const beside = !foreign && to_index === index;
	if (beside && to.href === current.href) return;
	const count = foreign ? to_index + 1 : Math.max(length, to_index + 1);
	// An entry made before a later push still carries the stack's old length, which a reload would read, so
	// it is stamped again on arrival.
	const stale = foreign || saved.length !== count;
	// A fragment link in history mode, and the way back from one, show the same screen: nothing navigates.
	if (mode === 'history' && to.href === current.href && (foreign || saved.visit === visit)) {
		index = to_index;
		length = count;
		if (stale) save(w, true, undefined, { index, length, state: current.state, visit });
		notify();
		return;
	}
	const verdict = guard(to);
	// A copy sits on one side of its original or the other with no telling which, so that move cannot be undone and stands.
	if (verdict === false && !beside) {
		// The browser already moved, so it is moved back, and that move is not a navigation either.
		swallow_pops++;
		if (foreign) w.history.back();
		else w.history.go(index - to_index);
		return;
	}
	index = to_index;
	length = count;
	visit = foreign ? ++visits : saved.visit;
	if (stale) save(w, true, foreign && mode === 'hash' ? url_for(to.href) : undefined, { index, length, state: to.state, visit });
	arrive(to);
	if (typeof verdict === 'string') navigate(verdict, { replace: true });
}

function step(delta: 1 | -1) {
	if (delta < 0 ? index <= 0 : index >= length - 1) return;
	const w = win();
	if (mode !== 'memory' && w) {
		w.history.go(delta);
		return;
	}
	const next = index + delta;
	const to = describe(stack[next].href, stack[next].state);
	const verdict = guard(to);
	if (verdict === false) return;
	index = next;
	arrive(to);
	if (typeof verdict === 'string') navigate(verdict, { replace: true });
}

export const back = () => step(-1);
export const forward = () => step(1);

/** Runs before every navigation, `navigate()`, a `<Link>`, `back()` and the browser's buttons alike; returns the unsubscribe. */
export function before(hook: Hook): () => void {
	hooks.push(hook);
	return () => {
		hooks = hooks.filter((h) => h !== hook);
	};
}
