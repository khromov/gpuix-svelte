<script lang="ts">
	import EmptyState from '../components/EmptyState.svelte';
	import ItemCard from '../components/ItemCard.svelte';
	import KindBadge from '../components/KindBadge.svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import { blob_src, data, status_text } from '../lib/data.svelte.ts';
	import { push } from '../lib/router.svelte.ts';
	import type { Kind } from '../lib/store.ts';

	let { kind }: { kind: Kind } = $props();

	const COPY: Record<Kind, [string, string]> = {
		text: ['No notes yet', 'Type anything into the box on Everything and press Enter.'],
		link: ['No links yet', 'Paste a URL into the box on Everything; the page is read and indexed for you.'],
		image: ['No images yet', 'Use Add image… or Paste image on Everything. With a vision model configured, images get described too.'],
		audio: ['No recordings yet', 'Press Record on Everything, or import a WAV (any format with ffmpeg installed).']
	};
	const items = $derived(data.items.filter((i) => i.kind === kind));
</script>

<div class="route">
	<div class="head">
		<KindBadge {kind} />
		<div class="count">{items.length} item{items.length === 1 ? '' : 's'}</div>
	</div>
	<Scroller virtual={kind !== 'image'} estimate={100} pad="0 20px 20px 20px" gap={12}>
		{#if items.length === 0}
			<EmptyState title={COPY[kind][0]} body={COPY[kind][1]} />
		{:else if kind === 'image'}
			<div class="grid">
				{#each items as item (item.id)}
					<div class="tile" hitbox="self" onclick={() => push(`/item/${item.id}`)}>
						{#if blob_src(item.thumb_blob)}
							<img src={blob_src(item.thumb_blob)} objectFit="cover" class="pic" />
						{:else}
							<div class="pic missing"></div>
						{/if}
						<div class="caption">{item.title || 'Untitled'}</div>
						{#if item.status !== 'ready'}<div class="state">{status_text(item)}</div>{/if}
					</div>
				{/each}
			</div>
		{:else}
			{#each items as item (item.id)}
				<div class="row"><ItemCard {item} onopen={() => push(`/item/${item.id}`)} /></div>
			{/each}
		{/if}
	</Scroller>
</div>

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.head { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 16px 20px 12px 20px; font-size: 12px; line-height: 16px; user-select: none; color: var(--inkFaint); }
	.row { display: flex; flex-direction: column; width: 100%; padding-bottom: 8px; }
	.grid { display: flex; flex-direction: row; flex-wrap: wrap; gap: 12px; }
	.tile { display: flex; flex-direction: column; gap: 6px; width: 172px; padding: 8px; border-radius: 10px; border-width: 1px; cursor: pointer; user-select: none; background-color: var(--surface); border-color: var(--border); }
	.tile:hover { background-color: var(--raised); border-color: var(--borderStrong); }
	.pic { width: 156px; height: 120px; border-radius: 6px; }
	.pic.missing { background-color: var(--plumSoft); }
	.caption { font-size: 12px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.state { font-size: 11px; line-height: 14px; color: var(--inkFaint); }
</style>
