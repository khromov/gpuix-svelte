<script>
	import { KIND_ICON } from '../lib/icons.js';
	import { resolved } from '../lib/theme.svelte.js';
	import Icon from './Icon.svelte';

	let { item, size = 52 } = $props();

	const mode = $derived(resolved());
</script>

{#if item.thumb_path}
	<img src={item.thumb_path} objectFit="cover" class="thumb {mode}" style="width: {size}px; height: {size}px" />
{:else}
	<div class="tile {item.kind} {mode}" style="width: {size}px; height: {size}px">
		<Icon name={KIND_ICON[item.kind] ?? 'note'} size={Math.round(size * 0.42)} tone={item.kind} />
	</div>
{/if}

<style>
	.thumb { border-radius: 8px; pointer-events: none; }
	.tile { display: flex; align-items: center; justify-content: center; border-radius: 8px; pointer-events: none; }
	.tile.text.light { background-color: #f1e3c6; color: #b8822b; }
	.tile.text.dark { background-color: #3a2e1b; color: #d9a34a; }
	.tile.link.light { background-color: #dce6ef; color: #4f6b8a; }
	.tile.link.dark { background-color: #26313d; color: #87a4c3; }
	.tile.image.light { background-color: #ede0ec; color: #7a5878; }
	.tile.image.dark { background-color: #352a36; color: #b48ab0; }
	.tile.audio.light { background-color: #d9ebe9; color: #3f7a75; }
	.tile.audio.dark { background-color: #1f3634; color: #6fb3ad; }
</style>
