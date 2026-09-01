import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./Tutorial.svelte', import.meta.url), {
	title: 'GPUIX + Svelte — Tutorial',
	width: 1180,
	height: 800,
	minWidth: 900,
	minHeight: 600
});
