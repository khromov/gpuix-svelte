<script>
	import { resolved } from '../lib/theme.svelte.js';
	import Button from './Button.svelte';

	let { label = '', value = '', placeholder = '', hint = '', secret = false, readOnly = false, mono = false, onchange = null, onsubmit = null } = $props();

	const mode = $derived(resolved());
	let reveal = $state(false);
	let focused = $state(false);
	const masked = $derived(value ? '•'.repeat(Math.min(24, value.length)) : '');
</script>

<div class="field">
	{#if label}<div class="label {mode}">{label}</div>{/if}
	<div class="row">
		{#if secret && !reveal}
			<div class="masked {mode}">{masked || placeholder}</div>
			<Button label="Reveal" small onclick={() => (reveal = true)} />
		{:else}
			<input
				{value}
				{placeholder}
				{readOnly}
				class="input {mode}"
				class:focused
				class:mono
				onchange={(e) => onchange?.(e.value)}
				onsubmit={(e) => onsubmit?.(e.value)}
				onfocus={() => (focused = true)}
				onblur={() => (focused = false)}
			/>
		{/if}
	</div>
	{#if hint}<div class="hint {mode}">{hint}</div>{/if}
</div>

<style>
	.field { display: flex; flex-direction: column; gap: 5px; }
	.label { font-size: 12px; line-height: 16px; font-weight: 600; user-select: none; }
	.label.light { color: #6b6154; }
	.label.dark { color: #b2a791; }
	.row { display: flex; flex-direction: row; align-items: center; gap: 8px; }
	.input { flex-grow: 1; padding: 7px 10px; border-radius: 6px; border-width: 1px; font-size: 13px; line-height: 18px; }
	.input.mono { font-family: Lilex; font-size: 12px; }
	.input.light { background-color: #ffffff; border-color: #cbbfa6; color: #2a251f; }
	.input.focused.light { border-color: #5f7a4a; }
	.input.dark { background-color: #151210; border-color: #4a4237; color: #ece3d3; }
	.input.focused.dark { border-color: #8fae74; }
	.masked { flex-grow: 1; padding: 7px 10px; border-radius: 6px; border-width: 1px; font-size: 13px; line-height: 18px; }
	.masked.light { background-color: #ece4d4; border-color: #e2d8c4; color: #6b6154; }
	.masked.dark { background-color: #1b1815; border-color: #36302a; color: #b2a791; }
	.hint { font-size: 11px; line-height: 15px; }
	.hint.light { color: #9b9080; }
	.hint.dark { color: #7b7163; }
</style>
