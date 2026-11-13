<script lang="ts">
	import { test_id } from 'gpuix-svelte-ui/shared';

	let { direction = 'horizontal', label = null, testid = null }: { direction?: 'horizontal' | 'vertical'; label?: string | null; testid?: string | null } = $props();
</script>

<div class="separator {direction}" role="separator" {...test_id(testid)}>
	<div class="line {direction}"></div>
	{#if label && direction === 'horizontal'}
		<div class="label">{label}</div>
		<div class="line {direction}"></div>
	{/if}
</div>

<style>
	.separator {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.separator.horizontal {
		flex-direction: row;
		width: 100%;
	}
	.separator.vertical {
		flex-direction: column;
		width: 1px;
		align-self: stretch;
	}
	.line {
		flex-grow: 1;
		flex-basis: 0;
		background-color: var(--ui-border);
	}
	.line.horizontal {
		height: 1px;
	}
	.line.vertical {
		width: 1px;
	}
	.label {
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		color: var(--ui-muted);
	}
</style>
