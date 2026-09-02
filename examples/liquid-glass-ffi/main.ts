import { render_hot } from 'gpuix-svelte';
import { init_glass } from './glass.ts';

// Same control center as ../liquid-glass, but on Apple's actual Liquid Glass:
// an NSGlassEffectView (macOS 26+) slid under GPUI's Metal view over FFI.
const glass = await init_glass();

await render_hot(new URL('../liquid-glass/LiquidGlass.svelte', import.meta.url), {
	title: 'GPUIX + Svelte — Liquid Glass (FFI)',
	width: 400,
	height: 780,
	transparent: true,
	// GPUI's window blur is the macOS fallback; elsewhere only plain transparency
	// exists, so the panel carries a heavier scrim of its own.
	windowBackground: glass || process.platform !== 'darwin' ? 'transparent' : 'blurred',
	titlebarTransparent: process.platform === 'darwin',
	props: {
		glass: glass !== null,
		...(process.platform === 'darwin'
			? {}
			: { scrim: 'rgba(22, 22, 34, 0.92)', padTop: 22 })
	}
});

if (glass) {
	const win = glass.attach(0);
	console.log(
		win > 0
			? '[liquid-glass-ffi] NSGlassEffectView attached'
			: `[liquid-glass-ffi] attach failed (${win}); window stays transparent`
	);
}
