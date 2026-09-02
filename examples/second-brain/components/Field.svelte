<script>
	import Button from './Button.svelte';

	let { label = '', value = '', placeholder = '', hint = '', secret = false, readOnly = false, mono = false, onchange = null, onsubmit = null } = $props();

	let reveal = $state(false);
	let focused = $state(false);
	const masked = $derived(value ? '•'.repeat(Math.min(24, value.length)) : '');
</script>

<div class="field">
	{#if label}<div class="label">{label}</div>{/if}
	<div class="row">
		{#if secret && !reveal}
			<div class="masked">{masked || placeholder}</div>
			<Button label="Reveal" small onclick={() => (reveal = true)} />
		{:else}
			<input
				{value}
				{placeholder}
				{readOnly}
				class="input"
				class:focused
				class:mono
				onchange={(e) => onchange?.(e.value)}
				onsubmit={(e) => onsubmit?.(e.value)}
				onfocus={() => (focused = true)}
				onblur={() => (focused = false)}
			/>
		{/if}
	</div>
	{#if hint}<div class="hint">{hint}</div>{/if}
</div>

<style>
	.field { display: flex; flex-direction: column; gap: 5px; }
	.label { font-size: 12px; line-height: 16px; font-weight: 600; user-select: none; color: var(--inkMuted); }
	.row { display: flex; flex-direction: row; align-items: center; gap: 8px; }
	.input { flex-grow: 1; padding: 7px 10px; border-radius: 6px; border-width: 1px; font-size: 13px; line-height: 18px; background-color: var(--field); border-color: var(--borderStrong); color: var(--ink); }
	.input.mono { font-family: Lilex; font-size: 12px; }
	.input.focused { border-color: var(--accent); }
	.masked { flex-grow: 1; padding: 7px 10px; border-radius: 6px; border-width: 1px; font-size: 13px; line-height: 18px; background-color: var(--sunken); border-color: var(--border); color: var(--inkMuted); }
	.hint { font-size: 11px; line-height: 15px; color: var(--inkFaint); }
</style>
