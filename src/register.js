/**
 * Installed via `node --import gpuix-svelte/register` so the hook is in place
 * before the entry module resolves.
 */

import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile_svelte } from './compile.js';

export { RENDERER_MODULE } from './compile.js';

registerHooks({
	load(url, context, nextLoad) {
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
