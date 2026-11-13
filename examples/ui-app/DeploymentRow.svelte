<script lang="ts">
	import { Avatar, Badge, Spinner, type Tone } from 'gpuix-svelte-ui';
	import type { Deployment } from './data.svelte.ts';

	let { deployment }: { deployment: Deployment } = $props();

	const STATUS: Record<Deployment['status'], { tone: Tone; label: string }> = {
		ready: { tone: 'success', label: 'Ready' },
		building: { tone: 'accent', label: 'Building' },
		failed: { tone: 'danger', label: 'Failed' }
	};
	const status = $derived(STATUS[deployment.status]);
</script>

<div class="row">
	<div class="status"><Badge tone={status.tone}>{status.label}</Badge></div>
	<div class="text">
		<div>{deployment.message}</div>
		<div class="meta">#{deployment.id} · {deployment.branch} · {deployment.age}</div>
	</div>
	{#if deployment.status === 'building'}
		<Spinner size={16} label="Building" />
	{/if}
	<Avatar name={deployment.author} size={28} />
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.status {
		display: flex;
		width: 84px;
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-grow: 1;
		min-width: 0;
	}
	.meta {
		font-size: 12px;
		color: var(--ui-muted);
	}
</style>
