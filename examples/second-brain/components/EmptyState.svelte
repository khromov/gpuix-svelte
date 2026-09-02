<script lang="ts">
	import type { IconName } from '../lib/icons.ts';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';

	let {
		icon = 'leaf',
		title,
		body = '',
		action = null
	}: { icon?: IconName; title: string; body?: string; action?: { label: string; onclick: () => void } | null } = $props();
</script>

<div class="empty">
	<div class="glyph"><Icon name={icon} size={28} tone="accent" /></div>
	<div class="title">{title}</div>
	{#if body}<div class="body">{body}</div>{/if}
	{#if action}<Button label={action.label} icon={action.icon} variant="primary" onclick={action.onclick} />{/if}
</div>

<style>
	.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 48px 24px; text-align: center; user-select: none; }
	.glyph { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 28px; background-color: var(--accentSoft); color: var(--accent); }
	.title { font-size: 16px; line-height: 22px; font-weight: 600; }
	.body { max-width: 380px; font-size: 13px; line-height: 20px; color: var(--inkMuted); }
</style>
