/**
 * Registered via `bunfig.toml`'s `preload` so it is in place before the entry
 * module resolves. `Bun.build` ignores runtime registrations, so the load hook
 * is also exported for `scripts/compile.ts` to wire up itself.
 */

import { plugin, type OnLoadArgs, type OnLoadResult } from 'bun';
import { readFileSync } from 'node:fs';
import { compile_module, compile_svelte } from './compile.ts';

export { RENDERER_MODULE } from './compile.ts';

// `compileModule` does not strip types, so a `.svelte.ts` goes through Bun's transpiler first.
const transpiler = new Bun.Transpiler({ loader: 'ts' });

// Bun keeps `render_hot`'s `?v=N` cache-buster in `args.path`, so strip it
// before touching the filesystem.
export function load_svelte(args: OnLoadArgs): OnLoadResult {
	const path = args.path.replace(/\?.*$/, '');
	const query = args.path.slice(path.length);

	return { contents: compile_svelte(path, query), loader: 'js' };
}

export function load_module(args: OnLoadArgs): OnLoadResult {
	const path = args.path.replace(/\?.*$/, '');
	const source = path.endsWith('.ts') ? transpiler.transformSync(readFileSync(path, 'utf8')) : undefined;

	return { contents: compile_module(path, source), loader: 'js' };
}

plugin({
	name: 'gpuix-svelte',
	setup(build) {
		build.onLoad({ filter: /\.svelte\.[jt]s(\?.*)?$/ }, load_module);
		build.onLoad({ filter: /\.svelte(\?.*)?$/ }, load_svelte);
	}
});
