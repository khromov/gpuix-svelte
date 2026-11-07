<script lang="ts">
	import Icon from 'gpuix-svelte-ui/components/Icon.svelte';
	import { activates } from 'gpuix-svelte-ui/keys';
	import { aria_checked, own_hitbox, test_id } from 'gpuix-svelte-ui/shared';

	let {
		checked,
		onchange,
		label = null,
		description = null,
		disabled = false,
		testid = null
	}: {
		checked: boolean;
		onchange: (checked: boolean) => void;
		label?: string | null;
		description?: string | null;
		disabled?: boolean;
		testid?: string | null;
	} = $props();

	function flip() {
		if (!disabled) onchange(!checked);
	}
</script>

<div
	class="checkbox"
	class:disabled
	role="checkbox"
	aria-label={label}
	{...aria_checked(checked)}
	tabindex={disabled ? -1 : 0}
	{...own_hitbox}
	{...test_id(testid)}
	onclick={flip}
	onkeydown={(e) => activates(e) && flip()}
>
	<div class="box" class:on={checked}>
		{#if checked}<Icon name="check" size={12} />{/if}
	</div>
	{#if label || description}
		<div class="text">
			{#if label}<div class="label">{label}</div>{/if}
			{#if description}<div class="description">{description}</div>{/if}
		</div>
	{/if}
</div>

<style>
	.checkbox {
		display: flex;
		flex-direction: row;
		align-items: start;
		gap: 10px;
		cursor: pointer;
		user-select: none;
		border-radius: 6px;
	}
	.checkbox:focus-visible {
		outline-width: 2px;
		outline-offset: 2px;
		outline-style: solid;
		outline-color: var(--ui-ink);
	}
	.checkbox.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
	.box {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		margin-top: 1px;
		border-radius: 5px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--ui-border-strong);
		flex-shrink: 0;
		box-sizing: border-box;
		background-color: var(--ui-panel);
		color: var(--ui-on-accent);
	}
	.box.on {
		border-color: var(--ui-accent);
		background-color: var(--ui-accent);
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.label {
		font-size: 14px;
		line-height: 20px;
		color: var(--ui-ink);
	}
	.description {
		font-size: 13px;
		line-height: 18px;
		color: var(--ui-muted);
	}
</style>
