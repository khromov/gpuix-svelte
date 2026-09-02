<script lang="ts">
	import { KIND_ICON } from '../lib/icons.ts';
	import type { Item } from '../lib/store.ts';
	import Icon from './Icon.svelte';

	let { item, size = 52 }: { item: Item; size?: number } = $props();

</script>

{#if item.thumb_path}
	<img src={item.thumb_path} objectFit="cover" class="thumb" style="width: {size}px; height: {size}px" />
{:else}
	<div class="tile {item.kind}" style="width: {size}px; height: {size}px">
		<Icon name={KIND_ICON[item.kind] ?? 'note'} size={Math.round(size * 0.42)} tone={item.kind} />
	</div>
{/if}

<style>
	.thumb { border-radius: 8px; }
	.tile { display: flex; align-items: center; justify-content: center; border-radius: 8px; }
	.tile.text { background-color: var(--ochreSoft); color: var(--ochre); }
	.tile.link { background-color: var(--infoSoft); color: var(--info); }
	.tile.image { background-color: var(--plumSoft); color: var(--plum); }
	.tile.audio { background-color: var(--tealSoft); color: var(--teal); }
</style>
