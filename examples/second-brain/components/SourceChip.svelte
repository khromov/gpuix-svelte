<script>
	import { push } from '../lib/router.svelte.js';
	import { resolved } from '../lib/theme.svelte.js';
	import { KIND_ICON } from '../lib/icons.js';
	import Icon from './Icon.svelte';

	let { source, cited = false } = $props();

	const mode = $derived(resolved());
</script>

<div class="chip {mode}" class:cited onclick={() => push(`/item/${source.item_id}`)}>
	<div class="n {mode}">{source.n}</div>
	<Icon name={KIND_ICON[source.kind] ?? 'note'} size={12} tone={source.kind} />
	<div class="title">{source.title}</div>
</div>

<style>
	.chip { display: flex; flex-direction: row; align-items: center; gap: 6px; max-width: 260px; padding: 3px 8px 3px 4px; border-radius: 999px; border-width: 1px; font-size: 12px; line-height: 16px; cursor: pointer; user-select: none; }
	.chip.light { border-color: #e2d8c4; color: #6b6154; }
	.chip.light:hover { background-color: #ffffff; border-color: #cbbfa6; color: #2a251f; }
	.chip.cited.light { border-color: #5f7a4a; color: #2a251f; }
	.chip.dark { border-color: #36302a; color: #b2a791; }
	.chip.dark:hover { background-color: #2b2621; border-color: #4a4237; color: #ece3d3; }
	.chip.cited.dark { border-color: #8fae74; color: #ece3d3; }
	.n { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 9px; font-size: 10px; font-weight: 600; pointer-events: none; }
	.n.light { background-color: #e2e9d6; color: #3f5a30; }
	.n.dark { background-color: #2e3927; color: #b7d19f; }
	.title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
</style>
