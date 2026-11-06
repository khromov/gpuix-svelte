<script lang="ts">
	import type { Snippet } from 'svelte';
	import { test_id } from 'gpuix-svelte-ui/shared';

	let {
		title = null,
		description = null,
		children,
		actions = null,
		footer = null,
		pad = 16,
		gap = 12,
		testid = null
	}: {
		title?: string | null;
		description?: string | null;
		children: Snippet;
		/** Buttons or badges at the right of the title. */
		actions?: Snippet | null;
		footer?: Snippet | null;
		pad?: number;
		gap?: number;
		testid?: string | null;
	} = $props();
</script>

<div class="card" style="padding: {pad}px; gap: {gap}px" {...test_id(testid)}>
	{#if title || actions}
		<div class="head">
			<div class="heading">
				{#if title}<div class="title">{title}</div>{/if}
				{#if description}<div class="description">{description}</div>{/if}
			</div>
			{#if actions}<div class="actions">{@render actions()}</div>{/if}
		</div>
	{:else if description}
		<div class="description">{description}</div>
	{/if}
	<div class="body">{@render children()}</div>
	{#if footer}<div class="footer">{@render footer()}</div>{/if}
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		border-radius: 10px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--ui-border);
		box-sizing: border-box;
		background-color: var(--ui-panel);
		color: var(--ui-ink);
	}
	.head {
		display: flex;
		flex-direction: row;
		align-items: start;
		justify-content: space-between;
		gap: 12px;
	}
	.heading {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.title {
		font-size: 15px;
		font-weight: 600;
		line-height: 20px;
	}
	.description {
		font-size: 13px;
		line-height: 18px;
		color: var(--ui-muted);
	}
	.actions {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 14px;
	}
	.footer {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: end;
		gap: 8px;
	}
</style>
