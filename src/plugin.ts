/**
 * Registered via `bunfig.toml`'s `preload` so it is in place before the entry
 * module resolves. `Bun.build` ignores runtime registrations, so the load hook
 * is also exported for `scripts/compile.ts` to wire up itself.
 */

import { plugin, type OnLoadArgs, type OnLoadResult, type OnResolveArgs, type PluginBuilder } from 'bun';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

// The ESM loader finds its `.node` through `createRequire(import.meta.url)`, which
// `Bun.build` can't trace, so a compiled binary would ship without the addon.
export const resolve_native_cjs = () => ({ path: createRequire(import.meta.url).resolve('@gpuix/native') });

type ExportTarget = string | { [condition: string]: ExportTarget };

function pick(target: ExportTarget | undefined, accepted: Set<string>): string | undefined {
	if (typeof target !== 'object') return target;
	for (const [condition, inner] of Object.entries(target)) {
		const found = accepted.has(condition) ? pick(inner, accepted) : undefined;
		if (found) return found;
	}
}

/**
 * `Bun.build` resolves `svelte` from the importer, and in a consumer's project that can be the
 * registry build svelte-check hoists, so this pins it to the copy bundled here, under the build's
 * own conditions. Use as `build.onResolve({ filter: /^svelte(\/|$)/ }, resolve_svelte(conditions))`.
 */
export function resolve_svelte(conditions: string[]) {
	const manifest_path = createRequire(import.meta.url).resolve('svelte/package.json');
	const dir = manifest_path.slice(0, -'package.json'.length);
	const exports: Record<string, ExportTarget> = JSON.parse(readFileSync(manifest_path, 'utf8')).exports;
	if (!exports['./renderer']) throw new Error(WRONG_SVELTE);
	const accepted = new Set([...conditions, 'import', 'default']);

	return (args: OnResolveArgs) => {
		const target = pick(exports[args.path === 'svelte' ? '.' : `./${args.path.slice('svelte/'.length)}`], accepted);
		return target ? { path: dir + target.slice(2) } : undefined;
	};
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
