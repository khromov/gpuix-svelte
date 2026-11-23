/**
 * What both loaders and compile.ts share, kept free of any svelte import so a loader can check the
 * svelte install before compile.ts loads the compiler, which would fail first and say less.
 */

/**
 * The compiler bakes this into every component's `import $renderer from '...'`,
 * which must resolve from the `.svelte` file's own location — so components
 * outside this workspace need the override to supply an absolute path.
 */
export const RENDERER_MODULE = process.env.GPUIX_SVELTE_RENDERER || 'gpuix-svelte/renderer';

export const WRONG_SVELTE =
	'[gpuix-svelte] svelte is missing or older than 5.59.1, which has svelte/renderer. gpuix-svelte needs svelte ^5.59.1 — add it to your dependencies and reinstall.';
