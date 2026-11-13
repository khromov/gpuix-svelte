<script lang="ts">
	import { onDestroy } from 'svelte';
	import { IS_GPUIX, media_query, on_window_key, window_size } from 'gpuix-svelte';
	import {
		Avatar,
		Badge,
		Button,
		Card,
		Checkbox,
		Dialog,
		Kbd,
		Link,
		Menu,
		Progress,
		RadioGroup,
		Router,
		Scroller,
		Select,
		Separator,
		Skeleton,
		Slider,
		Spinner,
		Stack,
		Tabs,
		TextArea,
		TextField,
		Toaster,
		Toggle,
		Tooltip,
		apply_theme,
		back,
		forward,
		href,
		router,
		screen,
		test_id,
		toast,
		type MenuEntry,
		type Option,
		type RouteProps
	} from 'gpuix-svelte-ui';

	// Every component once, on one screen: `demo:ui` opens it in a GPUI window, `demo:ui-dom` serves it
	// as a page, and test/ui.ts and test/ui-dom.ts click through it on each renderer by the same ids.
	let dark = $state(true);
	let count = $state(0);
	let notifications = $state(true);
	let terms = $state(false);
	let plan = $state('pro');
	let name = $state('');
	let notes = $state('');
	let fruit = $state<string | null>(null);
	let volume = $state(40);
	let tab = $state('overview');
	let dialog = $state(false);
	let menu = $state(false);
	let last = $state('nothing yet');

	// The same breakpoint as the @media rule below, so the chip and the layout agree.
	const narrow = media_query('(width <= 720px)');

	$effect(() => apply_theme(dark ? 'dark' : 'light'));

	onDestroy(
		on_window_key('keydown', (e) => {
			if (!e.editing && e.key === 't') dark = !dark;
		})
	);

	const PLANS: Option[] = [
		{ value: 'free', label: 'Free', description: 'For trying it out' },
		{ value: 'pro', label: 'Pro', description: 'Everything, for one person' },
		{ value: 'team', label: 'Team', description: 'Shared workspaces', disabled: true }
	];
	const FRUITS: Option[] = [
		{ value: 'cherry', label: 'Cherry', description: 'Out of season', disabled: true },
		{ value: 'apple', label: 'Apple' },
		{ value: 'banana', label: 'Banana' },
		{ value: 'durian', label: 'Durian', description: 'An acquired taste' }
	];
	const TABS: Option[] = [
		{ value: 'overview', label: 'Overview' },
		{ value: 'activity', label: 'Activity' },
		{ value: 'settings', label: 'Settings' },
		{ value: 'billing', label: 'Billing', disabled: true }
	];
	const ACTIONS: MenuEntry[] = [
		{ label: 'Rename', shortcut: '⌘R', onselect: () => (last = 'Rename') },
		{ label: 'Duplicate', shortcut: '⌘D', onselect: () => (last = 'Duplicate') },
		{ label: 'Archive', disabled: true },
		{ separator: true },
		{ label: 'Delete', danger: true, onselect: () => (last = 'Delete') }
	];
</script>

<div class="page" {...test_id('page')}>
	<Scroller pad="24px" gap={0} testid="scroll">
		<div class="showcase">
			<div class="header">
				<div class="title">gpuix-svelte-ui</div>
				<Badge tone="accent" testid="target">{IS_GPUIX ? 'GPUI' : 'DOM'}</Badge>
				<div class="chip" {...test_id('size')}>{window_size.width} × {window_size.height}</div>
				<div class="chip" {...test_id('layout')}>{narrow.current ? 'narrow' : 'wide'}</div>
				<div class="spacer"></div>
				<Tooltip content="Toggle the theme (T)">
					{#snippet children(hover, focus)}
						<Button {...hover} {...focus} onclick={() => (dark = !dark)} testid="theme">{dark ? 'Light' : 'Dark'}</Button>
					{/snippet}
				</Tooltip>
				<Menu open={menu} onclose={() => (menu = false)} items={ACTIONS} testid="menu">
					<Button onclick={() => (menu = !menu)} testid="menu-button">Actions</Button>
				</Menu>
				<Button variant="primary" onclick={() => (dialog = true)} testid="open-dialog">Open dialog</Button>
			</div>

			<div class="grid" {...test_id('grid')}>
				<div class="cell">
					<Card title="Buttons" description="Four variants, two sizes, and a disabled state.">
						<div class="row">
							<Button>Default</Button>
							<Button variant="primary">Primary</Button>
							<Button variant="ghost">Ghost</Button>
							<Button variant="danger">Danger</Button>
							<Button disabled>Disabled</Button>
						</div>
						<div class="row">
							<Button size="sm" onclick={() => count--} testid="minus">−</Button>
							<div class="count" {...test_id('count')}>{count}</div>
							<Button size="sm" onclick={() => count++} testid="plus">+</Button>
							<div class="muted" {...test_id('last')}>Last action: {last}</div>
						</div>
					</Card>
				</div>

				<div class="cell">
					<Card title="Fields">
						<TextField value={name} onchange={(v) => (name = v)} onsubmit={() => toast(`Hello, ${name || 'stranger'}`)} label="Name" placeholder="Your name" hint="Enter shows a toast" testid="name" />
						<div class="muted" {...test_id('name-echo')}>You typed: {name || '(nothing)'}</div>
						<TextField value="acme" onchange={() => {}} onsubmit={() => (last = 'Locked')} label="Workspace" hint="A disabled field" disabled testid="locked" />
						<TextArea value={notes} onchange={(v) => (notes = v)} label="Notes" placeholder="A few lines" rows={2} testid="notes" />
						<Select options={FRUITS} value={fruit} onchange={(v) => (fruit = v)} label="Fruit" placeholder="Pick one" testid="fruit" />
						<div class="muted" {...test_id('fruit-echo')}>Picked: {fruit ?? 'nothing yet'}</div>
					</Card>
				</div>

				<div class="cell">
					<Card title="Choices">
						<Toggle checked={notifications} onchange={(on) => (notifications = on)} label="Notifications" testid="notifications" />
						<Toggle checked={dark} onchange={(on) => (dark = on)} label="Dark theme" testid="dark" />
						<Checkbox checked={terms} onchange={(on) => (terms = on)} label="Accept the terms" description="Required before you can continue." testid="terms" />
						<Separator />
						<RadioGroup options={PLANS} value={plan} onchange={(v) => (plan = v)} label="Plan" testid="plan" />
						<div class="muted" {...test_id('choices-echo')}>
							{notifications ? 'You will be notified.' : 'Notifications are off.'} Plan: {plan}. {terms ? 'Terms accepted.' : 'Terms pending.'}
						</div>
					</Card>
				</div>

				<div class="cell">
					<Card title="Ranges">
						<Slider value={volume} onchange={(v) => (volume = v)} label="Volume" format={(v) => `${v}%`} testid="volume" />
						<Progress value={volume} label="Level" show_value tone={volume > 80 ? 'danger' : volume > 60 ? 'warning' : 'accent'} testid="level" />
						<Progress value={3} max={4} size="sm" tone="success" />
						<div class="muted" {...test_id('volume-echo')}>Volume: {volume}</div>
					</Card>
				</div>

				<div class="cell">
					<Card title="Tabs">
						<Tabs items={TABS} value={tab} onchange={(v) => (tab = v)} testid="tabs" />
						<div class="muted" {...test_id('tab-echo')}>
							{#if tab === 'overview'}
								An overview. Arrow keys move between tabs.
							{:else if tab === 'activity'}
								Nothing has happened yet.
							{:else}
								Settings would go here.
							{/if}
						</div>
					</Card>
				</div>

				<div class="cell">
					<Card title="Feedback">
						{#snippet actions()}
							<Spinner size={18} />
						{/snippet}
						<div class="row">
							<Badge>neutral</Badge>
							<Badge tone="accent">accent</Badge>
							<Badge tone="success">success</Badge>
							<Badge tone="warning">warning</Badge>
							<Badge tone="danger">danger</Badge>
						</div>
						<div class="row">
							<Button size="sm" onclick={() => toast('Saved')} testid="toast-plain">Toast</Button>
							<Button size="sm" onclick={() => toast({ title: 'Export finished', description: '12 files written to ~/Desktop.', tone: 'success', action: { label: 'Open', onclick: () => (last = 'Open') } })} testid="toast-rich">Rich toast</Button>
							<Button size="sm" onclick={() => toast({ title: 'Disk almost full', tone: 'warning', duration: null })} testid="toast-sticky">Sticky</Button>
						</div>
						<Stack direction="row" gap={10} align="center">
							<Avatar name="Ada Lovelace" />
							<Avatar name="Grace Hopper" size={40} />
							<Stack gap={6} grow={1}>
								<Skeleton width="60%" />
								<Skeleton width="90%" height={12} />
							</Stack>
						</Stack>
						<div class="row">
							<Kbd>T</Kbd>
							<div class="muted">toggles the theme,</div>
							<Kbd>Esc</Kbd>
							<div class="muted">closes the dialog,</div>
							<Kbd>Tab</Kbd>
							<div class="muted">walks the controls.</div>
						</div>
					</Card>
				</div>

				<div class="cell">
					{#snippet home()}
						<div class="muted">Home. Pick a link above; ⌘[ and ⌘] (Alt+arrows elsewhere) go back and forward.</div>
					{/snippet}
					{#snippet items()}
						<div class="row">
							<div class="muted">Three items:</div>
							{#each [1, 2, 3] as id (id)}
								<Link href={href('/items/:id', { id })} testid="go-item-{id}"><Kbd>{id}</Kbd></Link>
							{/each}
						</div>
					{/snippet}
					{#snippet item({ params }: RouteProps)}
						<div class="muted">Item {params.id}, mounted fresh for this path.</div>
					{/snippet}
					{#snippet lost()}
						<div class="muted">Nothing at {router.path}; this is the table's * entry.</div>
					{/snippet}
					<Card title="Screens" description="A Router over four routes, Links with an active state, and a history stack.">
						<div class="row">
							<Link href="/" testid="go-home">{#snippet children({ active })}<Badge tone={active ? 'accent' : 'neutral'}>Home</Badge>{/snippet}</Link>
							<Link href="/items" testid="go-items">{#snippet children({ active })}<Badge tone={active ? 'accent' : 'neutral'}>Items</Badge>{/snippet}</Link>
							<Link href={href('/items/:id', { id: 3 })} testid="go-item">{#snippet children({ active })}<Badge tone={active ? 'accent' : 'neutral'}>Item 3</Badge>{/snippet}</Link>
							<Link href="/nowhere" testid="go-lost">{#snippet children({ active })}<Badge tone={active ? 'accent' : 'neutral'}>Lost</Badge>{/snippet}</Link>
							<div class="spacer"></div>
							<Button size="sm" disabled={!router.can_go_back} onclick={back} testid="back">Back</Button>
							<Button size="sm" disabled={!router.can_go_forward} onclick={forward} testid="forward">Forward</Button>
						</div>
						<div class="screen" {...test_id('screen')}>
							<Router routes={{ '/': screen(home), '/items': screen(items), '/items/:id': screen(item), '*': screen(lost) }} testid="router" />
						</div>
						<div class="muted" {...test_id('route')}>At {router.href}</div>
					</Card>
				</div>
			</div>
		</div>
	</Scroller>

	<Dialog open={dialog} onclose={() => (dialog = false)} title="Delete this project?" description="This cannot be undone. The files stay on disk." testid="dialog">
		<div class="muted">Escape, the close button, Cancel or a click outside closes it.</div>
		{#snippet actions()}
			<Tooltip content="Keeps the project">
				{#snippet children(hover)}
					<Button {...hover} onclick={() => (dialog = false)} testid="cancel">Cancel</Button>
				{/snippet}
			</Tooltip>
			<Button
				variant="danger"
				onclick={() => {
					dialog = false;
					last = 'Deleted';
					toast({ title: 'Project deleted', tone: 'danger' });
				}}
				testid="confirm">Delete</Button
			>
		{/snippet}
	</Dialog>

	<Toaster testid="toaster" />
</div>

<style>
	.page {
		display: flex;
		width: 100%;
		height: 100%;
		font-size: 14px;
		background-color: var(--ui-bg);
		color: var(--ui-ink);
	}
	.showcase {
		display: flex;
		flex-direction: column;
		gap: 16px;
		width: 100%;
		max-width: 1040px;
		align-self: center;
	}
	.header {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.title {
		font-size: 18px;
		font-weight: 600;
	}
	.chip {
		padding: 0 8px;
		border-radius: 999px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--ui-border);
		font-family: var(--ui-mono);
		font-size: 12px;
		line-height: 20px;
		white-space: nowrap;
		color: var(--ui-muted);
	}
	.spacer {
		flex-grow: 1;
	}
	.grid {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: 16px;
	}
	.cell {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		min-width: 0;
	}
	@media (width > 720px) {
		.cell {
			flex-basis: 320px;
		}
	}
	@media (width <= 720px) {
		.grid {
			flex-direction: column;
			gap: 12px;
		}
	}
	.row {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 40px;
		padding: 10px 12px;
		border-radius: 8px;
		background-color: var(--ui-raised);
	}
	.count {
		min-width: 32px;
		text-align: center;
		font-family: var(--ui-mono);
		font-size: 18px;
		font-weight: 600;
	}
	.muted {
		font-size: 13px;
		line-height: 18px;
		color: var(--ui-muted);
	}
</style>
