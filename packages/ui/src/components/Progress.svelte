<script lang="ts">
	import { aria_value, test_id, type Tone } from 'gpuix-svelte-ui/shared';

	let {
		value,
		max = 100,
		tone = 'accent',
		label = null,
		show_value = false,
		size = 'md',
		testid = null
	}: {
		value: number;
		max?: number;
		tone?: Tone;
		label?: string | null;
		/** A percentage readout beside the label. */
		show_value?: boolean;
		size?: 'sm' | 'md';
		testid?: string | null;
	} = $props();

	const fraction = $derived(max > 0 ? Math.min(1, Math.max(0, value / max)) : 0);
	const percent = $derived(Math.round(fraction * 100));
</script>

<div class="progress" role="progressbar" aria-label={label} aria-valuetext="{percent}%" {...aria_value(Math.min(max, Math.max(0, value)), 0, max)} {...test_id(testid)}>
	{#if label || show_value}
		<div class="head">
			{#if label}<div class="label">{label}</div>{/if}
			{#if show_value}<div class="readout">{percent}%</div>{/if}
		</div>
	{/if}
	<div class="rail {size}">
		<div class="fill {tone}" style:width="{fraction * 100}%"></div>
	</div>
</div>

<style>
	.progress {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.head {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		gap: 12px;
	}
	.label {
		font-size: 13px;
		font-weight: 500;
		line-height: 18px;
		color: var(--ui-ink);
	}
	.readout {
		font-family: var(--ui-mono);
		font-size: 12px;
		line-height: 18px;
		color: var(--ui-muted);
	}
	.rail {
		display: flex;
		flex-direction: row;
		width: 100%;
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
		background-color: var(--ui-raised);
	}
	.rail.sm {
		height: 4px;
		border-radius: 2px;
	}
	.fill {
		height: 100%;
		border-radius: 4px;
		background-color: var(--ui-ink);
	}
	.fill.accent {
		background-color: var(--ui-accent);
	}
	.fill.success {
		background-color: var(--ui-success);
	}
	.fill.warning {
		background-color: var(--ui-warning);
	}
	.fill.danger {
		background-color: var(--ui-danger);
	}
</style>
