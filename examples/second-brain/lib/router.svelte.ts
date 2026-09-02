/**
 * A desktop app wants a back stack, not a URL bar. Routes are `/path` strings with
 * `:params` and a `?query`; this module is loaded once, so the stack survives a
 * hot remount.
 */

import type { Component } from 'svelte';

/** The current location. */
export interface Route {
	path: string;
	params: Record<string, string>;
	query: Record<string, string>;
}

/** One entry of the route table `RouteView` resolves against. */
export interface RouteEntry {
	path: string;
	load: () => Promise<{ default: Component<any, any, any> }>;
	props?: Record<string, unknown>;
	title: string;
}

export const route = $state<Route>({ path: '/', params: {}, query: {} });

const stack = $state<string[]>([]);

function parse(href: string): { path: string; query: Record<string, string> } {
	const [path, qs = ''] = href.split('?');
	return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

const href_of = () => {
	const qs = new URLSearchParams(route.query).toString();
	return qs ? `${route.path}?${qs}` : route.path;
};

function apply(href: string) {
	const { path, query } = parse(href);
	route.path = path;
	route.query = query;
}

export function push(href: string) {
	if (href === href_of()) return;
	stack.push(href_of());
	apply(href);
}

export function replace(href: string) {
	apply(href);
}

export function back() {
	apply(stack.pop() ?? '/');
}

export const can_back = () => stack.length > 0;

export function resolve<T>(routes: Array<T & { path: string }>, path: string): { route: T & { path: string }; params: Record<string, string> } {
	const segments = path.split('/').filter(Boolean);
	for (const r of routes) {
		if (r.path === '*') continue;
		const pattern = r.path.split('/').filter(Boolean);
		if (pattern.length !== segments.length) continue;
		const params: Record<string, string> = {};
		const ok = pattern.every((p, i) => {
			if (p.startsWith(':')) {
				params[p.slice(1)] = decodeURIComponent(segments[i]);
				return true;
			}
			return p === segments[i];
		});
		if (ok) return { route: r, params };
	}
	return { route: routes.find((r) => r.path === '*') ?? routes[0], params: {} };
}

if (process.env.GPUIX_BRAIN_START) apply(process.env.GPUIX_BRAIN_START);
