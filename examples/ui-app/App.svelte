<script lang="ts">
	import { Avatar, Badge, Button, Icon, Kbd, Link, Menu, Router, Separator, Toaster, apply_theme, toast } from 'gpuix-svelte-ui';
	import Deployments from './Deployments.svelte';
	import Overview from './Overview.svelte';
	import Settings from './Settings.svelte';

	const NAV = [
		{ href: '/', label: 'Overview' },
		{ href: '/deployments', label: 'Deployments' },
		{ href: '/settings', label: 'Settings' }
	];

	let account = $state(false);

	$effect(() => apply_theme('dark'));
</script>

<div class="app">
	<Router routes={{ '/': Overview, '/deployments': Deployments, '/settings': Settings }}>
		{#snippet layout(content)}
			<div class="shell">
				<div class="sidebar">
					<div class="brand">
						<div class="logo">O</div>
						<div class="name">Orbit</div>
						<Badge tone="accent">Pro</Badge>
					</div>
					{#each NAV as item (item.href)}
						<Link href={item.href}>
							{#snippet children({ active })}
								<div class="item" class:active>{item.label}</div>
							{/snippet}
						</Link>
					{/each}
					<div class="spacer"></div>
					<div class="hint">
						<Kbd>⌘[</Kbd>
						<Kbd>⌘]</Kbd>
						<div>back and forward</div>
					</div>
					<Separator />
					<Menu
						open={account}
						onclose={() => (account = false)}
						side="top"
						items={[
							{ label: 'Profile', onselect: () => toast('Profile') },
							{ label: 'Keyboard shortcuts', shortcut: '⌘/', onselect: () => toast('Keyboard shortcuts') },
							{ separator: true },
							{ label: 'Sign out', danger: true, onselect: () => toast({ title: 'Signed out', description: 'Not really: this is an example.' }) }
						]}
					>
						<Button variant="ghost" onclick={() => (account = !account)}>
							<Avatar name="Ada Lovelace" size={24} />
							<div class="who">Ada Lovelace</div>
							<Icon name="chevron-up" size={14} />
						</Button>
					</Menu>
				</div>
				<div class="main">{@render content()}</div>
			</div>
		{/snippet}
	</Router>
	<Toaster />
</div>

<style>
	.app {
		display: flex;
		width: 100%;
		height: 100%;
		font-size: 14px;
		background-color: var(--ui-bg);
		color: var(--ui-ink);
	}
	.shell {
		display: flex;
		flex-direction: row;
		flex-grow: 1;
		min-height: 0;
	}
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 220px;
		flex-shrink: 0;
		padding: 18px 12px 12px;
		background-color: var(--ui-panel);
		border-width: 0 1px 0 0;
		border-style: solid;
		border-color: var(--ui-border);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 8px 18px;
	}
	.logo {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		font-weight: 700;
		background-color: var(--ui-accent);
		color: var(--ui-on-accent);
	}
	.name {
		flex-grow: 1;
		font-size: 15px;
		font-weight: 600;
	}
	.item {
		padding: 7px 10px;
		border-radius: 6px;
		color: var(--ui-muted);
	}
	.item:hover {
		color: var(--ui-ink);
		background-color: var(--ui-raised);
	}
	.item.active {
		color: var(--ui-ink);
		background-color: var(--ui-raised);
	}
	.spacer {
		flex-grow: 1;
	}
	.hint {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 8px;
		font-size: 12px;
		color: var(--ui-muted);
	}
	.who {
		flex-grow: 1;
	}
	.main {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		min-width: 0;
	}
</style>
