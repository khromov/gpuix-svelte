<script lang="ts">
	import type { IconName } from '../lib/icons.ts';
	import Icon from './Icon.svelte';

	let {
		label = '',
		icon = null,
		variant = 'secondary',
		disabled = false,
		small = false,
		onclick = null,
		testid = null
	}: {
		label?: string;
		icon?: IconName | null;
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		disabled?: boolean;
		small?: boolean;
		onclick?: (() => void) | null;
		testid?: string | null;
	} = $props();

	const ICON_TONE = { primary: 'onAccent', secondary: 'ink', ghost: 'muted', danger: 'onDanger' };
</script>

<div
	class="btn {variant}"
	class:small
	class:disabled
	hitbox="self"
	onclick={() => {
		if (!disabled) onclick?.();
	}}
	testId={testid}
>
	{#if icon}<Icon name={icon} size={small ? 14 : 16} tone={ICON_TONE[variant] ?? 'ink'} />{/if}
	{#if label}<div class="label">{label}</div>{/if}
</div>

<style>
	.btn { display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 6px; padding: 7px 12px; border-radius: 6px; border-width: 1px; font-size: 13px; line-height: 18px; font-weight: 500; cursor: pointer; user-select: none; white-space: nowrap; }
	.btn.small { padding: 4px 9px; font-size: 12px; line-height: 16px; }
	.btn.disabled { opacity: 0.45; cursor: default; }

	.btn.primary { background-color: var(--accent); border-color: var(--accent); color: var(--accentInk); }
	.btn.primary:hover { background-color: var(--accentHover); border-color: var(--accentHover); }

	.btn.secondary { background-color: var(--control); border-color: var(--borderStrong); color: var(--ink); }
	.btn.secondary:hover { background-color: var(--controlHover); border-color: var(--borderHover); }

	.btn.ghost { background-color: rgba(0, 0, 0, 0); border-color: rgba(0, 0, 0, 0); color: var(--inkMuted); }
	.btn.ghost:hover { background-color: var(--hoverStrong); color: var(--ink); }

	.btn.danger { background-color: var(--danger); border-color: var(--danger); color: var(--dangerInk); }
	.btn.danger:hover { background-color: var(--dangerHover); border-color: var(--dangerHover); }
</style>
