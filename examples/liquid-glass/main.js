import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./LiquidGlass.svelte', import.meta.url), {
	title: 'GPUIX + Svelte — Liquid Glass',
	width: 400,
	height: 780,
	transparent: true,
	windowBackground: 'blurred',
	titlebarTransparent: true
});
