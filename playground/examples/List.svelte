<script>
	const NAMES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];

	let next = 3;
	let items = $state(NAMES.slice(0, 3).map((label, id) => ({ id, label })));

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
</script>

<div class="app">
	<div class="row">
		<div class="btn" onclick={add}>Add</div>
		<div class="btn" onclick={shuffle}>Shuffle</div>
		<div class="dim">{items.length} {items.length === 1 ? 'row' : 'rows'}</div>
	</div>
	{#each items as item (item.id)}
		<div class="item">
			<div>{item.label}</div>
			<div class="remove" onclick={() => (items = items.filter((other) => other !== item))}>Remove</div>
		</div>
	{:else}
		<div class="dim">Nothing here. Add a row.</div>
	{/each}
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		height: 100%;
		padding: 24px;
		background-color: #000000;
		color: #ededed;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}
	.btn {
		padding: 6px 14px;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		user-select: none;
		background-color: #ededed;
		color: #000000;
	}
	.btn:hover {
		background-color: #ffffff;
	}
	.item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-width: 1px;
		border-style: solid;
		border-color: #242424;
		border-radius: 8px;
		background-color: #111111;
	}
	.remove {
		color: #a1a1a1;
		font-size: 13px;
		cursor: pointer;
		user-select: none;
	}
	.remove:hover {
		color: #ff6166;
	}
	.dim {
		color: #a1a1a1;
	}
</style>
