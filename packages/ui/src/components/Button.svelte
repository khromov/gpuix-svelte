<script lang="ts">
	import type { Snippet } from 'svelte';
	import { activates } from 'gpuix-svelte-ui/keys';
	import { aria_disabled, own_hitbox, test_id } from 'gpuix-svelte-ui/shared';

	let {
		children,
		variant = 'default',
		size = 'md',
		disabled = false,
		label = null,
		onclick,
		onmouseenter,
		onmouseleave,
		onfocus,
		onblur,
		testid = null
	}: {
		children?: Snippet;
		variant?: 'default' | 'primary' | 'ghost' | 'danger';
		size?: 'sm' | 'md';
		disabled?: boolean;
		/** The accessible name, for a button whose content is an icon. */
		label?: string | null;
		onclick?: () => void;
		/** Tooltip hands these to its trigger through `children(hover, focus)`; spread `hover` on for the tip to work, and `focus` for it to show on keyboard focus. */
		onmouseenter?: () => void;
		onmouseleave?: () => void;
		onfocus?: () => void;
		onblur?: () => void;
		testid?: string | null;
	} = $props();

	function press() {
		if (!disabled) onclick?.();
	}
</script>

<div
	class="btn {variant} {size}"
	class:disabled
	role="button"
	aria-label={label}
	tabindex={disabled ? -1 : 0}
	{...aria_disabled(disabled)}
	{...own_hitbox}
	{...test_id(testid)}
	onclick={press}
	onkeydown={(e) => activates(e) && press()}
	{onmouseenter}
	{onmouseleave}
	{onfocus}
	{onblur}
>
	{@render children?.()}
</div>

<style>
	.btn {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 34px;
		padding: 0 14px;
		border-radius: 8px;
		border-width: 1px;
		border-style: solid;
		border-color: var(--ui-border);
		font-size: 14px;
		font-weight: 500;
		line-height: 20px;
		white-space: nowrap;
		cursor: pointer;
		user-select: none;
		box-sizing: border-box;
		background-color: transparent;
		color: var(--ui-ink);
	}
	.btn.sm {
		height: 28px;
		padding: 0 10px;
		gap: 4px;
		border-radius: 6px;
		font-size: 13px;
	}
	.btn:hover {
		border-color: var(--ui-border-strong);
		background-color: var(--ui-raised);
	}
	.btn:active {
		opacity: 0.8;
	}
	.btn:focus-visible {
		border-color: var(--ui-ink);
	}
	.btn.primary {
		border-color: var(--ui-ink);
		background-color: var(--ui-ink);
		color: var(--ui-bg);
	}
	.btn.primary:hover {
		border-color: var(--ui-ink);
		background-color: var(--ui-ink);
		opacity: 0.88;
	}
	.btn.primary:focus-visible {
		border-color: var(--ui-accent);
	}
	.btn.ghost {
		border-color: transparent;
	}
	.btn.ghost:hover {
		border-color: transparent;
		background-color: var(--ui-raised);
	}
	.btn.ghost:focus-visible {
		border-color: var(--ui-ink);
	}
	.btn.danger {
		color: var(--ui-danger);
	}
	.btn.danger:hover {
		border-color: var(--ui-danger);
		background-color: var(--ui-danger-wash);
	}
	.btn.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
</style>
