<script lang="ts">
	import Button from '../components/Button.svelte';
	import CaptureBox from '../components/CaptureBox.svelte';
	import EmptyState from '../components/EmptyState.svelte';
	import ItemCard from '../components/ItemCard.svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import Toggle from '../components/Toggle.svelte';
	import { data, get_app } from '../lib/data.svelte.ts';
	import { push } from '../lib/router.svelte.ts';
	import { focus } from '../lib/ui.svelte.ts';

	const PAGE = 200;
	let page = $state(1);
	let include_feeds = $state(get_app().settings.get('timeline.includeFeeds') !== false);
	const items = $derived(include_feeds ? data.items : data.items.filter((i) => i.feed_id == null));
	const visible = $derived(items.slice(0, page * PAGE));

	function toggle_feeds(on: boolean) {
		include_feeds = on;
		get_app().settings.set('timeline.includeFeeds', on);
	}
</script>

<div class="route">
	<div class="capture"><CaptureBox /></div>
	{#if data.counts.feeds > 0}
		<div class="head">
			<Toggle label="Include feeds" hint="{data.counts.feeds} of {data.counts.total} items came from a subscription." checked={include_feeds} onchange={toggle_feeds} testid="timeline-feeds" />
		</div>
	{/if}
	<Scroller virtual estimate={100} pad="0 20px 20px 20px" testid="timeline">
		{#each visible as item (item.id)}
			<div class="row"><ItemCard {item} onopen={() => push(`/item/${item.id}`)} /></div>
		{/each}
		{#if visible.length < items.length}
			<div class="row"><Button label="Load more" onclick={() => page++} /></div>
		{/if}
		{#if items.length === 0}
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
	.head { padding: 0 20px 8px 20px; }
	.row { display: flex; flex-direction: column; width: 100%; padding-bottom: 8px; }
</style>
