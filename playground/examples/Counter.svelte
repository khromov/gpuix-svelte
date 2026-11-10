<script>
	let count = $state(0);
</script>

<div class="app">
	<div class="count">{count}</div>
	<div class="row">
		<div class="btn" onclick={() => count--}>−</div>
		<div class="btn primary" onclick={() => count++}>+</div>
	</div>
	{#if count !== 0}
		<div class="reset" onclick={() => (count = 0)}>Reset</div>
	{/if}
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		width: 100%;
		height: 100%;
		background-color: #000000;
		color: #ededed;
	}
	.count {
		font-size: 64px;
		font-weight: 600;
	}
	.row {
		display: flex;
		gap: 12px;
	}
	.btn {
		padding: 8px 24px;
		border-width: 1px;
		border-style: solid;
		border-color: #404040;
		border-radius: 8px;
		font-size: 18px;
		cursor: pointer;
		user-select: none;
		background-color: #111111;
	}
	.btn:hover {
		background-color: #1f1f1f;
	}
	.btn.primary {
		border-color: #ededed;
		background-color: #ededed;
		color: #000000;
	}
	.btn.primary:hover {
		background-color: #ffffff;
	}
	.reset {
		color: #a1a1a1;
		font-size: 13px;
		cursor: pointer;
		user-select: none;
	}
	.reset:hover {
		color: #ededed;
	}
</style>
