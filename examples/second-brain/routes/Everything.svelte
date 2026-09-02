<script>
	import Button from '../components/Button.svelte';
	import CaptureBox from '../components/CaptureBox.svelte';
	import EmptyState from '../components/EmptyState.svelte';
	import ItemCard from '../components/ItemCard.svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import { data } from '../lib/data.svelte.js';
	import { push } from '../lib/router.svelte.js';
	import { focus } from '../lib/ui.svelte.js';

	let page = $state(1);
	const visible = $derived(data.items.slice(0, page * 50));
</script>

<div class="route">
	<div class="capture"><CaptureBox /></div>
	<Scroller pad="0 20px 20px 20px" gap={8} testid="timeline">
		{#each visible as item (item.id)}
			<ItemCard {item} onopen={() => push(`/item/${item.id}`)} />
		{/each}
		{#if visible.length < data.items.length}
			<Button label="Load more" onclick={() => page++} />
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
</style>
