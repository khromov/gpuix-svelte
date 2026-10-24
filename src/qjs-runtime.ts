/**
 * The second entry of a QuickJS bundle (`scripts/qjs.ts`). It adds nothing the app
 * does not already import; being an entry of its own is what makes the bundler
 * split everything the two share — the Svelte runtime and this package — into a
 * chunk the host keeps cached across reloads, so re-importing the app entry is
 * one Svelte runtime unmounting and mounting again rather than a second runtime
 * that cannot see the first's tree (the `bun --hot` failure).
 */

export * from 'svelte';
export * from 'gpuix-svelte';
