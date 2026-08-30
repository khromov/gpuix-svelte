/**
 * Registered via `bunfig.toml`'s `preload` so it is in place before the entry
 * module resolves.
 */

import { plugin } from 'bun';
import { compile_svelte } from './compile.js';

export { RENDERER_MODULE } from './compile.js';

plugin({
	name: 'gpuix-svelte',
	setup(build) {
		// Bun keeps `render_hot`'s `?v=N` cache-buster in `args.path`, so strip it
		// before touching the filesystem.
		build.onLoad({ filter: /\.svelte(\?.*)?$/ }, (args) => {
			const path = args.path.replace(/\?.*$/, '');
			const query = args.path.slice(path.length);

			return { contents: compile_svelte(path, query), loader: 'js' };
		});
	}
});
