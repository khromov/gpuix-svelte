import { render_hot } from 'gpuix-svelte';
import { init_glass } from './glass.js';

// Same control center as ../liquid-glass, but on Apple's actual Liquid Glass:
// an NSGlassEffectView (macOS 26+) slid under GPUI's Metal view over FFI.
// Where that isn't possible it falls back to the plain demo's window blur.
const glass = await init_glass();

await render_hot(new URL('../liquid-glass/LiquidGlass.svelte', import.meta.url), {
	title: 'GPUIX + Svelte — Liquid Glass (FFI)',
	width: 400,
	height: 780,
	transparent: true,
	windowBackground: glass ? 'transparent' : 'blurred',
	titlebarTransparent: true,
	props: { glass: glass !== null }
});

if (glass) {
	const win = glass.attach(0);
	console.log(
		win > 0
			? '[liquid-glass-ffi] NSGlassEffectView attached'
			: `[liquid-glass-ffi] attach failed (${win}); window stays transparent`
	);
}
