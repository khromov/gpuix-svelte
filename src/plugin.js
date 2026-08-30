/**
 * Bun loader for `.svelte` files.
 *
 * Registered via `bunfig.toml`'s `preload` so it is in place before the entry
 * module resolves. `experimental.customRenderer` is what makes the compiler
 * emit `import $renderer from 'gpuix-svelte/renderer'` and wrap the component
 * in `$.push_renderer($renderer)`.
 *
 * Reloading is driven by `render_hot`, not `bun --hot` — see render.js.
 */

import { plugin } from 'bun';
import { compile } from 'svelte/compiler';

/**
 * The compiler bakes this into every component's `import $renderer from '...'`,
 * which must resolve from the `.svelte` file's own location — so components
 * outside this workspace need the override to supply an absolute path.
 */
export const RENDERER_MODULE = process.env.GPUIX_SVELTE_RENDERER || 'gpuix-svelte/renderer';

plugin({
	name: 'gpuix-svelte',
	setup(build) {
		// The `?v=` tail is how `render_hot` busts Bun's module cache — Bun keeps
		// the query in `args.path`, so strip it before touching the filesystem.
		build.onLoad({ filter: /\.svelte(\?.*)?$/ }, async (args) => {
			const path = args.path.replace(/\?.*$/, '');
			const source = await Bun.file(path).text();

			const { js, warnings } = compile(source, {
				filename: path,
				generate: 'client',
				runes: true,
				experimental: { customRenderer: RENDERER_MODULE }
			});

			for (const warning of warnings) {
				console.warn(`[gpuix-svelte] ${path}: ${warning.message}`);
			}

			// Propagate the cache-buster to child components, or a reload would
			// re-instantiate the root against stale children.
			const query = args.path.slice(path.length);
			const code = query
				? js.code.replace(/(from\s*['"])([^'"]+\.svelte)(['"])/g, `$1$2${query}$3`)
				: js.code;

			return { contents: code, loader: 'js' };
		});
	}
});
