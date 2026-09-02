/**
 * Installed via `node --import tsx --import gpuix-svelte/register` so the hook is
 * in place before the entry module resolves.
 */

import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile_module, compile_svelte, WRONG_SVELTE } from './compile.ts';

export { RENDERER_MODULE } from './compile.ts';

const decode = (source: string | ArrayBuffer | NodeJS.TypedArray) =>
	typeof source === 'string' ? source : new TextDecoder().decode(source);

registerHooks({
	// svelte is bundled inside this package, so a consumer's compiled component (and any
	// copy hoisted next to it) must resolve `svelte` from here, or two runtimes would meet.
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
				// `compileModule` does not strip types, so the next loader (tsx, which the bin
				// registers ahead of this hook) does; a bare `--import gpuix-svelte/register`
				// gets Node's raw TypeScript back instead.
				const loaded = nextLoad(url, context);
				source = decode(loaded.source ?? '');
				if (loaded.format === 'module-typescript') source = stripTypeScriptTypes(source);
			}
			return { format: 'module', shortCircuit: true, source: compile_module(path, source) };
		}

		if (!/\.svelte(\?|$)/.test(url)) return nextLoad(url, context);

		// `render_hot` busts Node's module cache with a `?v=N` tail; it lands in
		// the URL's search rather than the path.
		const file = new URL(url);
		const query = file.search;
		file.search = '';

		// Declaring the format is what gets a `.svelte` URL past
		// ERR_UNKNOWN_FILE_EXTENSION — no `resolve` hook is needed.
		return {
			format: 'module',
			shortCircuit: true,
			source: compile_svelte(fileURLToPath(file), query)
		};
	}
});

try {
	import.meta.resolve('svelte/renderer');
} catch {
	throw new Error(WRONG_SVELTE);
}
