<script lang="ts">
	// Paint order is document order, so the layer moves to the end of <body> from wherever it is rendered.
	// The slot stays behind as the node Svelte holds on to: a keyed {#each} that reorders this component
	// moves the slot and leaves the layer where it is. `pointer-events: none` is inherited here, unlike on
	// GPUI, so the children get it back at zero specificity, under their own rules.
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	function to_body(layer: HTMLElement) {
		document.body.appendChild(layer);
		return () => layer.remove();
	}
</script>

<div class="slot"><div class="portal" {@attach to_body}>{@render children()}</div></div>

<style>
	.slot { display: contents; }
	.portal { position: fixed; inset: 0; pointer-events: none; z-index: 1000; }
	:where(.portal) > :global(*) { pointer-events: auto; }
</style>
