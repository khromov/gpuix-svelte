<script>
	import Icon from './Icon.svelte';

	let { icon, onclick = null, active = false, danger = false, disabled = false, size = 28, testid = null } = $props();

</script>

<div
	class="ib"
	class:active
	class:danger
	class:disabled
	style="width: {size}px; height: {size}px"
	hitbox="self"
	onclick={() => {
		if (!disabled) onclick?.();
	}}
	testId={testid}
>
	<Icon name={icon} size={Math.round(size * 0.57)} tone={danger ? 'danger' : active ? 'accent' : 'muted'} />
</div>

<style>
	.ib { display: flex; align-items: center; justify-content: center; border-radius: 6px; cursor: pointer; user-select: none; color: var(--inkMuted); }
	.ib.disabled { opacity: 0.4; cursor: default; }
	.ib:hover { background-color: var(--hoverStrong); color: var(--ink); }
	.ib.active { background-color: var(--accentSoft); color: var(--accent); }
	.ib.danger:hover { background-color: var(--dangerSoft); color: var(--danger); }
</style>
