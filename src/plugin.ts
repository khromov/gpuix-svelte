/**
 * Preloaded (`--preload gpuix-svelte/plugin` from the bin, or `bunfig.toml`'s `preload`) so
 * it is in place before the entry module resolves. `Bun.build` ignores runtime registrations,
 * so the hooks are also exported for a build script to wire up itself.
 */

import { plugin, type OnLoadArgs, type OnLoadResult } from 'bun';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { compile_module, compile_svelte, WRONG_SVELTE } from './compile.ts';

export { RENDERER_MODULE } from './compile.ts';

// `compileModule` does not strip types, so a `.svelte.ts` goes through Bun's transpiler first.
const transpiler = new Bun.Transpiler({ loader: 'ts' });

/** What a reload evaluates again; a package component is not what is being edited. */
const reloads = (path: string) => path.endsWith('.svelte') && !path.includes('node_modules');

let reloading = false;

// Older Bun kept `render_hot`'s `?v=N` cache-buster in `args.path`, so strip it before touching
// the filesystem; 1.4.4 drops it, and `invalidate_svelte` below empties `require.cache` instead.
export function load_svelte(args: OnLoadArgs): OnLoadResult {
	const path = args.path.replace(/\?.*$/, '');
	const query = args.path.slice(path.length);

	return { contents: compile_svelte(path, query, query !== '' || (reloading && reloads(path))), loader: 'js' };
}

export function load_module(args: OnLoadArgs): OnLoadResult {
	const path = args.path.replace(/\?.*$/, '');
	const source = path.endsWith('.ts') ? transpiler.transformSync(readFileSync(path, 'utf8')) : undefined;

	return { contents: compile_module(path, source), loader: 'js' };
}

// The ESM loader finds its `.node` through `createRequire(import.meta.url)`, which
// `Bun.build` can't trace, so a compiled binary would ship without the addon.
export const resolve_native_cjs = () => ({ path: createRequire(import.meta.url).resolve('@gpuix/native') });

/** `render_hot`'s reload: Bun re-evaluates a module dropped from `require.cache`, whatever the import's query. */
function invalidate_svelte() {
	reloading = true;
	const cache = createRequire(import.meta.url).cache;
	for (const key of Object.keys(cache)) {
		if (reloads(key)) delete cache[key];
	}
}

(globalThis as Record<symbol, unknown>)[Symbol.for('gpuix-svelte.invalidate')] = invalidate_svelte;

try {
	Bun.resolveSync('svelte/renderer', import.meta.dir);
} catch {
	throw new Error(WRONG_SVELTE);
}

plugin({
	name: 'gpuix-svelte',
	setup(build) {
		build.onLoad({ filter: /\.svelte\.[jt]s(\?.*)?$/ }, load_module);
		build.onLoad({ filter: /\.svelte(\?.*)?$/ }, load_svelte);
	}
});
