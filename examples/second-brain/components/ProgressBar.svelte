<script>
	import { resolved } from '../lib/theme.svelte.js';
	import { ui, use_ticker } from '../lib/ui.svelte.js';

	let { value = null, height = 6 } = $props();

	const mode = $derived(resolved());
	const indeterminate = $derived(value == null);
	// `left` is pixels-only in GPUI, so an unknown progress breathes in width instead of sweeping.
	const pct = $derived(indeterminate ? 25 + 35 * (0.5 + 0.5 * Math.sin(ui.tick / 4)) : Math.max(0, Math.min(100, value)));

	$effect(() => (indeterminate ? use_ticker() : undefined));
</script>

<div class="track {mode}" style="height: {height}px; border-radius: {height / 2}px">
	<div class="fill {mode}" class:indeterminate style="width: {pct}%; height: {height}px; border-radius: {height / 2}px"></div>
</div>

<style>
	.track { position: relative; width: 100%; overflow: hidden; pointer-events: none; }
	.track.light { background-color: #ece4d4; }
	.track.dark { background-color: #36302a; }
	.fill { position: absolute; top: 0; left: 0; }
	.fill.indeterminate { opacity: 0.7; }
	.fill.light { background-color: #5f7a4a; }
	.fill.dark { background-color: #8fae74; }
</style>
