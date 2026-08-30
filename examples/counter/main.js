/**
 * The `--conditions custom-renderer` flag in the `demo` script is not optional —
 * it is how `svelte` resolves to its client build outside a browser.
 */

import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./Counter.svelte', import.meta.url), {
	title: 'GPUIX + Svelte',
	width: 820,
	height: 560
});
