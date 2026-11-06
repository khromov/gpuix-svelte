<script lang="ts">
	import type { Snippet } from 'svelte';
	import Popover from 'gpuix-svelte/components/Popover.svelte';
	import Kbd from 'gpuix-svelte-ui/components/Kbd.svelte';
	import { activates } from 'gpuix-svelte-ui/keys';
	import { own_hitbox, test_id, type MenuEntry } from 'gpuix-svelte-ui/shared';

	let {
		open,
		onclose,
		items,
		children,
		side = 'bottom',
		align = 'start',
		gap = 4,
		position = null,
		testid = null
	}: {
		open: boolean;
		/** A press outside, Escape, or an item that ran. */
		onclose: () => void;
		items: MenuEntry[];
		/** The trigger; it toggles `open` itself. */
		children: Snippet;
		side?: 'top' | 'right' | 'bottom' | 'left';
		align?: 'start' | 'center' | 'end';
		gap?: number;
		/** Window coordinates to open at instead of beside the trigger, for a context menu. */
		position?: { x: number; y: number } | null;
		/** The trigger wrapper's id; the panel gets `<testid>-panel` and each item `<testid>-<label slug>`. */
		testid?: string | null;
	} = $props();

	const slug = (label: string) =>
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');

	function select(entry: MenuEntry) {
		if (entry.separator || entry.disabled) return;
		entry.onselect?.();
		onclose();
	}
</script>

<Popover {open} {onclose} {side} {align} {gap} {position} {testid}>
	{@render children()}
	{#snippet content()}
		<div class="menu" role="menu">
			{#each items as entry, i (i)}
				{#if entry.separator}
					<div class="separator"></div>
				{:else}
					<div
						class="item"
						class:disabled={entry.disabled}
						class:danger={entry.danger}
						role="menuitem"
						tabindex={entry.disabled ? -1 : 0}
						{...own_hitbox}
						{...test_id(testid ? `${testid}-${slug(entry.label)}` : null)}
						onclick={() => select(entry)}
						onkeydown={(e) => activates(e) && select(entry)}
					>
						<div class="item-label">{entry.label}</div>
						{#if entry.shortcut}<Kbd>{entry.shortcut}</Kbd>{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/snippet}
</Popover>

<style>
	.menu {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 160px;
	}
	.item {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 6px 10px;
		border-radius: 6px;
		font-size: 14px;
		line-height: 20px;
		white-space: nowrap;
		cursor: pointer;
		user-select: none;
		color: var(--ui-ink);
	}
	.item:hover {
		background-color: var(--ui-raised-hover);
	}
	.item:focus-visible {
		background-color: var(--ui-raised-hover);
	}
	.item.danger {
		color: var(--ui-danger);
	}
	.item.danger:hover {
		background-color: var(--ui-danger-wash);
	}
	.item.disabled {
		opacity: 0.5;
		cursor: not-allowed;
		pointer-events: none;
	}
	.separator {
		height: 1px;
		margin: 4px 6px;
		background-color: var(--ui-border);
	}
</style>
