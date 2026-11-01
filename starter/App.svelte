<script lang="ts">
	import { onMount } from 'svelte';
	import { check_for_update, type Update } from 'gpuix-svelte/update';

	let count = $state(0);

	// A built app with `update` in its app options checks its manifest; under `npm start` this is null.
	let update = $state<Update | null>(null);
	let progress = $state<number | null>(null);
	let error = $state('');

	onMount(() => {
		check_for_update().then((found) => (update = found), (e) => console.warn('update check failed:', e));
	});

	async function install() {
		try {
			await update!.download({ onProgress: (received, total) => (progress = total ? received / total : null) });
			await update!.install();
		} catch (e) {
			error = (e as Error).message;
		}
	}
</script>

<div class="app">
	<div class="card">
		{#if update}
			<div class="update">
				<div class="count-label">Version {update.version} is available</div>
				{#if error}
					<div class="hint">{error}</div>
				{:else if update.installable}
					<div class="btn primary" onclick={install}>{progress === null ? 'Install and restart' : `${Math.round(progress * 100)}%`}</div>
				{:else if update.url}
					<div class="hint">Get it at {update.url}</div>
				{/if}
			</div>
		{/if}
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
	.update {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding-bottom: 8px;
	}
	.count-label {
		color: #cdd6f4;
		font-size: 14px;
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
