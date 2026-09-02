<script>
	import { push, route } from '../lib/router.svelte.js';
	import { blur } from 'gpuix-svelte';
	import Icon from './Icon.svelte';

	let { label, icon, path, count = null } = $props();

	const active = $derived(route.path === path);

	function go() {
		if (!active) push(path);
		blur();
	}
</script>

<div class="nav" class:active hitbox="self" onclick={go} testId="nav-{label}">
	<Icon name={icon} size={16} tone={active ? 'accentDeep' : 'muted'} />
	<div class="label">{label}</div>
	{#if count != null && count > 0}<div class="count">{count}</div>{/if}
</div>

<style>
	.nav { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 7px; font-size: 13px; line-height: 18px; cursor: pointer; user-select: none; color: var(--inkMuted); }
	.nav:hover { background-color: var(--hover); color: var(--ink); }
	.nav.active { background-color: var(--accentSoft); color: var(--accentDeep); }
	.label { flex-grow: 1; }
	.count { padding: 0 7px; border-radius: 999px; font-size: 11px; line-height: 16px; background-color: var(--well); color: var(--inkMuted); }
</style>
