<script lang="ts">
	import type { Source } from '../lib/ask.ts';
	import { push } from '../lib/router.svelte.ts';
	import { KIND_ICON } from '../lib/icons.ts';
	import Icon from './Icon.svelte';

	let { source, cited = false }: { source: Source; cited?: boolean } = $props();

</script>

<div class="chip" class:cited hitbox="self" onclick={() => push(`/item/${source.item_id}`)}>
	<div class="n">{source.n}</div>
	<Icon name={KIND_ICON[source.kind] ?? 'note'} size={12} tone={source.kind} />
	<div class="title">{source.title}</div>
</div>

<style>
	.chip { display: flex; flex-direction: row; align-items: center; gap: 6px; max-width: 260px; padding: 3px 8px 3px 4px; border-radius: 999px; border-width: 1px; font-size: 12px; line-height: 16px; cursor: pointer; user-select: none; border-color: var(--border); color: var(--inkMuted); }
	.chip:hover { background-color: var(--raised); border-color: var(--borderStrong); color: var(--ink); }
	.chip.cited { border-color: var(--accent); color: var(--ink); }
	.n { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 9px; font-size: 10px; font-weight: 600; background-color: var(--accentSoft); color: var(--accentDeep); }
	.title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
