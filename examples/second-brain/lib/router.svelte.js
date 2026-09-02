/**
 * A desktop app wants a back stack, not a URL bar. Routes are `/path` strings with
 * `:params` and a `?query`; this module is loaded once, so the stack survives a
 * hot remount.
 */

export const route = $state({ path: '/', params: {}, query: {} });

const stack = [];

function parse(href) {
	const [path, qs = ''] = href.split('?');
	return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

const href_of = () => {
	const qs = new URLSearchParams(route.query).toString();
	return qs ? `${route.path}?${qs}` : route.path;
};

function apply(href) {
	const { path, query } = parse(href);
	route.path = path;
	route.query = query;
}

export function push(href) {
	if (href === href_of()) return;
	stack.push(href_of());
	apply(href);
}

export function replace(href) {
	apply(href);
}

export function back() {
	apply(stack.pop() ?? '/');
}

export const can_back = () => stack.length > 0;

/**
 * @template T
 * @param {Array<T & { path: string }>} routes
 * @param {string} path
 * @returns {{ route: T & { path: string }, params: Record<string, string> }}
 */
export function resolve(routes, path) {
	const segments = path.split('/').filter(Boolean);
	for (const r of routes) {
		if (r.path === '*') continue;
		const pattern = r.path.split('/').filter(Boolean);
		if (pattern.length !== segments.length) continue;
		const params = {};
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
