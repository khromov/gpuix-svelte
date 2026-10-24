// The custom-renderer build ships `svelte/internal/client` without declarations.
// `src/qjs-runtime.ts` re-exports it only to pin the whole runtime into the
// QuickJS bundle's shared chunk; nothing types against it.
declare module 'svelte/internal/client';
