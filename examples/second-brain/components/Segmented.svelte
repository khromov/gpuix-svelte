<script>
	import Icon from './Icon.svelte';

	let { options = [], value, onchange, small = false } = $props();

</script>

<div class="seg" class:small>
	{#each options as option (option.value)}
		<div class="item" class:on={option.value === value} class:small onclick={() => onchange?.(option.value)}>
			{#if option.icon}<Icon name={option.icon} size={small ? 13 : 14} tone={option.value === value ? 'ink' : 'muted'} />{/if}
			{#if option.label}<div class="text">{option.label}</div>{/if}
		</div>
	{/each}
</div>

<style>
	.seg { display: flex; flex-direction: row; gap: 2px; padding: 2px; border-radius: 7px; user-select: none; background-color: var(--sunken); }
	.item { display: flex; flex-direction: row; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 5px; font-size: 12px; line-height: 16px; cursor: pointer; color: var(--inkMuted); }
	.item.small { padding: 3px 7px; }
	.text { pointer-events: none; }
	.item:hover { color: var(--ink); }
	.item.on { background-color: var(--control); color: var(--ink); }
</style>
