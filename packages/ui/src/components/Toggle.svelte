<script lang="ts">
	import { IS_GPUIX, type MotionProps } from 'gpuix-svelte';
	import { activates } from 'gpuix-svelte-ui/keys';
	import { aria_checked, aria_disabled, own_hitbox, test_id } from 'gpuix-svelte-ui/shared';

	let {
		checked,
		onchange,
		label = null,
		disabled = false,
		testid = null
	}: {
		checked: boolean;
		onchange: (checked: boolean) => void;
		label?: string | null;
		disabled?: boolean;
		testid?: string | null;
	} = $props();

	const OFF = 3;
	const ON = 19;

	// GPUI animates the knob natively through `motion`; the browser through the CSS transition on `left`.
	const knob = $derived<{ motion?: MotionProps }>(IS_GPUIX ? { motion: { initial: false, animate: { left: checked ? ON : OFF }, transition: { duration: 0.15, ease: 'easeOut' } } } : {});

	function flip() {
		if (!disabled) onchange(!checked);
	}
</script>

<div
	class="toggle"
	class:disabled
	role="switch"
	aria-label={label}
	{...aria_checked(checked)}
	{...aria_disabled(disabled)}
	tabindex={disabled ? -1 : 0}
	{...own_hitbox}
	{...test_id(testid)}
	onclick={flip}
	onkeydown={(e) => activates(e) && flip()}
>
	<div class="track" class:on={checked}>
		<div class="knob" style:left={IS_GPUIX ? null : `${checked ? ON : OFF}px`} {...knob}></div>
	</div>
	{#if label}<div class="label">{label}</div>{/if}
</div>

<style>
	.toggle {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		user-select: none;
		border-radius: 12px;
	}
	.toggle:focus-visible {
		outline-width: 2px;
		outline-offset: 2px;
		outline-style: solid;
		outline-color: var(--ui-ink);
	}
	.toggle.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
	.track {
		position: relative;
		width: 38px;
		height: 22px;
		border-radius: 11px;
		flex-shrink: 0;
		background-color: var(--ui-border-strong);
	}
	.track.on {
		background-color: var(--ui-accent);
	}
	.knob {
		position: absolute;
		top: 3px;
		width: 16px;
		height: 16px;
		border-radius: 8px;
		background-color: var(--ui-on-accent);
		transition: left 150ms;
	}
	.label {
		font-size: 14px;
		color: var(--ui-ink);
	}
</style>
