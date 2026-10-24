/**
 * The second entry of a QuickJS bundle (`src/qjs.ts`). Being an entry of its own
 * is what makes the bundler split everything the two share — the Svelte runtime
 * and this package — into a chunk the host keeps cached across reloads, so a
 * re-import of the app entry is one Svelte runtime unmounting and mounting
 * rather than a second runtime that cannot see the first's tree (the `bun --hot`
 * failure). It re-exports the *whole* client runtime, not just `svelte`: the
 * chunk only holds what some entry imports, so without this the first `{#if}` an
 * app adds would pull a new internal in, change the chunk's hash, and defeat the
 * cache on the very reload that follows.
 */

export * from 'svelte';
// eslint-disable-next-line svelte/no-svelte-internal -- only to pin the runtime into the chunk; nothing here calls it
export * from 'svelte/internal/client';
export * from 'svelte/reactivity';
export * from 'svelte/store';
export * from 'svelte/easing';
export * from 'gpuix-svelte';
export { default as renderer } from 'gpuix-svelte/renderer';
