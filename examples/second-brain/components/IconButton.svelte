<script>
	import { resolved } from '../lib/theme.svelte.js';
	import Icon from './Icon.svelte';

	let { icon, onclick = null, active = false, danger = false, disabled = false, size = 28, testid = null } = $props();

	const mode = $derived(resolved());
</script>

<div
	class="ib {mode}"
	class:active
	class:danger
	class:disabled
	style="width: {size}px; height: {size}px"
	onclick={() => {
		if (!disabled) onclick?.();
	}}
	testId={testid}
>
	<Icon name={icon} size={Math.round(size * 0.57)} tone={danger ? 'danger' : active ? 'accent' : 'muted'} />
</div>

<style>
	.ib { display: flex; align-items: center; justify-content: center; border-radius: 6px; cursor: pointer; user-select: none; }
	.ib.disabled { opacity: 0.4; cursor: default; }
	.ib.light { color: #6b6154; }
	.ib.light:hover { background-color: rgba(42, 37, 31, 0.07); color: #2a251f; }
	.ib.dark { color: #b2a791; }
	.ib.dark:hover { background-color: rgba(236, 227, 211, 0.08); color: #ece3d3; }
	.ib.active.light { background-color: #e2e9d6; color: #5f7a4a; }
	.ib.active.dark { background-color: #2e3927; color: #8fae74; }
	.ib.danger.light:hover { background-color: #f3dcd6; color: #a9483a; }
	.ib.danger.dark:hover { background-color: #3c2521; color: #d46f5e; }
</style>
