<script>
	import { push, route } from '../lib/router.svelte.js';
	import { resolved } from '../lib/theme.svelte.js';
	import { focus } from '../lib/ui.svelte.js';
	import Icon from './Icon.svelte';

	let { label, icon, path, count = null } = $props();

	const mode = $derived(resolved());
	const active = $derived(route.path === path);

	function go() {
		if (!active) push(path);
		focus('root');
	}
</script>

<div class="nav {mode}" class:active onclick={go} testId="nav-{label}">
	<Icon name={icon} size={16} tone={active ? 'accentDeep' : 'muted'} />
	<div class="label">{label}</div>
	{#if count != null && count > 0}<div class="count {mode}">{count}</div>{/if}
</div>

<style>
	.nav { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 7px; font-size: 13px; line-height: 18px; cursor: pointer; user-select: none; }
	.nav.light { color: #6b6154; }
	.nav.light:hover { background-color: rgba(42, 37, 31, 0.05); color: #2a251f; }
	.nav.active.light { background-color: #e2e9d6; color: #3f5a30; }
	.nav.dark { color: #b2a791; }
	.nav.dark:hover { background-color: rgba(236, 227, 211, 0.06); color: #ece3d3; }
	.nav.active.dark { background-color: #2e3927; color: #b7d19f; }
	.label { flex-grow: 1; pointer-events: none; }
	.count { padding: 0 7px; border-radius: 999px; font-size: 11px; line-height: 16px; pointer-events: none; }
	.count.light { background-color: #ece4d4; color: #6b6154; }
	.count.dark { background-color: #36302a; color: #b2a791; }
</style>
