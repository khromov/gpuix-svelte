/**
 * `experimental.customRenderer` is what makes the compiler emit
 * `import $renderer from 'gpuix-svelte/renderer'` and wrap the component in
 * `$.push_renderer($renderer)`.
 */

import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';

/**
 * The compiler bakes this into every component's `import $renderer from '...'`,
 * which must resolve from the `.svelte` file's own location — so components
 * outside this workspace need the override to supply an absolute path.
 */
export const RENDERER_MODULE = process.env.GPUIX_SVELTE_RENDERER || 'gpuix-svelte/renderer';

/**
 * @param {string} path absolute path to a `.svelte` file
 * @param {string} [query] the `?v=N` cache-buster `render_hot` appends, if any
 * @returns {string} compiled client-side JS
 */
export function compile_svelte(path, query) {
	const { js, warnings } = compile(readFileSync(path, 'utf8'), {
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
	return query
		? js.code.replace(/(from\s*['"])([^'"]+\.svelte)(['"])/g, `$1$2${query}$3`)
		: js.code;
}
