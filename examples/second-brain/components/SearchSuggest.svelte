<script>
	import { ui } from '../lib/ui.svelte.js';

	const s = $derived(ui.suggest);
</script>

{#if s}
	<div class="menu" style="left: {s.left}px; top: {s.top}px; width: {s.width}px" testId="suggest">
		<div class="title">Filters</div>
		{#each s.items as item, i (item.label)}
			<div class="row" class:active={i === s.active} hitbox="self" onclick={item.apply} testId="suggest-{item.label}">
				<div class="label">{item.label}</div>
				<div class="hint">{item.hint}</div>
			</div>
		{/each}
		<div class="foot">↑↓ choose · Tab completes · Enter searches</div>
	</div>
{/if}

<style>
	.menu { position: absolute; display: flex; flex-direction: column; gap: 2px; padding: 6px; border-radius: 10px; border-width: 1px; user-select: none; background-color: var(--raised); border-color: var(--borderStrong); }
	.title { padding: 4px 8px 2px 8px; font-size: 10px; line-height: 14px; font-weight: 600; color: var(--inkFaint); }
	.row { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
	.row:hover { background-color: var(--hoverStrong); }
	.row.active { background-color: var(--accentSoft); }
	.label { font-family: Lilex; font-size: 12px; line-height: 16px; }
	.hint { font-size: 12px; line-height: 16px; color: var(--inkMuted); }
	.foot { padding: 4px 8px 2px 8px; font-size: 10px; line-height: 14px; color: var(--inkFaint); }
</style>
