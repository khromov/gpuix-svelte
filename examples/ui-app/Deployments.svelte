<script lang="ts">
	import { Card, Scroller, Separator, Skeleton, Stack, Tabs } from 'gpuix-svelte-ui';
	import DeploymentRow from './DeploymentRow.svelte';
	import { DEPLOYMENTS } from './data.svelte.ts';

	let filter = $state('all');
	let loading = $state(true);

	const shown = $derived(DEPLOYMENTS.filter((d) => filter === 'all' || (filter === 'production') === (d.branch === 'main')));

	// Stands in for a fetch, so the screen shows its placeholders first.
	$effect(() => {
		const timer = setTimeout(() => (loading = false), 700);
		return () => clearTimeout(timer);
	});
</script>

<Scroller pad="28px" gap={20}>
	<div class="titles">
		<div class="title">Deployments</div>
		<div class="muted">Every push, newest first.</div>
	</div>
	<Tabs
		items={[
			{ value: 'all', label: 'All' },
			{ value: 'production', label: 'Production' },
			{ value: 'preview', label: 'Previews' }
		]}
		value={filter}
		onchange={(v) => (filter = v)}
	/>
	<Card>
		{#if loading}
			{#each [0, 1, 2] as i (i)}
				{#if i > 0}<Separator />{/if}
				<Stack direction="row" gap={14} align="center">
					<Skeleton width={84} height={22} radius={11} />
					<Stack gap={6} grow={1}>
						<Skeleton width="50%" height={14} />
						<Skeleton width="25%" height={10} />
					</Stack>
					<Skeleton width={28} height={28} radius={14} />
				</Stack>
			{/each}
		{:else}
			{#each shown as deployment, i (deployment.id)}
				{#if i > 0}<Separator />{/if}
				<DeploymentRow {deployment} />
			{/each}
		{/if}
	</Card>
</Scroller>

<style>
	.titles {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.title {
		font-size: 22px;
		font-weight: 600;
	}
	.muted {
		font-size: 13px;
		color: var(--ui-muted);
	}
</style>
