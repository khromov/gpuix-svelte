<script>
	import { resolved } from '../lib/theme.svelte.js';
	import { ui } from '../lib/ui.svelte.js';

	const mode = $derived(resolved());
	const s = $derived(ui.suggest);
</script>

{#if s}
	<div class="menu {mode}" style="left: {s.left}px; top: {s.top}px; width: {s.width}px" testId="suggest">
		<div class="title {mode}">Filters</div>
		{#each s.items as item, i (item.label)}
			<div class="row {mode}" class:active={i === s.active} onclick={item.apply} testId="suggest-{item.label}">
				<div class="label">{item.label}</div>
				<div class="hint {mode}">{item.hint}</div>
			</div>
		{/each}
		<div class="foot {mode}">↑↓ choose · Tab completes · Enter searches</div>
	</div>
{/if}

<style>
	.menu { position: absolute; display: flex; flex-direction: column; gap: 2px; padding: 6px; border-radius: 10px; border-width: 1px; user-select: none; }
	.menu.light { background-color: #ffffff; border-color: #cbbfa6; }
	.menu.dark { background-color: #2b2621; border-color: #4a4237; }
	.title { padding: 4px 8px 2px 8px; font-size: 10px; line-height: 14px; font-weight: 600; }
	.title.light { color: #9b9080; }
	.title.dark { color: #7b7163; }
	.row { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
	.row.light:hover { background-color: rgba(42, 37, 31, 0.06); }
	.row.active.light { background-color: #e2e9d6; }
	.row.dark:hover { background-color: rgba(236, 227, 211, 0.07); }
	.row.active.dark { background-color: #2e3927; }
	.label { font-family: Lilex; font-size: 12px; line-height: 16px; pointer-events: none; }
	.hint { font-size: 12px; line-height: 16px; pointer-events: none; }
	.hint.light { color: #6b6154; }
	.hint.dark { color: #b2a791; }
	.foot { padding: 4px 8px 2px 8px; font-size: 10px; line-height: 14px; }
	.foot.light { color: #9b9080; }
	.foot.dark { color: #7b7163; }
</style>
