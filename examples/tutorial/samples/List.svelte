<script lang="ts">
	const NAMES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
	let next = 3;
	let items = $state([
		{ id: 0, label: 'alpha' },
		{ id: 1, label: 'beta' },
		{ id: 2, label: 'gamma' }
	]);

	function add() {
		items.push({ id: next, label: NAMES[next % NAMES.length] });
		next++;
	}

	function shuffle() {
		for (let i = items.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[items[i], items[j]] = [items[j], items[i]];
		}
	}

	const BUTTON =
		'padding: 6px 14px; border-radius: 8px; border-width: 1px; ' +
		'font-size: 13px; font-weight: 600; cursor: pointer';
</script>

<div style="display: flex; flex-direction: column; gap: 8px">
	{#each items as item (item.id)}
		<div
			style="display: flex; flex-direction: row; justify-content: space-between;
			       padding: 8px 12px; border-radius: 6px; background-color: #1c1c1c;
			       color: #ededed; font-size: 13px; cursor: pointer"
			hover="background-color: #262626"
			onclick={() => (items = items.filter((i) => i.id !== item.id))}
		>
			<div>{item.label}</div>
			<div style="color: #8f8f8f">id {item.id}</div>
		</div>
	{/each}

	{#if items.length === 0}
		<div style="color: #a1a1a1; font-size: 13px">empty — add something</div>
	{/if}

	<div style="display: flex; flex-direction: row; align-items: center; gap: 8px">
		<div style="{BUTTON}; border-color: #ededed; background-color: #ededed; color: #000000" onclick={add}>add</div>
		<div style="{BUTTON}; border-color: #242424; color: #ededed" onclick={shuffle}>shuffle</div>
		<div style="color: #a1a1a1; font-size: 12px">click a row to remove it</div>
	</div>
</div>
