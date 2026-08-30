import { render_hot } from 'gpuix-svelte';

// GPUI's window blur is macOS-only; elsewhere the window is merely transparent,
// so the panel needs a heavier scrim of its own to read as frosted glass.
const blurred = process.platform === 'darwin';

render_hot(new URL('./LiquidGlass.svelte', import.meta.url), {
	title: 'GPUIX + Svelte — Liquid Glass',
	width: 400,
	height: 780,
	transparent: true,
	windowBackground: blurred ? 'blurred' : 'transparent',
	titlebarTransparent: true,
	props: blurred
		? {}
		: { scrim: 'rgba(22, 22, 34, 0.92)', backing: 'a transparent window behind the panel' }
});
