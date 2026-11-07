<script lang="ts">
	import { activates, key_of, type KeyLike } from 'gpuix-svelte-ui/keys';
	import { focus_node, own_hitbox, test_id, type Option } from 'gpuix-svelte-ui/shared';

	let {
		items,
		value,
		onchange,
		testid = null
	}: {
		items: Option[];
		value: string;
		onchange: (value: string) => void;
		/** The list's id; each tab gets `<testid>-<value>`. */
		testid?: string | null;
	} = $props();

	const enabled = (item: Option) => !item.disabled;
	const nodes: Record<string, unknown> = {};

	function choose(item: Option) {
		if (enabled(item) && item.value !== value) onchange(item.value);
	}

	function jump(item: Option) {
		choose(item);
		focus_node(nodes[item.value]);
	}

	// Arrows move the selection and focus with it, as a native tab list does, so only the selected tab is a tab stop.
	function keydown(e: KeyLike, from: number) {
		const key = key_of(e);
		if (key === 'home' || key === 'end') {
			e.preventDefault();
			const edge = key === 'home' ? items.find(enabled) : items.findLast(enabled);
			if (edge) jump(edge);
			return;
		}
		const delta = key === 'right' || key === 'down' ? 1 : key === 'left' || key === 'up' ? -1 : 0;
		if (delta === 0) {
			if (activates(e)) choose(items[from]);
			return;
		}
		e.preventDefault();
		for (let step = 1; step <= items.length; step++) {
			const next = items[(from + delta * step + items.length * step) % items.length];
			if (enabled(next)) {
				jump(next);
				return;
			}
		}
	}
</script>

<div class="tabs" role="tablist" {...test_id(testid)}>
	{#each items as item, i (item.value)}
		<div
			class="tab"
			class:active={item.value === value}
			class:disabled={!enabled(item)}
			role="tab"
			aria-selected={item.value === value}
			tabindex={item.value === value ? 0 : -1}
			{...own_hitbox}
			{...test_id(testid ? `${testid}-${item.value}` : null)}
			{@attach (node: unknown) => {
				nodes[item.value] = node;
			}}
			onclick={() => choose(item)}
			onkeydown={(e) => keydown(e, i)}
		>
			{item.label}
		</div>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		flex-direction: row;
		gap: 4px;
		border-width: 0 0 1px 0;
		border-style: solid;
		border-color: var(--ui-border);
	}
	.tab {
		padding: 8px 12px;
		margin-bottom: -1px;
		border-width: 0 0 2px 0;
		border-style: solid;
		border-color: transparent;
		font-size: 14px;
		font-weight: 500;
		line-height: 20px;
		white-space: nowrap;
		cursor: pointer;
		user-select: none;
		color: var(--ui-muted);
	}
	.tab:hover {
		color: var(--ui-ink);
	}
	.tab:focus-visible {
		outline-width: 2px;
		outline-offset: -2px;
		outline-style: solid;
		outline-color: var(--ui-ink);
		border-radius: 6px;
	}
	.tab.active {
		border-color: var(--ui-accent);
		color: var(--ui-ink);
	}
	.tab.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
</style>
