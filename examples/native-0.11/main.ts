import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./WhatsNew.svelte', import.meta.url), {
	title: 'GPUIX + Svelte — native 0.11',
	width: 1180,
	height: 860,
	titlebar: 'auto'
});
