/**
 * Read by the editor and svelte-check, not at runtime: the custom renderer on, so they report what
 * the loaders refuse (`bind:` on an element, transitions), and DOM a11y advice off, since this tree
 * has no DOM.
 */
export default {
	compilerOptions: {
		experimental: { customRenderer: 'gpuix-svelte/renderer' },
		warningFilter: (warning) => !warning.code.startsWith('a11y_')
	}
};
