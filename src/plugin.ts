/**
 * Registered via `bunfig.toml`'s `preload` so it is in place before the entry
 * module resolves. `Bun.build` ignores runtime registrations, so the load hook
 * is also exported for `scripts/compile.ts` to wire up itself.
 */

import { plugin, type OnLoadArgs, type OnLoadResult, type PluginBuilder } from 'bun';
import { readFileSync } from 'node:fs';
import { compile_module, compile_svelte, WRONG_SVELTE } from './compile.ts';

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

/**
 * svelte is bundled inside this package, but a runtime `onResolve` never sees a bare
 * specifier, so each of svelte's entry points becomes a virtual module re-exporting the
 * copy that resolves from here — the same instance the renderer itself imports.
 */
function pin_svelte(build: PluginBuilder) {
	let manifest: { exports: Record<string, string | Record<string, string>> };
	try {
		manifest = JSON.parse(readFileSync(Bun.resolveSync('svelte/package.json', import.meta.dir), 'utf8'));
		Bun.resolveSync('svelte/renderer', import.meta.dir);
	} catch {
		throw new Error(WRONG_SVELTE);
	}

	for (const [key, target] of Object.entries(manifest.exports)) {
		if (typeof target === 'string' || Object.keys(target).every((condition) => condition === 'types')) continue;
		const specifier = key === '.' ? 'svelte' : `svelte/${key.slice(2)}`;
		build.module(specifier, () => ({
			contents: `export * from ${JSON.stringify(Bun.resolveSync(specifier, import.meta.dir))};`,
			loader: 'js'
		}));
	}
}

plugin({
	name: 'gpuix-svelte',
	setup(build) {
		pin_svelte(build);
		build.onLoad({ filter: /\.svelte\.[jt]s(\?.*)?$/ }, load_module);
		build.onLoad({ filter: /\.svelte(\?.*)?$/ }, load_svelte);
	}
});
