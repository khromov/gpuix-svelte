import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./App.svelte', import.meta.url), {
	title: 'gpuix-svelte starter',
	width: 640,
	height: 480
});
