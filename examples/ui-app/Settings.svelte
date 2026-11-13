<script lang="ts">
	import { Avatar, Badge, Button, Card, Checkbox, Dialog, Icon, RadioGroup, Scroller, Select, Separator, Slider, Tabs, TextArea, TextField, Toggle, Tooltip, toast } from 'gpuix-svelte-ui';
	import { MEMBERS, REGIONS, discard, save, settings } from './data.svelte.ts';

	let tab = $state('general');
	let deleting = $state(false);
	let confirm = $state('');
	let invite = $state('');

	const valid = $derived(/^[a-z0-9-]+$/.test(settings.name));
</script>

<Scroller pad="28px" gap={20}>
	<div class="header">
		<div class="titles">
			<div class="title">Settings</div>
			<div class="muted">How {settings.name} builds, where it runs and who can deploy it.</div>
		</div>
		<Button
			variant="ghost"
			onclick={() => {
				discard();
				toast('Changes discarded');
			}}>Discard</Button
		>
		<Button
			variant="primary"
			disabled={!valid}
			onclick={() => {
				save();
				toast({ title: 'Settings saved', description: 'They apply from the next deploy.', tone: 'success' });
			}}>Save changes</Button
		>
	</div>

	<Tabs
		items={[
			{ value: 'general', label: 'General' },
			{ value: 'members', label: 'Members' },
			{ value: 'billing', label: 'Billing', disabled: true }
		]}
		value={tab}
		onchange={(v) => (tab = v)}
	/>

	{#if tab === 'general'}
		<div class="columns">
			<div class="column">
				<Card title="Project">
					<TextField
						value={settings.name}
						onchange={(v) => (settings.name = v)}
						label="Name"
						hint="orbit.app/{settings.name}"
						error={valid ? null : 'Lowercase letters, digits and dashes only'}
					/>
					<Select options={REGIONS} value={settings.region} onchange={(v) => (settings.region = v)} label="Region" placeholder="Pick a region" />
					<TextArea value={settings.description} onchange={(v) => (settings.description = v)} label="Description" rows={2} />
				</Card>
			</div>
			<div class="column">
				<Card title="Builds">
					<Toggle checked={settings.auto_deploy} onchange={(v) => (settings.auto_deploy = v)} label="Deploy every push to main" />
					<Toggle checked={settings.previews} onchange={(v) => (settings.previews = v)} label="Preview deployments for branches" />
					<Checkbox checked={settings.notify} onchange={(v) => (settings.notify = v)} label="Email me when a build fails" />
					<Separator />
					<div class="field">
						<div class="label">Node.js</div>
						<Tooltip content="The version every build runs on">
							{#snippet children(hover, focus)}
								<Button {...hover} {...focus} variant="ghost" size="sm" label="About the Node.js version"><Icon name="info" size={14} /></Button>
							{/snippet}
						</Tooltip>
					</div>
					<RadioGroup
						options={[
							{ value: '22', label: '22' },
							{ value: '24', label: '24' },
							{ value: '26', label: '26' }
						]}
						value={settings.node}
						onchange={(v) => (settings.node = v)}
						label="Node.js"
						direction="row"
					/>
					<Slider value={settings.builds} onchange={(v) => (settings.builds = v)} min={1} max={8} label="Concurrent builds" format={(v) => `${v} at a time`} />
				</Card>
			</div>
		</div>
		<Card title="Danger zone">
			<div class="danger">
				<div class="muted grow">Deleting the project removes its deployments and domains.</div>
				<Button variant="danger" onclick={() => (deleting = true)}>Delete project</Button>
			</div>
		</Card>
	{:else}
		<Card title="Members" description="People who can deploy {settings.name}.">
			{#each MEMBERS as member (member.email)}
				<div class="member">
					<Avatar name={member.name} />
					<div class="grow">
						<div>{member.name}</div>
						<div class="muted">{member.email}</div>
					</div>
					<Badge tone={member.role === 'Owner' ? 'accent' : 'neutral'}>{member.role}</Badge>
				</div>
			{/each}
			<Separator />
			<div class="danger">
				<div class="grow">
					<TextField value={invite} onchange={(v) => (invite = v)} onsubmit={() => invite && toast(`Invited ${invite}`)} placeholder="name@example.com" />
				</div>
				<Button disabled={!invite.includes('@')} onclick={() => toast(`Invited ${invite}`)}><Icon name="plus" size={14} />Invite</Button>
			</div>
		</Card>
	{/if}
</Scroller>

<Dialog
	open={deleting}
	onclose={() => (deleting = false)}
	title="Delete {settings.name}?"
	description="Its deployments and domains go with it. This cannot be undone."
	size="sm"
>
	<TextField value={confirm} onchange={(v) => (confirm = v)} label="Type {settings.name} to confirm" />
	{#snippet actions()}
		<Button onclick={() => (deleting = false)}>Cancel</Button>
		<Button
			variant="danger"
			disabled={confirm !== settings.name}
			onclick={() => {
				deleting = false;
				toast({ title: `${settings.name} deleted`, description: 'Not really: this is an example.', tone: 'danger' });
			}}>Delete</Button
		>
	{/snippet}
</Dialog>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: 10px;
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
	.grow {
		flex-grow: 1;
		min-width: 0;
	}
	.columns {
		display: flex;
		align-items: start;
		justify-content: space-between;
	}
	.column {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		width: 48.5%;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.label {
		font-size: 13px;
		font-weight: 500;
	}
	.danger {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.member {
		display: flex;
		align-items: center;
		gap: 12px;
	}
</style>
