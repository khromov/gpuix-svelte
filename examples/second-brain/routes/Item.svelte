<script lang="ts">
	import Button from '../components/Button.svelte';
	import ItemCard from '../components/ItemCard.svelte';
	import KindBadge from '../components/KindBadge.svelte';
	import Markdown from '../components/Markdown.svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import Spinner from '../components/Spinner.svelte';
	import { markdown_blocks } from '../lib/blocks.ts';
	import { playback, toggle_play } from '../lib/capture.svelte.ts';
	import { write_text } from '../lib/clipboard.ts';
	import { ago, blob_src, data, display_title, format_duration, get_app, status_text } from '../lib/data.svelte.ts';
	import { export_item, item_actions } from '../lib/menus.ts';
	import { back, push, replace } from '../lib/router.svelte.ts';
	import { open_url } from '../lib/shell.ts';
	import { blur, type GpuixEvent } from 'gpuix-svelte';
	import { untrack } from 'svelte';
	import type { SearchHit } from '../lib/search.ts';
	import { open_menu, toast } from '../lib/ui.svelte.ts';
	import Modal from '../components/Modal.svelte';

	let { params, query }: { params: Record<string, string>; query: Record<string, string> } = $props();

	const id = $derived(Number(params.id));
	const item = $derived(data.items.find((i) => i.id === id) ?? get_app().get_item(id));
	const busy = $derived(item?.status === 'pending' || item?.status === 'processing');
	// An auto-titled note's first line is the title shown above it.
	const body_view = $derived.by(() => {
		if (!item) return '';
		if (!(item.meta?.auto_title && item.kind === 'text')) return item.body;
		const lines = item.body.split('\n');
		const first = lines.findIndex((line) => line.trim());
		return first === -1 ? item.body : lines.slice(first + 1).join('\n').trim();
	});
	// One <markdown> per block: a native markdown element lays out its whole document every
	// frame, and a virtual row is only built near the viewport.
	const blocks = $derived(markdown_blocks(body_view));
	const feed = $derived(item?.feed_id == null ? null : (data.feeds.find((f) => f.id === item.feed_id) ?? null));
	// A feed entry whose page was never fetched still knows when the poll picked it up.
	const entry = $derived(item?.feed_id == null ? null : get_app().feeds.entry(item.id));
	// An entry that carried no date was created at the poll, so only a clearly older one is a publish date.
	const published = $derived(entry != null && item != null && item.created_at < entry.seen_at - 60_000);
	const fetched = $derived.by(() => {
		if (!item) return '';
		if (item.meta.fetched_at) return `Fetched ${ago(item.meta.fetched_at)}`;
		if (entry) return `Received ${ago(entry.seen_at)}`;
		return '';
	});
	const llm = $derived(data.capabilities?.llm?.ok ?? false);
	const vision = $derived(llm && !!get_app().settings.get('llm.visionModel'));

	let editing = $state(false);
	let draft = $state({ title: '', body: '' });
	let saved_at = $state<number | null>(null);
	let related = $state<SearchHit[]>([]);
	let working = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;

	function start_edit() {
		draft = { title: item!.title, body: item!.body };
		editing = true;
	}

	function save() {
		clearTimeout(timer);
		if (!item || !editing) return;
		if (draft.title !== item.title || draft.body !== item.body) {
			get_app().update_note(id, { title: draft.title, body: draft.body });
			saved_at = Date.now();
		}
	}

	function schedule_save() {
		clearTimeout(timer);
		timer = setTimeout(save, 700);
	}

	function done() {
		save();
		editing = false;
		blur();
	}

	let confirming = $state(false);

	function confirmed(ok: boolean) {
		confirming = false;
		if (!ok) return;
		get_app().delete_item(id);
		back();
		toast('Deleted');
	}

	async function run(label: string, fn: () => Promise<unknown>) {
		working = label;
		try {
			await fn();
		} catch (err) {
			toast((err as Error).message, 'error');
		} finally {
			working = null;
		}
	}

	$effect(() => {
		if (item?.status !== 'ready') return;
		// An edit or a pipeline status change re-runs this with a fetch already in flight.
		const gen = ++generation;
		get_app()
			.related(id)
			.then((r) => {
				if (gen === generation) related = r;
			})
			.catch(() => {
				if (gen === generation) related = [];
			});
	});

	// Where a card's Edit action lands; the flag is dropped from the URL so leaving the editor sticks.
	$effect(() => {
		if (query.edit !== '1' || !item) return;
		untrack(() => {
			if (!editing) start_edit();
			replace(`/item/${id}`);
		});
	});

	const show = (e: GpuixEvent) => open_menu(e, item_actions(item!, { on_item: true }), display_title(item!));
</script>

{#if !item}
	<div class="missing">This item no longer exists.</div>
{:else}
	<div class="route" onauxclick={show}>
		<div class="bar">
			{#if editing}
				<Button label="Done" icon="check" variant="primary" small onclick={done} testid="edit-done" />
				<div class="saved">{saved_at ? `Saved ${ago(saved_at)}` : 'Autosaves as you type'}</div>
			{:else}
				<Button label="Edit" icon="edit" small onclick={start_edit} testid="edit" />
				{#if item.kind === 'link' && item.source_url}
					<Button label="Open" icon="external" small onclick={() => open_url(item.source_url)} />
					<Button label="Re-read page" icon="refresh" small disabled={busy} onclick={() => { get_app().rescrape(id); toast('Reading the page again'); }} />
				{/if}
				{#if item.kind === 'audio' && item.file_blob}
					<Button label={playback.id === item.id ? 'Stop' : 'Play'} icon={playback.id === item.id ? 'stop' : 'play'} small onclick={() => toggle_play(item)} />
				{/if}
				{#if item.kind === 'image' && vision}
					<Button label={working === 'describe' ? 'Describing…' : 'Describe with LLM'} icon="sparkles" small disabled={working !== null} onclick={() => run('describe', () => get_app().describe_image(id))} />
				{/if}
				{#if llm && item.body}
					<Button label={working === 'summarize' ? 'Summarizing…' : 'Summarize'} icon="sparkles" small disabled={working !== null} onclick={() => run('summarize', () => get_app().summarize(id))} />
				{/if}
				{#if item.file_blob}
					<Button label={working === 'export' ? 'Exporting…' : 'Export…'} icon="folder" small disabled={working !== null} onclick={() => run('export', () => export_item(item))} />
				{/if}
				{#if item.body}
					<Button label="Copy" icon="copy" small onclick={() => write_text(item.body).then(() => toast('Copied'))} />
				{/if}
			{/if}
			<div class="grow"></div>
			<Button label="Delete" icon="trash" variant="ghost" small onclick={() => (confirming = true)} testid="delete" />
			{#if confirming}
				<Modal title="Delete this item?" body={item.title || 'Untitled'} confirmLabel="Delete" danger onclose={confirmed} />
			{/if}
		</div>

		{#if editing}
			<div class="editor">
				<input value={draft.title} placeholder="Title" class="title-input" onchange={(e) => { draft.title = e.value; schedule_save(); }} />
				<textarea
					value={draft.body}
					minRows={12}
					maxRows={60}
					placeholder="Write in markdown…"
					class="body-input"
					onchange={(e) => { draft.body = e.value; schedule_save(); }}
				></textarea>
			</div>
		{:else}
			<Scroller virtual estimate={44} pad="0 24px 32px 24px" testid="item-body">
				<div class="row header" onauxclick={show}>
					<div class="meta">
						<KindBadge kind={item.kind} />
						<div>{published ? `Published ${ago(item.created_at)}` : ago(item.created_at)}</div>
						{#if item.kind === 'audio' && item.duration}<div>{format_duration(item.duration)}</div>{/if}
						{#if item.kind === 'image' && item.width}<div>{item.width} × {item.height}</div>{/if}
						{#if item.meta.site_name}<div>{item.meta.site_name}</div>{/if}
						{#if feed && feed.title !== item.meta.site_name}<div>{feed.title}</div>{/if}
						{#if fetched}<div>{fetched}</div>{/if}
						{#if busy}<Spinner size={11} /><div>{status_text(item)}</div>{/if}
					</div>
					<div class="title">{item.title || 'Untitled'}</div>
					{#if item.kind === 'link' && item.source_url}
						<div class="url" onclick={() => open_url(item.source_url)}>{item.source_url}</div>
					{/if}
					{#if item.status === 'error'}
						<div class="error">
							<div class="error-text">{item.error}</div>
							<Button label="Retry" icon="refresh" small onclick={() => get_app().retry(id)} />
						</div>
					{/if}
				</div>

				{#if item.kind === 'image' && blob_src(item.meta.display_blob ?? item.file_blob)}
					<div class="row"><img src={blob_src(item.meta.display_blob ?? item.file_blob)} objectFit="contain" class="hero" /></div>
				{/if}
				{#if item.kind === 'link' && blob_src(item.thumb_blob)}
					<div class="row"><img src={blob_src(item.thumb_blob)} objectFit="cover" class="og" /></div>
				{/if}

				{#if item.meta.summary}
					<div class="row">
						<div class="summary">
							<div class="summary-label">Summary</div>
							<Markdown source={item.meta.summary} />
						</div>
					</div>
				{/if}

				{#each blocks as block, i (i)}
					<div class="block"><Markdown source={block} /></div>
				{/each}
				{#if !blocks.length && !busy}
					<div class="row placeholder">
						{#if item.kind === 'image'}
							{vision
								? 'No description yet — press Describe with LLM above.'
								: 'Indexed for visual search: a text search finds this image by what is in it. A written description needs a vision model — set Base URL, Model and Vision model in Settings and images are described automatically — or press Edit to add your own notes.'}
						{:else}
							Nothing here yet.
						{/if}
					</div>
				{/if}

				{#if item.meta.describe_error}
					<div class="row placeholder">Description failed: {item.meta.describe_error}</div>
				{/if}

				{#if related.length}
					<div class="row related">
						<div class="related-label">Related</div>
						{#each related as hit (hit.item.id)}
							<ItemCard item={hit.item} compact onopen={() => push(`/item/${hit.item.id}`)} />
						{/each}
					</div>
				{/if}
			</Scroller>
		{/if}
	</div>
{/if}

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.missing { padding: 40px; text-align: center; color: var(--inkFaint); }
	.bar { display: flex; flex-direction: row; align-items: center; gap: 6px; padding: 12px 24px; border-bottom-width: 1px; user-select: none; border-color: var(--divider); }
	.grow { flex-grow: 1; }
	.saved { padding-left: 8px; font-size: 12px; line-height: 16px; color: var(--inkFaint); }
	.editor { display: flex; flex-direction: column; gap: 10px; flex-grow: 1; min-height: 0; padding: 16px 24px 24px 24px; }
	.title-input { padding: 8px 10px; border-radius: 6px; border-width: 1px; font-size: 18px; line-height: 24px; font-weight: 600; background-color: var(--field); border-color: var(--borderStrong); color: var(--ink); }
	.body-input { flex-grow: 1; min-height: 0; padding: 10px; border-radius: 6px; border-width: 1px; font-size: 14px; line-height: 22px; background-color: var(--field); border-color: var(--borderStrong); color: var(--ink); }
	.row { display: flex; flex-direction: column; width: 100%; padding-bottom: 16px; }
	.header { gap: 8px; padding-top: 16px; }
	.meta { display: flex; flex-direction: row; align-items: center; gap: 10px; font-size: 12px; line-height: 16px; user-select: none; color: var(--inkFaint); }
	.title { font-size: 26px; line-height: 34px; font-weight: 700; }
	.url { font-size: 12px; line-height: 16px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--info); }
	.error { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; font-size: 12px; line-height: 16px; background-color: var(--dangerSoft); color: var(--danger); }
	.error-text { flex-grow: 1; }
	.hero { width: 100%; height: 380px; border-radius: 10px; background-color: var(--sunken); }
	.og { width: 320px; height: 180px; border-radius: 8px; }
	.summary { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 10px; background-color: var(--accentSoft); }
	.summary-label { font-size: 11px; line-height: 14px; font-weight: 600; user-select: none; color: var(--accentDeep); }
	.block { width: 100%; max-width: 760px; padding-bottom: 12px; }
	.placeholder { font-size: 13px; line-height: 20px; color: var(--inkFaint); }
	.related { gap: 6px; padding-top: 8px; }
	.related-label { padding-bottom: 4px; font-size: 11px; line-height: 14px; font-weight: 600; user-select: none; color: var(--inkFaint); }
</style>
