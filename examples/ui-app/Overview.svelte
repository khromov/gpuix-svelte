<script lang="ts">
	import { Badge, Button, Card, Link, Progress, Scroller, Separator, toast } from 'gpuix-svelte-ui';
	import DeploymentRow from './DeploymentRow.svelte';
	import { DEPLOYMENTS, settings } from './data.svelte.ts';
</script>

<Scroller pad="28px" gap={20}>
	<div class="header">
		<div class="titles">
			<div class="title">Overview</div>
			<div class="muted">{settings.name}, deployed from main</div>
		</div>
		<Button variant="primary" onclick={() => toast({ title: 'Deploy queued', description: 'main at 4f2a91c', tone: 'accent' })}>Deploy</Button>
	</div>
	<div class="stats">
		<div class="stat">
			<Card title="Requests">
				<div class="figure">
					<div class="number">1.2M</div>
					<Badge tone="success">+12%</Badge>
				</div>
			</Card>
		</div>
		<div class="stat">
			<Card title="Bandwidth">
				<Progress value={64} label="64 of 100 GB" show_value />
			</Card>
		</div>
		<div class="stat">
			<Card title="Build minutes">
				<Progress value={460} max={500} tone="warning" label="460 of 500" show_value />
			</Card>
		</div>
	</div>
	<Card title="Recent deployments">
		{#snippet actions()}
			<Link href="/deployments"><div class="more">View all</div></Link>
		{/snippet}
		{#each DEPLOYMENTS.slice(0, 3) as deployment, i (deployment.id)}
			{#if i > 0}<Separator />{/if}
			<DeploymentRow {deployment} />
		{/each}
	</Card>
</Scroller>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.titles {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex-grow: 1;
	}
	.title {
		font-size: 22px;
		font-weight: 600;
	}
	.muted {
		font-size: 13px;
		color: var(--ui-muted);
	}
	.stats {
		display: flex;
		justify-content: space-between;
	}
	.stat {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		width: 32%;
	}
	.figure {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.number {
		font-size: 26px;
		font-weight: 600;
	}
	.more {
		font-size: 13px;
		color: var(--ui-accent-ink);
	}
</style>
