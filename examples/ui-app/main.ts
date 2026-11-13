import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./App.svelte', import.meta.url), {
	title: 'Orbit',
	width: 1100,
	height: 720
});
