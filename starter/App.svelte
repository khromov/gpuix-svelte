<script lang="ts">
	let count = $state(0);
</script>

<div class="app">
	<div class="card">
		<div class="count" testId="count">{count}</div>
		<div class="row">
			<div class="btn" testId="minus" onclick={() => count--}>-</div>
			<div class="btn primary" testId="plus" onclick={() => count++}>+</div>
		</div>
		<div class="hint">Edit App.svelte and save — the window hot-reloads.</div>
	</div>
</div>

<style>
	.app {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background-color: #11111b;
	}
	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 32px;
		background-color: #1e1e2e;
		border-radius: 12px;
	}
	.count {
		font-size: 48px;
		font-weight: bold;
		color: #cdd6f4;
	}
	.row {
		display: flex;
		flex-direction: row;
		gap: 12px;
	}
	.btn {
		padding: 12px 24px;
		border-radius: 8px;
		background-color: #313244;
		color: #cdd6f4;
		font-weight: bold;
		cursor: pointer;
	}
	.btn:hover {
		background-color: #45475a;
	}
	.primary {
		background-color: #a6e3a1;
		color: #1e1e2e;
	}
	.primary:hover {
		background-color: #94e2d5;
	}
	.hint {
		color: #a6adc8;
		font-size: 13px;
	}
</style>
