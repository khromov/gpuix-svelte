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
		'padding: 6px 14px; border-radius: 6px; color: #1e1e2e; ' +
		'font-size: 13px; font-weight: bold; cursor: pointer';
</script>

<div style="display: flex; flex-direction: column; gap: 8px">
	{#each items as item (item.id)}
		<div
			style="display: flex; flex-direction: row; justify-content: space-between;
			       padding: 8px 12px; border-radius: 6px; background-color: #313244;
			       color: #cdd6f4; font-size: 13px; cursor: pointer"
			hover="background-color: #45475a"
			onclick={() => (items = items.filter((i) => i.id !== item.id))}
		>
			<div>{item.label}</div>
			<div style="color: #6c7086">id {item.id}</div>
		</div>
	{/each}

	{#if items.length === 0}
		<div style="color: #6c7086; font-size: 13px">empty — add something</div>
	{/if}

	<div style="display: flex; flex-direction: row; align-items: center; gap: 8px">
		<div style="{BUTTON}; background-color: #89b4fa" onclick={add}>add</div>
		<div style="{BUTTON}; background-color: #cba6f7" onclick={shuffle}>shuffle</div>
		<div style="color: #6c7086; font-size: 12px">click a row to remove it</div>
	</div>
</div>
