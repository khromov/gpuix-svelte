<script>
	import { data } from '../lib/data.svelte.js';
	import { push, route } from '../lib/router.svelte.js';
	import { resolved, set_mode, theme } from '../lib/theme.svelte.js';
	import { focus } from '../lib/ui.svelte.js';
	import Icon from './Icon.svelte';
	import NavItem from './NavItem.svelte';
	import Segmented from './Segmented.svelte';
	import StatusPill from './StatusPill.svelte';

	const mode = $derived(resolved());

	function home() {
		if (route.path !== '/') push('/');
		focus('root');
	}

	const THEMES = [
		{ value: 'light', icon: 'sun' },
		{ value: 'dark', icon: 'moon' },
		{ value: 'system', icon: 'monitor' }
	];
</script>

<div class="sidebar {mode}">
	<div class="brand {mode}" onclick={home} testId="brand">
		<div class="mark {mode}"><Icon name="leaf" size={18} tone="onAccent" /></div>
		<div class="word">Substrate</div>
	</div>

	<div class="nav">
		<NavItem label="Everything" icon="inbox" path="/" count={data.counts.total} />
		<NavItem label="Notes" icon="note" path="/notes" count={data.counts.by_kind.text} />
		<NavItem label="Links" icon="link" path="/links" count={data.counts.by_kind.link} />
		<NavItem label="Images" icon="image" path="/images" count={data.counts.by_kind.image} />
		<NavItem label="Audio" icon="audio" path="/audio" count={data.counts.by_kind.audio} />
	</div>

	<div class="section {mode}">Think</div>
	<div class="nav">
		<NavItem label="Ask" icon="sparkles" path="/ask" />
	</div>

	<div class="spacer"></div>

	<div class="footer">
		<StatusPill />
		<div class="row">
			<Segmented options={THEMES} value={theme.mode} onchange={set_mode} small />
			<div class="grow"></div>
			<NavItem label="Settings" icon="settings" path="/settings" />
		</div>
	</div>
</div>

<style>
	.sidebar { display: flex; flex-direction: column; gap: 6px; width: 224px; min-width: 224px; height: 100%; padding: 18px 12px 14px 12px; border-right-width: 1px; user-select: none; }
	.sidebar.light { background-color: #f1ebdf; border-color: #e2d8c4; }
	.sidebar.dark { background-color: #171411; border-color: #2b2621; }
	.brand { display: flex; flex-direction: row; align-items: center; gap: 10px; margin-bottom: 6px; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
	.brand.light:hover { background-color: rgba(42, 37, 31, 0.05); }
	.brand.dark:hover { background-color: rgba(236, 227, 211, 0.06); }
	.mark { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 9px; pointer-events: none; }
	.mark.light { background-color: #5f7a4a; color: #f8f5ec; }
	.mark.dark { background-color: #8fae74; color: #1b1815; }
	.word { font-size: 20px; line-height: 26px; font-weight: 700; pointer-events: none; }
	.nav { display: flex; flex-direction: column; gap: 2px; }
	.section { padding: 12px 10px 4px 10px; font-size: 11px; line-height: 14px; font-weight: 600; }
	.section.light { color: #9b9080; }
	.section.dark { color: #7b7163; }
	.spacer { flex-grow: 1; }
	.footer { display: flex; flex-direction: column; gap: 10px; }
	.row { display: flex; flex-direction: row; align-items: center; gap: 6px; }
	.grow { flex-grow: 1; }
</style>
