/**
 * The Vite plugins every DOM build in this repository shares: `demo:dom` (scripts/dom.ts) and the
 * docs' live demos (scripts/docs.ts). They live in a script rather than a vite.config.ts beside a
 * component, because svelte-check reads such a file as that component's Svelte config and loses
 * the repository's a11y warning filter.
 */

import { fileURLToPath } from 'node:url';
import type { Plugin, PluginOption } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// A consumer's Vite finds gpuix-svelte in node_modules. Inside the package there is no such copy, so Node
// resolves the name through the package's own `exports`, under whose default conditions the DOM build wins.
const self_reference: Plugin = {
	name: 'gpuix-svelte-self-reference',
	resolveId(id) {
		if (id === 'gpuix-svelte' || id.startsWith('gpuix-svelte/')) return fileURLToPath(import.meta.resolve(id));
	}
};

/** `emitCss: false` puts each component's CSS in its JS, for a bundle that has to be one file. */
export function dom_plugins({ emitCss = true } = {}): PluginOption[] {
	return [
		// The repository's svelte.config.js turns on the custom renderer, the one thing a DOM build must not do.
		svelte({ configFile: false, emitCss, onwarn: (warning, handler) => warning.code.startsWith('a11y_') || handler(warning) }),
		self_reference
	];
}
