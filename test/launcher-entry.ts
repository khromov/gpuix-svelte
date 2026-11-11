/**
 * What test/launcher.ts runs through the bin: it prints where `svelte` resolved, which the
 * `custom-renderer` condition decides, and the runtime that resolved it.
 */

console.log(JSON.stringify({ svelte: import.meta.resolve('svelte'), runtime: process.execPath }));
