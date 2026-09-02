<script>
	import { resolved } from '../lib/theme.svelte.js';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';

	let { icon = 'leaf', title, body = '', action = null } = $props();

	const mode = $derived(resolved());
</script>

<div class="empty {mode}">
	<div class="glyph {mode}"><Icon name={icon} size={28} tone="accent" /></div>
	<div class="title">{title}</div>
	{#if body}<div class="body {mode}">{body}</div>{/if}
	{#if action}<Button label={action.label} icon={action.icon} variant="primary" onclick={action.onclick} />{/if}
</div>

<style>
	.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 48px 24px; text-align: center; user-select: none; }
	.glyph { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 28px; }
	.glyph.light { background-color: #e2e9d6; color: #5f7a4a; }
	.glyph.dark { background-color: #2e3927; color: #8fae74; }
	.title { font-size: 16px; line-height: 22px; font-weight: 600; }
	.body { max-width: 380px; font-size: 13px; line-height: 20px; }
	.body.light { color: #6b6154; }
	.body.dark { color: #b2a791; }
</style>
