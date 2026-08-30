/**
 * GPUIX + Svelte counter.
 *
 * The same app as counter.tsx, driven by Svelte's custom renderer instead of a
 * React reconciler. Run it with:
 *
 *   bun run demo
 *
 * `render_hot` reloads the component on save. The `--conditions custom-renderer`
 * flag in that script is not optional — it is how `svelte` resolves to its
 * client build outside a browser.
 */

import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./Counter.svelte', import.meta.url), {
	title: 'GPUIX + Svelte',
	width: 820,
	height: 560
});
