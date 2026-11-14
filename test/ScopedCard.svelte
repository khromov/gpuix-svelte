<script lang="ts">
	// Two roots, one growing and one a percentage wide, so a box put around them would show in both.
	import type { Snippet } from 'svelte';

	let { id, more = false, children }: { id: string; more?: boolean; children?: Snippet } = $props();
</script>

<div class="card" testId={id}>
	{#if more}<div class="more" testId="{id}-more"></div>{/if}
	{@render children?.()}
</div>
<div class="tail" testId="{id}-tail"></div>

<style>
	.card {
		background-color: var(--tint, #000001);
		flex-grow: 1;
		flex-basis: 0;
		height: 20px;
	}
	.tail {
		background-color: var(--tint, #000001);
		width: 20%;
		height: 10px;
	}
	.more {
		color: var(--tint, #000001);
		width: 4px;
		height: 4px;
	}
</style>
