<script lang="ts">
	// Paint order is document order, so the layer moves to the end of <body> from wherever it is rendered;
	// the slot stays put so Svelte's teardown walk never leaves the component.
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
	.portal > :global(*) { pointer-events: auto; }
</style>
