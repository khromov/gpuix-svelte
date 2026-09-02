/**
 * Registered via `bunfig.toml`'s `preload` so it is in place before the entry
 * module resolves. `Bun.build` ignores runtime registrations, so the load hook
 * is also exported for `scripts/compile.js` to wire up itself.
 */

import { plugin } from 'bun';
import { compile_module, compile_svelte } from './compile.js';

export { RENDERER_MODULE } from './compile.js';

// Bun keeps `render_hot`'s `?v=N` cache-buster in `args.path`, so strip it
// before touching the filesystem.
export function load_svelte(args) {
	const path = args.path.replace(/\?.*$/, '');
	const query = args.path.slice(path.length);

	return { contents: compile_svelte(path, query), loader: 'js' };
}

export function load_module(args) {
	return { contents: compile_module(args.path.replace(/\?.*$/, '')), loader: 'js' };
}

plugin({
	name: 'gpuix-svelte',
	setup(build) {
		build.onLoad({ filter: /\.svelte\.js(\?.*)?$/ }, load_module);
		build.onLoad({ filter: /\.svelte(\?.*)?$/ }, load_svelte);
	}
});
