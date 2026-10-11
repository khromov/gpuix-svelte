/**
 * Editor-only config: the language server compiles `.svelte` files itself, without
 * the `experimental.customRenderer` that `src/compile.ts` passes — so it reports DOM
 * a11y advice (keyboard handlers beside clicks, roles on static elements) the examples were
 * not written against, though `role` and `aria-*` do reach GPUI's accessibility tree.
 * Nothing at runtime reads this file.
 */
export default {
	compilerOptions: {
		experimental: { customRenderer: 'gpuix-svelte/renderer' },
		warningFilter: (warning) => !warning.code.startsWith('a11y_')
	}
};
