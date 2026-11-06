import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./Showcase.svelte', import.meta.url), {
	title: 'gpuix-svelte-ui',
	width: 1100,
	height: 760
});
