/**
 * Bun-only: bun:sqlite, Bun.spawn IPC, Bun.Image, HTMLRewriter and bun:ffi have no
 * Node twins, so this is the one example without a `node` script.
 */

if (!process.versions.bun) {
	console.error('[substrate] Substrate needs Bun — `npm run brain` runs `bun examples/second-brain/main.ts`');
	process.exit(1);
}

// Imported after the guard: a static import would hoist the Bun-only modules above it.
const { render_hot } = await import('gpuix-svelte');
const { create_app } = await import('./lib/app.ts');
const { WINDOW } = await import('./lib/window.ts');

const stub = process.env.GPUIX_BRAIN_STUB === '1';
const app = await create_app({
	data_dir: process.env.GPUIX_BRAIN_DIR || (stub ? new URL('./.data/stub', import.meta.url).pathname : null),
	seed: stub
});

render_hot(new URL('./App.svelte', import.meta.url), { ...WINDOW, props: { app } });
