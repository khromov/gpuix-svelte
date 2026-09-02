<script>
	import EmptyState from '../components/EmptyState.svelte';
	import Icon from '../components/Icon.svelte';
	import ItemCard from '../components/ItemCard.svelte';
	import Scroller from '../components/Scroller.svelte';
	import Segmented from '../components/Segmented.svelte';
	import Spinner from '../components/Spinner.svelte';
	import { data, get_app } from '../lib/data.svelte.js';
	import { push } from '../lib/router.svelte.js';
	import { resolved } from '../lib/theme.svelte.js';

	let { query } = $props();

	const FILTERS = [
		{ value: 'all', label: 'All' },
		{ value: 'text', label: 'Notes' },
		{ value: 'link', label: 'Links' },
		{ value: 'image', label: 'Images' },
		{ value: 'audio', label: 'Audio' }
	];
	const mode = $derived(resolved());
	const q = $derived((query?.q ?? '').trim());
	let filter = $state('all');
	let result = $state({ hits: [], degraded: [] });
	let loading = $state(false);
	let generation = 0;

	$effect(() => {
		const text = q;
		const kinds = filter === 'all' ? null : [filter];
		// Re-run once the embedding model comes up, so keyword-only results upgrade.
		void data.ml.embed?.state;
		void data.ml.clip?.state;
		void data.counts.total;
		const gen = ++generation;
		if (!text) {
			result = { hits: [], degraded: [] };
			return;
		}
		loading = true;
		get_app()
			.search(text, { kinds, limit: 30 })
			.then((r) => {
				if (gen !== generation) return;
				result = r;
				loading = false;
			})
			.catch(() => {
				if (gen === generation) loading = false;
			});
	});
</script>

<div class="route">
	<div class="head">
		<Segmented options={FILTERS} value={filter} onchange={(v) => (filter = v)} small />
		<div class="grow"></div>
		{#if loading}<Spinner size={12} />{/if}
		<div class="summary {mode}">{q ? `${result.hits.length} result${result.hits.length === 1 ? '' : 's'} for “${q}”` : ''}</div>
	</div>
	{#if result.degraded.includes('vector')}
		<div class="notice {mode}">
			<Icon name="alert" size={13} tone="text" />
			<div>Semantic search is not ready yet — showing keyword matches only.</div>
		</div>
	{/if}
	<Scroller pad="0 20px 20px 20px" gap={8} testid="results">
		{#if !q}
			<EmptyState icon="search" title="Search your brain" body="Meaning, keywords and image content are searched together." />
		{:else if !loading && result.hits.length === 0}
			<EmptyState icon="search" title="No matches" body="Try different words — or add what you were looking for." />
		{:else}
			{#each result.hits as hit (hit.item.id)}
				<ItemCard item={hit.item} snippet={hit.snippet} signals={hit.signals} onopen={() => push(`/item/${hit.item.id}`)} />
			{/each}
		{/if}
	</Scroller>
</div>

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.head { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 14px 20px 10px 20px; user-select: none; }
	.grow { flex-grow: 1; }
	.summary { font-size: 12px; line-height: 16px; }
	.summary.light { color: #9b9080; }
	.summary.dark { color: #7b7163; }
	.notice { display: flex; flex-direction: row; align-items: center; gap: 8px; margin: 0 20px 10px 20px; padding: 8px 12px; border-radius: 8px; font-size: 12px; line-height: 16px; user-select: none; }
	.notice.light { background-color: #f1e3c6; color: #7a5518; }
	.notice.dark { background-color: #3a2e1b; color: #d9a34a; }
</style>
