<script lang="ts">
	import EmptyState from '../components/EmptyState.svelte';
	import Icon from '../components/Icon.svelte';
	import ItemCard from '../components/ItemCard.svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import Segmented from '../components/Segmented.svelte';
	import Spinner from '../components/Spinner.svelte';
	import Toggle from '../components/Toggle.svelte';
	import type { GpuixEvent } from 'gpuix-svelte';
	import { data, get_app } from '../lib/data.svelte.ts';
	import { include_feeds, set_include_feeds } from '../lib/feed-filter.svelte.ts';
	import { capture_actions } from '../lib/menus.ts';
	import { parse_query } from '../lib/rank.ts';
	import { push, replace } from '../lib/router.svelte.ts';
	import { open_menu } from '../lib/ui.svelte.ts';
	import type { App } from '../lib/app.ts';

	let { query }: { query: Record<string, string> } = $props();

	// Primitives, so a same-valued `data.ml` / `data.counts` reassignment does not re-run the search.
	const model_states = $derived(`${data.ml.embed?.state}/${data.ml.clip?.state}`);
	const total = $derived(data.counts.total);

	const FILTERS = [
		{ value: 'all', label: 'All' },
		{ value: 'text', label: 'Notes' },
		{ value: 'link', label: 'Links' },
		{ value: 'image', label: 'Images' },
		{ value: 'audio', label: 'Audio' }
	];
	const KIND_WORD: Record<string, string> = { text: 'note', link: 'link', image: 'image', audio: 'audio' };
	const q = $derived((query?.q ?? '').trim());
	const parsed = $derived(parse_query(q));
	let filter = $state('all');
	// `feeds:on` in the query is the filter; the checkbox mirrors it, as the kinds do.
	const feeds_on = $derived(parsed.feeds ?? include_feeds());

	function toggle_feeds(on: boolean) {
		set_include_feeds(on);
		if (parsed.feeds != null) replace(`/search?q=${encodeURIComponent(parsed.text)}`);
	}
	// A kind: in the query is the filter; the segmented control mirrors it.
	const active = $derived(parsed.kinds ? (parsed.kinds.length === 1 ? parsed.kinds[0] : 'all') : filter);
	let result = $state<Awaited<ReturnType<App['search']>>>({ hits: [], degraded: [], terms: [], kinds: null, text: '' });
	let loading = $state(false);
	let generation = 0;

	function choose(value: string) {
		if (parsed.kinds) {
			const text = value === 'all' ? parsed.text : `${parsed.text} kind:${KIND_WORD[value]}`.trim();
			replace(`/search?q=${encodeURIComponent(text)}`);
		}
		filter = value;
	}

	$effect(() => {
		const text = q;
		const kinds = filter === 'all' ? null : [filter];
		const feeds = include_feeds();
		// Re-run once the embedding model comes up, so keyword-only results upgrade.
		void model_states;
		void total;
		const gen = ++generation;
		if (!text) {
			result = { hits: [], degraded: [], terms: [], kinds: null, text: '' };
			return;
		}
		loading = true;
		get_app()
			.search(text, { kinds, feeds, limit: 30 })
			.then((r) => {
				if (gen !== generation) return;
				result = r;
				loading = false;
			})
			.catch(() => {
				if (gen === generation) loading = false;
			});
	});

	const summary = $derived.by(() => {
		if (!q) return '';
		const n = result.hits.length;
		const what = result.text ? ` for “${result.text}”` : '';
		const kinds = result.kinds ? ` in ${result.kinds.map((k) => `${KIND_WORD[k]}s`).join(', ')}` : '';
		const feeds = feeds_on ? '' : `${data.counts.feeds ? ', feeds excluded' : ''}`;
		return `${n} result${n === 1 ? '' : 's'}${what}${kinds}${feeds}`;
	});
</script>

<div class="route" onauxclick={(e: GpuixEvent) => open_menu(e, capture_actions())}>
	<div class="head">
		<Segmented options={FILTERS} value={active} onchange={choose} small />
		<Toggle label="Include feeds" checked={feeds_on} onchange={toggle_feeds} testid="search-feeds" />
		<div class="grow"></div>
		{#if loading}<Spinner size={12} />{/if}
		<div class="summary">{summary}</div>
	</div>
	{#if result.degraded.includes('vector')}
		<div class="notice">
			<Icon name="alert" size={13} tone="text" />
			<div>Semantic search is not ready yet — showing keyword matches only.</div>
		</div>
	{/if}
	{#if parsed.unknown.length}
		<div class="notice">
			<Icon name="alert" size={13} tone="text" />
			<div>Unknown kind “{parsed.unknown[0]}” — try kind:note, kind:link, kind:image or kind:audio.</div>
		</div>
	{/if}
	<Scroller pad="0 20px 20px 20px" gap={8} testid="results">
		{#if !q}
			<EmptyState
				icon="search"
				title="Search your brain"
				body="Meaning, keywords and image content are searched together. Narrow with kind:note, kind:link, kind:image or kind:audio — alone or with words."
			/>
		{:else if !loading && result.hits.length === 0}
			<EmptyState icon="search" title="No matches" body="Try different words — or add what you were looking for." />
		{:else}
			{#each result.hits as hit (hit.item.id)}
				<ItemCard item={hit.item} snippet={hit.snippet} signals={hit.signals} terms={result.terms} onopen={() => push(`/item/${hit.item.id}`)} />
			{/each}
		{/if}
	</Scroller>
</div>

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.head { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 14px 20px 10px 20px; user-select: none; }
	.grow { flex-grow: 1; }
	.summary { font-size: 12px; line-height: 16px; color: var(--inkFaint); }
	.notice { display: flex; flex-direction: row; align-items: center; gap: 8px; margin: 0 20px 10px 20px; padding: 8px 12px; border-radius: 8px; font-size: 12px; line-height: 16px; user-select: none; background-color: var(--ochreSoft); color: var(--ochreInk); }
</style>
