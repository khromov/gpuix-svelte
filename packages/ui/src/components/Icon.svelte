<script lang="ts">
	import { IS_GPUIX } from 'gpuix-svelte';
	import { ICONS, type IconName } from 'gpuix-svelte-ui/icons';

	// GPUI draws SVG markup through <svg source>, tinted with the element's colour. A browser needs the
	// markup inline, and `{@html}` is refused under the custom renderer, so an attachment writes it.
	let { name = null, source = null, size = 16 }: { name?: IconName | null; source?: string | null; size?: number } = $props();

	const markup = $derived(source ?? (name ? ICONS[name] : ''));
	const gpui = $derived(IS_GPUIX ? { source: markup } : {});

	function inline(node: unknown) {
		(node as { innerHTML: string }).innerHTML = markup;
	}
</script>

{#if IS_GPUIX}
	<svg class="icon" style="width: {size}px; height: {size}px" {...gpui}></svg>
{:else}
	<div class="icon" style="width: {size}px; height: {size}px" {@attach inline}></div>
{/if}

<style>
	.icon {
		display: flex;
		flex-shrink: 0;
	}
</style>
