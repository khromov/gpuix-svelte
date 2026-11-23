/**
 * Read by the editor and svelte-check, not at runtime: DOM a11y advice off, since this tree has
 * no DOM. The custom renderer stays off here, because a Vite or SvelteKit build of the same app
 * reads this file too and would compile its DOM components for GPUI.
 */
export default {
	compilerOptions: {
		warningFilter: (warning) => !warning.code.startsWith('a11y_')
	}
};
