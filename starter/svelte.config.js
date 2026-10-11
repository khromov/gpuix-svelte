/**
 * Read by the editor and svelte-check, not at runtime: DOM a11y advice off, since this tree has
 * no DOM. svelte-check brings the registry's svelte as its peer, which has no `customRenderer`
 * option, so this sets nothing else.
 */
export default {
	compilerOptions: {
		warningFilter: (warning) => !warning.code.startsWith('a11y_')
	}
};
