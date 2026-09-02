<script>
	import { resolved } from '../lib/theme.svelte.js';
	import Icon from './Icon.svelte';

	let { label = '', icon = null, variant = 'secondary', disabled = false, small = false, onclick = null, testid = null } = $props();

	const ICON_TONE = { primary: 'onAccent', secondary: 'ink', ghost: 'muted', danger: 'onDanger' };
	const mode = $derived(resolved());
</script>

<div
	class="btn {variant} {mode}"
	class:small
	class:disabled
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
	.label { pointer-events: none; }

	.btn.primary.light { background-color: #5f7a4a; border-color: #5f7a4a; color: #f8f5ec; }
	.btn.primary.light:hover { background-color: #526a3f; border-color: #526a3f; }
	.btn.primary.dark { background-color: #8fae74; border-color: #8fae74; color: #1b1815; }
	.btn.primary.dark:hover { background-color: #a3c088; border-color: #a3c088; }

	.btn.secondary.light { background-color: #fbf7ef; border-color: #cbbfa6; color: #2a251f; }
	.btn.secondary.light:hover { background-color: #ffffff; border-color: #b3a488; }
	.btn.secondary.dark { background-color: #2b2621; border-color: #4a4237; color: #ece3d3; }
	.btn.secondary.dark:hover { background-color: #36302a; border-color: #5d5447; }

	.btn.ghost { background-color: rgba(0, 0, 0, 0); border-color: rgba(0, 0, 0, 0); }
	.btn.ghost.light { color: #6b6154; }
	.btn.ghost.light:hover { background-color: rgba(42, 37, 31, 0.06); color: #2a251f; }
	.btn.ghost.dark { color: #b2a791; }
	.btn.ghost.dark:hover { background-color: rgba(236, 227, 211, 0.07); color: #ece3d3; }

	.btn.danger.light { background-color: #a9483a; border-color: #a9483a; color: #fbf7ef; }
	.btn.danger.light:hover { background-color: #8f3c30; border-color: #8f3c30; }
	.btn.danger.dark { background-color: #d46f5e; border-color: #d46f5e; color: #1b1815; }
	.btn.danger.dark:hover { background-color: #e08272; border-color: #e08272; }
</style>
