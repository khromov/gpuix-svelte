/**
 * Editor-only config: the language server compiles `.svelte` files itself, without
 * the `experimental.customRenderer` that `src/compile.ts` passes — so it reports DOM
 * a11y warnings (ARIA roles, static element interactions) for a tree that has no DOM.
 * Nothing at runtime reads this file.
 */
export default {
	compilerOptions: {
		experimental: { customRenderer: 'gpuix-svelte/renderer' },
		warningFilter: (warning) => !warning.code.startsWith('a11y_')
	}
};
