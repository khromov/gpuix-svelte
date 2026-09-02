import { render_hot } from 'gpuix-svelte';

// GPUI's window blur is macOS-only; elsewhere the window is merely transparent,
// so the panel needs a heavier scrim of its own to read as frosted glass. The
// titlebar goes transparent only where there are traffic lights to draw under —
// nothing here can close or move a window, so hiding the real chrome would
// strand it.
const mac = process.platform === 'darwin';

render_hot(new URL('./LiquidGlass.svelte', import.meta.url), {
	// The titlebar is visible off macOS, and what it shows there is plain window
	// transparency, not Apple's material.
	title: mac ? 'GPUIX + Svelte — Liquid Glass' : 'GPUIX + Svelte — Transparency',
	width: 400,
	height: 780,
	transparent: true,
	windowBackground: mac ? 'blurred' : 'transparent',
	titlebarTransparent: mac,
	props: mac
		? {}
		: {
				scrim: 'rgba(22, 22, 34, 0.92)',
				backing: 'a transparent window behind the panel',
				padTop: 12
			}
});
