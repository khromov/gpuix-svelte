<script>
	import { ICONS } from '../lib/icons.js';
	import { resolved } from '../lib/theme.svelte.js';

	// GPUI tints an <svg> with its own `color` and inherits nothing, so the colour is
	// picked here by tone rather than left to the parent.
	let { name, size = 16, tone = 'muted' } = $props();

	const mode = $derived(resolved());
</script>

<svg source={ICONS[name] ?? ICONS.dot} class="icon {tone} {mode}" style="width: {size}px; height: {size}px"></svg>

<style>
	.icon { pointer-events: none; }
	.icon.ink.light { color: #2a251f; }
	.icon.ink.dark { color: #ece3d3; }
	.icon.muted.light { color: #6b6154; }
	.icon.muted.dark { color: #b2a791; }
	.icon.faint.light { color: #9b9080; }
	.icon.faint.dark { color: #7b7163; }
	.icon.accent.light { color: #5f7a4a; }
	.icon.accent.dark { color: #8fae74; }
	.icon.accentDeep.light { color: #3f5a30; }
	.icon.accentDeep.dark { color: #b7d19f; }
	.icon.onAccent.light { color: #f8f5ec; }
	.icon.onAccent.dark { color: #1b1815; }
	.icon.danger.light { color: #a9483a; }
	.icon.danger.dark { color: #d46f5e; }
	.icon.onDanger.light { color: #fbf7ef; }
	.icon.onDanger.dark { color: #1b1815; }
	.icon.text.light { color: #b8822b; }
	.icon.text.dark { color: #d9a34a; }
	.icon.link.light { color: #4f6b8a; }
	.icon.link.dark { color: #87a4c3; }
	.icon.image.light { color: #7a5878; }
	.icon.image.dark { color: #b48ab0; }
	.icon.audio.light { color: #3f7a75; }
	.icon.audio.dark { color: #6fb3ad; }
</style>
