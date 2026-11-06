<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="kbd">{@render children()}</div>

<style>
	.kbd {
		display: flex;
		align-items: center;
		padding: 1px 6px;
		border-radius: 5px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--ui-border);
		font-family: var(--ui-mono);
		font-size: 12px;
		font-weight: 500;
		line-height: 16px;
		white-space: nowrap;
		background-color: var(--ui-raised);
		color: var(--ui-ink);
	}
</style>
