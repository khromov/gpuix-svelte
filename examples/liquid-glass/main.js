import { render_hot } from 'gpuix-svelte';
import { init_glass } from './glass.js';

// Actual Liquid Glass (NSGlassEffectView) on macOS 26+; GPUI's window blur
// otherwise. With glass, the window itself stays fully transparent so the
// material provides all the backdrop.
const glass = await init_glass();

await render_hot(new URL('./LiquidGlass.svelte', import.meta.url), {
	title: 'GPUIX + Svelte — Liquid Glass',
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
			? '[liquid-glass] NSGlassEffectView attached'
			: `[liquid-glass] attach failed (${win}); window stays transparent`
	);
}
