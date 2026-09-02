<script>
	import { resolved } from '../lib/theme.svelte.js';
	import Icon from './Icon.svelte';

	let { options = [], value, onchange, small = false } = $props();

	const mode = $derived(resolved());
</script>

<div class="seg {mode}" class:small>
	{#each options as option (option.value)}
		<div class="item {mode}" class:on={option.value === value} class:small onclick={() => onchange?.(option.value)}>
			{#if option.icon}<Icon name={option.icon} size={small ? 13 : 14} tone={option.value === value ? 'ink' : 'muted'} />{/if}
			{#if option.label}<div class="text">{option.label}</div>{/if}
		</div>
	{/each}
</div>

<style>
	.seg { display: flex; flex-direction: row; gap: 2px; padding: 2px; border-radius: 7px; user-select: none; }
	.seg.light { background-color: #ece4d4; }
	.seg.dark { background-color: #151210; }
	.item { display: flex; flex-direction: row; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 5px; font-size: 12px; line-height: 16px; cursor: pointer; }
	.item.small { padding: 3px 7px; }
	.text { pointer-events: none; }
	.item.light { color: #6b6154; }
	.item.light:hover { color: #2a251f; }
	.item.on.light { background-color: #fbf7ef; color: #2a251f; }
	.item.dark { color: #b2a791; }
	.item.dark:hover { color: #ece3d3; }
	.item.on.dark { background-color: #2b2621; color: #ece3d3; }
</style>
