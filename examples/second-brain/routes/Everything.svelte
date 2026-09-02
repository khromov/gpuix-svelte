<script lang="ts">
	import Button from '../components/Button.svelte';
	import CaptureBox from '../components/CaptureBox.svelte';
	import EmptyState from '../components/EmptyState.svelte';
	import ItemCard from '../components/ItemCard.svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import { data } from '../lib/data.svelte.ts';
	import { push } from '../lib/router.svelte.ts';
	import { focus } from '../lib/ui.svelte.ts';

	const PAGE = 200;
	let page = $state(1);
	const visible = $derived(data.items.slice(0, page * PAGE));
</script>

<div class="route">
	<div class="capture"><CaptureBox /></div>
	<Scroller virtual estimate={100} pad="0 20px 20px 20px" testid="timeline">
		{#each visible as item (item.id)}
			<div class="row"><ItemCard {item} onopen={() => push(`/item/${item.id}`)} /></div>
		{/each}
		{#if visible.length < data.items.length}
			<div class="row"><Button label="Load more" onclick={() => page++} /></div>
		{/if}
		{#if data.items.length === 0}
			<EmptyState
				title="Nothing here yet"
				body="Pour in a thought, a link, an image or a recording. Everything you add becomes searchable."
				action={{ label: 'Write a note', icon: 'plus', onclick: () => focus('capture') }}
			/>
		{/if}
	</Scroller>
</div>

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.capture { padding: 16px 20px 10px 20px; }
	.row { display: flex; flex-direction: column; width: 100%; padding-bottom: 8px; }
</style>
