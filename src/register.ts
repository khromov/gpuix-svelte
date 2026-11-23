/**
 * Installed via `node --import gpuix-svelte/register` so the hook is
 * in place before the entry module resolves.
 */

import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WRONG_SVELTE } from './loader-config.ts';

export { RENDERER_MODULE } from './loader-config.ts';

try {
	import.meta.resolve('svelte/renderer');
} catch {
	throw new Error(WRONG_SVELTE);
}

// After the check, since compile.ts imports svelte/compiler itself.
const { compile_module, compile_svelte } = await import('./compile.ts');

const decode = (source: string | ArrayBuffer | NodeJS.TypedArray) =>
	typeof source === 'string' ? source : new TextDecoder().decode(source);

registerHooks({
	// Every `svelte` import resolves from here, as the renderer's own do: in a linked gpuix-svelte checkout the app's
	// components would otherwise reach the app's copy and the renderer the checkout's, and two runtimes cannot cross.
	resolve(specifier, context, nextResolve) {
		if (!/^svelte(\/|$)/.test(specifier)) return nextResolve(specifier, context);
		return nextResolve(specifier, { ...context, parentURL: import.meta.url });
	},

	load(url, context, nextLoad) {
		if (/\.svelte\.[jt]s(\?|$)/.test(url)) {
			const file = new URL(url);
			file.search = '';
			const path = fileURLToPath(file);

			let source: string | undefined;
			if (path.endsWith('.ts')) {
				// `compileModule` does not strip types: Node hands back raw TypeScript, while a
				// loader of the user's own ahead of this one (tsx) may already have returned JS.
				const loaded = nextLoad(url, context);
				source = decode(loaded.source ?? '');
				if (loaded.format === 'module-typescript') source = stripTypeScriptTypes(source);
			}
			return { format: 'module', shortCircuit: true, source: compile_module(path, source) };
		}

		if (!/\.svelte(\?|$)/.test(url)) return nextLoad(url, context);

		// `render_hot` busts Node's module cache with a `?v=N` tail; it lands in
		// the URL's search.
		const file = new URL(url);
		const query = file.search;
		file.search = '';

		// Declaring the format is what gets a `.svelte` URL past
		// ERR_UNKNOWN_FILE_EXTENSION; the `resolve` hook above only pins `svelte`.
		return {
			format: 'module',
			shortCircuit: true,
			source: compile_svelte(fileURLToPath(file), query)
		};
	}
});
