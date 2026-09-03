<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		label = '',
		hint = '',
		checked = false,
		disabled = false,
		onchange = null,
		testid = null
	}: {
		label?: string;
		hint?: string;
		checked?: boolean;
		disabled?: boolean;
		onchange?: ((checked: boolean) => void) | null;
		testid?: string | null;
	} = $props();
</script>

<div
	class="toggle"
	class:disabled
	hitbox="self"
	onclick={() => {
		if (!disabled) onchange?.(!checked);
	}}
	testId={testid}
>
	<div class="box" class:on={checked}>
		{#if checked}<Icon name="check" size={13} tone="onAccent" />{/if}
	</div>
	<div class="text">
		{#if label}<div class="label">{label}</div>{/if}
		{#if hint}<div class="hint">{hint}</div>{/if}
	</div>
</div>

<style>
	.toggle { display: flex; flex-direction: row; align-items: start; gap: 10px; padding: 4px 2px; border-radius: 8px; cursor: pointer; user-select: none; }
	.toggle.disabled { cursor: default; opacity: 0.5; }
	.box { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; margin-top: 1px; border-radius: 5px; border-width: 1px; background-color: var(--field); border-color: var(--borderStrong); }
	.box.on { background-color: var(--accent); border-color: var(--accent); }
	.text { display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0; }
	.label { font-size: 13px; line-height: 18px; }
	.hint { font-size: 11px; line-height: 15px; color: var(--inkFaint); }
</style>
