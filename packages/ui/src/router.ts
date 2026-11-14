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
	/** The pathname, without the query, percent-encoded as a URL has it. */
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

/** A screen loaded on first use by `lazy()`; `loaded` holds it once it has. */
export interface LazyScreen {
	load(): Promise<AnyComponent>;
	loaded: AnyComponent | null;
}

/** A screen is a component, a snippet wrapped by `screen()` for an app that keeps its screens in one file, or a `lazy()` import. */
export type Screen = AnyComponent | { render: Snippet<[RouteProps]> } | LazyScreen;
export type RouteTable = Record<string, Screen>;

// Taken as a plain function, since an app's markup snippets are typed against its own copy of svelte, which need not be the one this package's declarations resolve.
export const screen = (render: (props: RouteProps) => unknown): Screen => ({ render: render as Snippet<[RouteProps]> });

/** A screen imported on first visit: `lazy(() => import('./Settings.svelte'))`. A failed import is logged and tried again on the next visit. */
export function lazy(load: () => Promise<{ default: AnyComponent }>): Screen {
	let loading: Promise<AnyComponent> | undefined;
	const entry: LazyScreen = {
		loaded: null,
		load: () =>
			(loading ??= load().then(
				(module) => (entry.loaded = module.default),
				(error: unknown) => {
					loading = undefined;
					console.error('[gpuix-svelte-ui] a lazy() screen failed to load', error);
					throw error;
				}
			))
	};
	return entry;
}

/** The params a pattern names: `'/items/:id/:tab'` gives `{ id, tab }`, and a trailing `/*` adds `'*'`. */
export type Params<P extends string> = P extends `${infer Head}/*`
	? { '*': string | number } & Params<Head>
	: P extends `${string}:${infer Name}/${infer Rest}`
		? { [K in Name]: string | number } & Params<`/${Rest}`>
		: P extends `${string}:${infer Name}`
			? { [K in Name]: string | number }
			: Record<never, never>;

export type NavigateOptions = { replace?: boolean; state?: unknown };

export type Verdict = boolean | string | void;

/** False cancels the navigation, a string redirects it, anything else lets it through; a promise of one is waited for. */
export type Hook = (to: Route, from: Route) => Verdict | Promise<Verdict>;

export type AfterHook = (to: Route, from: Route) => void;

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

const MAX_REDIRECTS = 10;

const win = (): Window | null => (IS_GPUIX ? null : (globalThis.window ?? null));

let mode: Mode = 'memory';
let base = '';
let started = false;
let patterns: readonly string[] = [];
let hooks: Hook[] = [];
let afters: AfterHook[] = [];
// Memory mode's stack; in a browser the history API holds the entries and only the position is kept here.
let stack: Entry[] = [{ href: '/', state: undefined }];
// Where the browser is, which runs ahead of `shown` (the entry `current` came from) while a hook decides on a back or forward.
let index = 0;
let shown = 0;
let length = 1;
// The current entry's `visit`, and the highest one handed out, seeded from the clock so a reload never reuses one.
let visit = 0;
let visits = 0;
let generation = 0;
let current: Route = describe('/', undefined);
let swallow_pops = 0;
// Every navigation takes a ticket, and one whose hooks answer after a newer one took its own is dropped.
let ticket = 0;
let pending: Route | null = null;
let ready = true;

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
 * `/items/:id`; a trailing `/*` takes the rest of the path as `params['*']`, below any pattern that names
 * those segments; a bare `*` catches what nothing else does.
 */
export function match(patterns: readonly string[], pathname: string): { pattern: string; params: Record<string, string> } | null {
	const raw = segments(normalize(pathname));
	const parts = raw.map(decode);
	let best: { pattern: string; params: Record<string, string>; rank: string } | null = null;
	for (const pattern of patterns) {
		if (pattern === '*') continue;
		const shape = segments(pattern);
		const rest = shape.at(-1) === '*';
		const fixed = rest ? shape.length - 1 : shape.length;
		if (rest ? parts.length < fixed : parts.length !== fixed) continue;
		const params: Record<string, string> = {};
		let rank = '';
		let ok = true;
		for (let i = 0; i < fixed && ok; i++) {
			if (shape[i].startsWith(':')) {
				params[shape[i].slice(1)] = parts[i];
				rank += '1';
			} else if (shape[i] === parts[i]) rank += '2';
			else ok = false;
		}
		if (!ok) continue;
		if (rest) params['*'] = parts.slice(fixed).join('/');
		rank += '0'.repeat(parts.length - fixed) + (rest ? '0' : '1');
		if (best === null || rank > best.rank) best = { pattern, params, rank };
	}
	if (best) return { pattern: best.pattern, params: best.params };
	return patterns.includes('*') ? { pattern: '*', params: {} } : null;
}

/** Resolves `given` the way a link on a page at `against` would, so `edit`, `../list` and `?page=2` work. */
function describe(given: string, state: unknown, against = '/'): Route {
	let pathname: string;
	let search: string;
	try {
		const url = new URL(given, `http://route${against.startsWith('/') ? against : '/'}`);
		pathname = url.pathname;
		search = url.search.slice(1);
	} catch {
		const href = given.split('#')[0];
		const at = href.indexOf('?');
		pathname = at === -1 ? href : href.slice(0, at);
		search = at === -1 ? '' : href.slice(at + 1);
	}
	const path = normalize(pathname);
	const query = Object.fromEntries(new URLSearchParams(search));
	const found = match(patterns, path);
	return { path, href: search ? `${path}?${search}` : path, query, params: found?.params ?? {}, pattern: found?.pattern ?? null, state };
}

type QueryValue = string | number | boolean | null | undefined;

/** A path for a pattern and its params, URL-encoded, plus an optional query whose arrays repeat their key: `href('/items/:id', { id: 3 })`. */
export function href<P extends string>(pattern: P, params: Params<P>, query?: Record<string, QueryValue | readonly QueryValue[]>): string {
	const values = params as Record<string, string | number>;
	const need = (name: string) => {
		if (!(name in values)) throw new Error(`[gpuix-svelte-ui] href('${pattern}') needs a '${name}' param`);
		return String(values[name]);
	};
	const path = pattern
		.replace(/\/\*$/, () => `/${need('*').split('/').map(encodeURIComponent).join('/')}`)
		.replace(/:([^/]+)/g, (_, name: string) => encodeURIComponent(need(name)));
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(query ?? {})) {
		for (const one of Array.isArray(value) ? value : [value]) if (one != null) search.append(key, String(one));
	}
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
	/** The query with every value of a repeated key: `router.search.getAll('tag')`. */
	get search() {
		subscribe();
		const at = current.href.indexOf('?');
		return new URLSearchParams(at === -1 ? '' : current.href.slice(at + 1));
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
	},
	/** Where a navigation is headed while an async `before` hook decides on it, null otherwise. */
	get navigating() {
		subscribe();
		return pending;
	},
	/** False only while async hooks decide on the first screen, which the Router holds back until they have. */
	get ready() {
		subscribe();
		return ready;
	}
};

const strip = (pathname: string) => (base && (pathname === base || pathname.startsWith(`${base}/`)) ? pathname.slice(base.length) || '/' : pathname);
const read_location = (w: Window) => (mode === 'hash' ? w.location.hash.slice(1) || '/' : strip(w.location.pathname) + w.location.search);
const url_for = (route_href: string) => (mode === 'hash' ? `#${route_href}` : base + route_href);
const saved_in = (w: Window): Saved | undefined => (w.history.state as { __ui?: Saved } | null)?.__ui;
// Only history mode's URL has room for a fragment; a hash route is one already.
const fragment_of = (path: string) => (mode === 'history' && path.includes('#') ? path.slice(path.indexOf('#')) : '');

/** `path` resolved against the current route, as `navigate()` would take it. */
export function resolve(path: string): Route {
	subscribe();
	return describe(path, undefined, current.href);
}

/** The address bar's text for a path: with the base in history mode, after `#` in hash mode. */
export function to_url(path: string): string {
	subscribe();
	return url_for(resolve(path).href) + fragment_of(path);
}

// A replacement merges into whatever state the entry already carries, since a SvelteKit page keeps its own
// there; without a URL it only stamps the entry, and the address bar keeps what it says, fragment included.
function save(w: Window, replace: boolean, url: string | undefined, at: Saved) {
	const kept = replace ? (w.history.state as Record<string, unknown> | null) : null;
	w.history[replace ? 'replaceState' : 'pushState']({ ...kept, __ui: at }, '', url);
}

const thenable = (value: unknown): value is PromiseLike<unknown> => typeof (value as { then?: unknown } | null)?.then === 'function';

function refused(error: unknown): false {
	console.error('[gpuix-svelte-ui] a before() hook threw, so the navigation is cancelled', error);
	return false;
}

/** The hooks' verdict, at once while every hook answers synchronously and as a promise from the first one that does not. */
function guard(to: Route, from: Route, list = hooks.slice(), at = 0): boolean | string | Promise<boolean | string> {
	for (let i = at; i < list.length; i++) {
		let verdict: unknown;
		try {
			verdict = list[i](to, from);
		} catch (error) {
			return refused(error);
		}
		if (thenable(verdict)) {
			return Promise.resolve(verdict).then((v) => (v === false || typeof v === 'string' ? v : guard(to, from, list, i + 1)), refused);
		}
		if (verdict === false || typeof verdict === 'string') return verdict;
	}
	return true;
}

function take_ticket(): number {
	if (pending) {
		pending = null;
		notify();
	}
	return ++ticket;
}

/** Runs `then` with the verdict unless a newer navigation started meanwhile, a hook's own `navigate()` included. */
function decide(to: Route, then: (verdict: boolean | string) => boolean | Promise<boolean>): Promise<boolean> {
	const mine = take_ticket();
	const verdict = guard(to, current);
	if (!thenable(verdict)) return Promise.resolve(mine === ticket && then(verdict));
	pending = to;
	notify();
	return verdict.then((v) => {
		if (mine !== ticket) return false;
		pending = null;
		notify();
		return then(v);
	});
}

function arrive(to: Route) {
	const from = current;
	current = to;
	shown = index;
	generation++;
	notify();
	for (const hook of afters.slice()) {
		try {
			hook(to, from);
		} catch (error) {
			console.error('[gpuix-svelte-ui] an after() hook threw', error);
		}
	}
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
 * reload included. The `before` hooks registered by then run for the first screen too, where a redirect
 * replaces it and `false` has nothing to stay on, so the first screen shows.
 */
export function start_router({ mode: wanted = 'history', initial = '/', base: prefix = '' }: { mode?: Mode; initial?: string; base?: string } = {}) {
	if (started) return;
	started = true;
	const w = win();
	mode = w && wanted !== 'memory' ? wanted : 'memory';
	base = mode === 'history' ? normalize(prefix).replace(/^\/$/, '') : '';
	if (!w || mode === 'memory') {
		current = describe(initial, undefined);
		stack = [{ href: current.href, state: undefined }];
		index = 0;
		length = 1;
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
	shown = index;
	notify();
	ready = false;
	void decide(current, (verdict) => {
		ready = true;
		notify();
		return typeof verdict === 'string' ? go_to(verdict, { replace: true }, 1) : true;
	}).then((arrived) => {
		// Superseded by a navigation made while the hooks decided, which shows a screen of its own.
		if (!ready && !arrived) {
			ready = true;
			notify();
		}
	});
}

/** Undoes `start_router`, for a test that switches modes; an app never needs it. */
export function stop_router() {
	if (!started) return;
	started = false;
	win()?.removeEventListener('popstate', on_pop);
	hooks = [];
	afters = [];
	mode = 'memory';
	base = '';
	pending = null;
	ready = true;
	ticket++;
}

/**
 * Resolves true once the route has arrived, false when a hook cancelled it or a newer navigation overtook
 * it; with synchronous hooks it has arrived by the time this returns. A hook's redirect navigates there
 * instead, with the same options.
 */
export function navigate(path: string, options: NavigateOptions = {}): Promise<boolean> {
	return go_to(path, options, 0);
}

function go_to(path: string, { replace = false, state = undefined }: NavigateOptions, hops: number): Promise<boolean> {
	if (hops > MAX_REDIRECTS) {
		console.error(`[gpuix-svelte-ui] the before() hooks redirected more than ${MAX_REDIRECTS} times, last to ${path}, so the navigation is cancelled`);
		return Promise.resolve(false);
	}
	const to = describe(path, state, current.href);
	// A browser turns a link to the page it is on into a replacement, never a second entry.
	const again = to.href === current.href && state === undefined;
	if (again) to.state = current.state;
	return decide(to, (verdict) => {
		if (verdict === false) return false;
		if (typeof verdict === 'string') return go_to(verdict, { replace, state }, hops + 1);
		commit(to, path, replace || again);
		return true;
	});
}

function commit(to: Route, path: string, replace: boolean) {
	const w = win();
	if (mode === 'memory' || !w) {
		const entry: Entry = { href: to.href, state: to.state };
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
		save(w, replace, url_for(to.href) + fragment_of(path), { index: at, length: count, state: to.state, visit: visits + 1 });
		index = at;
		length = count;
		visit = ++visits;
	}
	arrive(to);
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
	// it is stamped again, now, while it is still the entry the page is on.
	const stale = foreign || saved.length !== count;
	// A fragment link in history mode, and the way back from one, show the same screen: nothing navigates.
	if (mode === 'history' && to.href === current.href && (foreign || saved.visit === visit)) {
		index = shown = to_index;
		length = count;
		if (stale) save(w, true, undefined, { index, length, state: current.state, visit });
		notify();
		return;
	}
	const back_to = shown;
	const arrival = foreign ? ++visits : saved.visit;
	index = to_index;
	length = count;
	if (stale) save(w, true, foreign && mode === 'hash' ? url_for(to.href) : undefined, { index, length, state: to.state, visit: arrival });
	notify();
	void decide(to, (verdict) => {
		// A copy sits on one side of its original or the other with no telling which, so that move cannot be undone and stands.
		if (verdict === false && !beside) {
			// The browser already moved, so it is moved back, and that move is not a navigation either.
			swallow_pops++;
			w.history.go(back_to - index);
			index = back_to;
			notify();
			return false;
		}
		visit = arrival;
		arrive(to);
		return typeof verdict === 'string' ? go_to(verdict, { replace: true }, 1) : true;
	});
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
	void decide(to, (verdict) => {
		if (verdict === false) return false;
		index = next;
		arrive(to);
		return typeof verdict === 'string' ? go_to(verdict, { replace: true }, 1) : true;
	});
}

export const back = () => step(-1);
export const forward = () => step(1);

/**
 * Runs before every navigation, `navigate()`, a `<Link>`, `back()`, the browser's buttons and the first
 * screen alike; returns the unsubscribe. Hooks run in order, each waited for when it returns a promise.
 */
export function before(hook: Hook): () => void {
	hooks.push(hook);
	return () => {
		hooks = hooks.filter((h) => h !== hook);
	};
}

/** Runs after every arrival, for a title, analytics or focus; returns the unsubscribe. */
export function after(hook: AfterHook): () => void {
	afters.push(hook);
	return () => {
		afters = afters.filter((h) => h !== hook);
	};
}
