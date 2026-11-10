<script>
	import { set_css_vars } from 'gpuix-svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
	import Popover from 'gpuix-svelte/components/Popover.svelte';

	set_css_vars({
		'tooltip-surface': '#ededed',
		'tooltip-ink': '#000000',
		'popover-surface': '#1f1f1f',
		'popover-border': '#404040',
		'popover-ink': '#ededed',
		'scroller-thumb': '#404040',
		'scroller-thumb-hover': '#5a5a5a'
	});

	let menu = $state(false);
	let dialog = $state(false);
	let picked = $state('nothing yet');
	const rows = Array.from({ length: 40 }, (_, i) => `Row ${i + 1}`);
</script>

{#snippet items()}
	{#each ['Rename', 'Duplicate', 'Delete'] as item (item)}
		<div class="item" onclick={() => ((picked = item), (menu = false))}>{item}</div>
	{/each}
{/snippet}

<div class="app">
	<div class="row">
		<Tooltip content="Painted in a layer beside the trigger" side="bottom">
			<div class="chip">Hover me</div>
		</Tooltip>
		<Popover open={menu} onclose={() => (menu = false)} content={items}>
			<div class="btn" onclick={() => (menu = !menu)}>Actions</div>
		</Popover>
		<div class="btn" onclick={() => (dialog = true)}>Open a dialog</div>
		<div class="dim">Picked: {picked}</div>
	</div>
	<div class="list">
		<Scroller>
			{#each rows as row (row)}
				<div class="line">{row}</div>
			{/each}
		</Scroller>
	</div>
</div>

{#if dialog}
	<Portal>
		<div class="scrim" onclick={() => (dialog = false)}>
			<div class="dialog" onclick={(e) => e.stopPropagation()}>
				<div class="heading">Rendered here, painted on top</div>
				<div>A Portal covers the whole window from wherever it is rendered.</div>
				<div class="btn" onclick={() => (dialog = false)}>Close</div>
			</div>
		</div>
	</Portal>
{/if}

<style>
	.app {
		display: flex;
		flex-direction: column;
		gap: 16px;
		width: 100%;
		height: 100%;
		padding: 24px;
		background-color: #000000;
		color: #ededed;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.chip {
		padding: 6px 12px;
		border-radius: 6px;
		cursor: default;
		user-select: none;
		background-color: #1f1f1f;
	}
	.btn {
		padding: 6px 12px;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		user-select: none;
		background-color: #ededed;
		color: #000000;
	}
	.item {
		padding: 6px 12px;
		border-radius: 4px;
		cursor: pointer;
		white-space: nowrap;
	}
	.item:hover {
		background-color: #2c2c2c;
	}
	.list {
		display: flex;
		flex-direction: column;
		height: 220px;
		border-width: 1px;
		border-style: solid;
		border-color: #242424;
		border-radius: 8px;
		background-color: #111111;
	}
	.line {
		width: 100%;
		padding: 6px 14px;
	}
	.scrim {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background-color: #00000099;
	}
	.dialog {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		max-width: 360px;
		padding: 20px;
		border-radius: 12px;
		background-color: #1f1f1f;
		color: #ededed;
	}
	.heading {
		font-size: 16px;
		font-weight: 600;
	}
	.dim {
		color: #a1a1a1;
	}
</style>
