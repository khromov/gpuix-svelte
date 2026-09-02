<script>
	import EmptyState from '../components/EmptyState.svelte';
	import ItemCard from '../components/ItemCard.svelte';
	import KindBadge from '../components/KindBadge.svelte';
	import Scroller from '../components/Scroller.svelte';
	import { data, status_text } from '../lib/data.svelte.js';
	import { push } from '../lib/router.svelte.js';
	import { resolved } from '../lib/theme.svelte.js';

	let { kind } = $props();

	const COPY = {
		text: ['No notes yet', 'Type anything into the box on Everything and press Enter.'],
		link: ['No links yet', 'Paste a URL into the box on Everything; the page is read and indexed for you.'],
		image: ['No images yet', 'Use Add image… or Paste image on Everything. With a vision model configured, images get described too.'],
		audio: ['No recordings yet', 'Press Record on Everything, or import a WAV (any format with ffmpeg installed).']
	};
	const mode = $derived(resolved());
	const items = $derived(data.items.filter((i) => i.kind === kind));
</script>

<div class="route">
	<div class="head {mode}">
		<KindBadge {kind} />
		<div class="count">{items.length} item{items.length === 1 ? '' : 's'}</div>
	</div>
	<Scroller pad="0 20px 20px 20px" gap={kind === 'image' ? 12 : 8}>
		{#if items.length === 0}
			<EmptyState title={COPY[kind][0]} body={COPY[kind][1]} />
		{:else if kind === 'image'}
			<div class="grid">
				{#each items as item (item.id)}
					<div class="tile {mode}" onclick={() => push(`/item/${item.id}`)}>
						{#if item.thumb_path}
							<img src={item.thumb_path} objectFit="cover" class="pic" />
						{:else}
							<div class="pic missing {mode}"></div>
						{/if}
						<div class="caption">{item.title || 'Untitled'}</div>
						{#if item.status !== 'ready'}<div class="state {mode}">{status_text(item)}</div>{/if}
					</div>
				{/each}
			</div>
		{:else}
			{#each items as item (item.id)}
				<ItemCard {item} onopen={() => push(`/item/${item.id}`)} />
			{/each}
		{/if}
	</Scroller>
</div>

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.head { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 16px 20px 12px 20px; font-size: 12px; line-height: 16px; user-select: none; }
	.head.light { color: #9b9080; }
	.head.dark { color: #7b7163; }
	.grid { display: flex; flex-direction: row; flex-wrap: wrap; gap: 12px; }
	.tile { display: flex; flex-direction: column; gap: 6px; width: 172px; padding: 8px; border-radius: 10px; border-width: 1px; cursor: pointer; user-select: none; }
	.tile.light { background-color: #fbf7ef; border-color: #e2d8c4; }
	.tile.light:hover { background-color: #ffffff; border-color: #cbbfa6; }
	.tile.dark { background-color: #231f1b; border-color: #36302a; }
	.tile.dark:hover { background-color: #2b2621; border-color: #4a4237; }
	.pic { width: 156px; height: 120px; border-radius: 6px; pointer-events: none; }
	.pic.missing.light { background-color: #ede0ec; }
	.pic.missing.dark { background-color: #352a36; }
	.caption { font-size: 12px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
	.state { font-size: 11px; line-height: 14px; pointer-events: none; }
	.state.light { color: #9b9080; }
	.state.dark { color: #7b7163; }
</style>
