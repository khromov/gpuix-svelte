<script>
	import Button from '../components/Button.svelte';
	import ItemCard from '../components/ItemCard.svelte';
	import KindBadge from '../components/KindBadge.svelte';
	import Markdown from '../components/Markdown.svelte';
	import Scroller from '../components/Scroller.svelte';
	import Spinner from '../components/Spinner.svelte';
	import { playback, toggle_play } from '../lib/capture.svelte.js';
	import { write_text } from '../lib/clipboard.js';
	import { ago, data, format_duration, get_app, status_text } from '../lib/data.svelte.js';
	import { back, push } from '../lib/router.svelte.js';
	import { open_url, reveal } from '../lib/shell.js';
	import { resolved } from '../lib/theme.svelte.js';
	import { confirm, focus, toast } from '../lib/ui.svelte.js';

	let { params } = $props();

	const mode = $derived(resolved());
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
	const llm = $derived(data.capabilities?.llm?.ok ?? false);
	const vision = $derived(llm && !!get_app().settings.get('llm.visionModel'));

	let editing = $state(false);
	let draft = $state({ title: '', body: '' });
	let saved_at = $state(null);
	let related = $state([]);
	let working = $state(null);
	let timer = null;

	function start_edit() {
		draft = { title: item.title, body: item.body };
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
		focus('root');
	}

	async function remove() {
		const ok = await confirm({ title: 'Delete this item?', body: item.title || 'Untitled', confirmLabel: 'Delete', danger: true });
		if (!ok) return;
		get_app().delete_item(id);
		back();
		toast('Deleted');
	}

	async function run(label, fn) {
		working = label;
		try {
			await fn();
		} catch (err) {
			toast(err.message, 'error');
		} finally {
			working = null;
		}
	}

	$effect(() => {
		if (item?.status === 'ready') {
			get_app()
				.related(id)
				.then((r) => (related = r))
				.catch(() => (related = []));
		}
	});
</script>

{#if !item}
	<div class="missing {mode}">This item no longer exists.</div>
{:else}
	<div class="route">
		<div class="bar {mode}">
			{#if editing}
				<Button label="Done" icon="check" variant="primary" small onclick={done} testid="edit-done" />
				<div class="saved {mode}">{saved_at ? `Saved ${ago(saved_at)}` : 'Autosaves as you type'}</div>
			{:else}
				<Button label="Edit" icon="edit" small onclick={start_edit} testid="edit" />
				{#if item.kind === 'link' && item.source_url}
					<Button label="Open" icon="external" small onclick={() => open_url(item.source_url)} />
				{/if}
				{#if item.kind === 'audio' && item.file_path}
					<Button label={playback.id === item.id ? 'Stop' : 'Play'} icon={playback.id === item.id ? 'stop' : 'play'} small onclick={() => toggle_play(item)} />
				{/if}
				{#if item.kind === 'image' && vision}
					<Button label={working === 'describe' ? 'Describing…' : 'Describe with LLM'} icon="sparkles" small disabled={working !== null} onclick={() => run('describe', () => get_app().describe_image(id))} />
				{/if}
				{#if llm && item.body}
					<Button label={working === 'summarize' ? 'Summarizing…' : 'Summarize'} icon="sparkles" small disabled={working !== null} onclick={() => run('summarize', () => get_app().summarize(id))} />
				{/if}
				{#if item.file_path}
					<Button label="Reveal" icon="folder" small onclick={() => reveal(item.file_path)} />
				{/if}
				{#if item.body}
					<Button label="Copy" icon="copy" small onclick={() => write_text(item.body).then(() => toast('Copied'))} />
				{/if}
			{/if}
			<div class="grow"></div>
			<Button label="Delete" icon="trash" variant="ghost" small onclick={remove} testid="delete" />
		</div>

		{#if editing}
			<div class="editor">
				<input value={draft.title} placeholder="Title" class="title-input {mode}" onchange={(e) => { draft.title = e.value; schedule_save(); }} />
				<textarea
					value={draft.body}
					minRows={12}
					maxRows={60}
					placeholder="Write in markdown…"
					class="body-input {mode}"
					onchange={(e) => { draft.body = e.value; schedule_save(); }}
				></textarea>
			</div>
		{:else}
			<Scroller pad="0 24px 32px 24px" gap={16}>
				<div class="header">
					<div class="meta {mode}">
						<KindBadge kind={item.kind} />
						<div>{ago(item.created_at)}</div>
						{#if item.kind === 'audio' && item.duration}<div>{format_duration(item.duration)}</div>{/if}
						{#if item.kind === 'image' && item.width}<div>{item.width} × {item.height}</div>{/if}
						{#if item.meta.site_name}<div>{item.meta.site_name}</div>{/if}
						{#if busy}<Spinner size={11} /><div>{status_text(item)}</div>{/if}
					</div>
					<div class="title">{item.title || 'Untitled'}</div>
					{#if item.kind === 'link' && item.source_url}
						<div class="url {mode}" onclick={() => open_url(item.source_url)}>{item.source_url}</div>
					{/if}
					{#if item.status === 'error'}
						<div class="error {mode}">
							<div class="error-text">{item.error}</div>
							<Button label="Retry" icon="refresh" small onclick={() => get_app().retry(id)} />
						</div>
					{/if}
				</div>

				{#if item.kind === 'image' && item.file_path}
					<img src={item.file_path} objectFit="contain" class="hero {mode}" />
				{/if}
				{#if item.kind === 'link' && item.thumb_path}
					<img src={item.thumb_path} objectFit="cover" class="og {mode}" />
				{/if}

				{#if item.meta.summary}
					<div class="summary {mode}">
						<div class="summary-label {mode}">Summary</div>
						<Markdown source={item.meta.summary} />
					</div>
				{/if}

				{#if body_view}
					<div class="body"><Markdown source={body_view} /></div>
				{:else if !busy}
					<div class="placeholder {mode}">
						{item.kind === 'image' ? 'No description yet. Configure a vision model in Settings to describe images, or edit to add your own notes.' : 'Nothing here yet.'}
					</div>
				{/if}

				{#if item.meta.describe_error}
					<div class="placeholder {mode}">Description failed: {item.meta.describe_error}</div>
				{/if}

				{#if related.length}
					<div class="related">
						<div class="related-label {mode}">Related</div>
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
	.missing { padding: 40px; text-align: center; }
	.missing.light { color: #9b9080; }
	.missing.dark { color: #7b7163; }
	.bar { display: flex; flex-direction: row; align-items: center; gap: 6px; padding: 12px 24px; border-bottom-width: 1px; user-select: none; }
	.bar.light { border-color: #e2d8c4; }
	.bar.dark { border-color: #2b2621; }
	.grow { flex-grow: 1; }
	.saved { padding-left: 8px; font-size: 12px; line-height: 16px; }
	.saved.light { color: #9b9080; }
	.saved.dark { color: #7b7163; }
	.editor { display: flex; flex-direction: column; gap: 10px; flex-grow: 1; min-height: 0; padding: 16px 24px 24px 24px; }
	.title-input { padding: 8px 10px; border-radius: 6px; border-width: 1px; font-size: 18px; line-height: 24px; font-weight: 600; }
	.title-input.light { background-color: #ffffff; border-color: #cbbfa6; color: #2a251f; }
	.title-input.dark { background-color: #151210; border-color: #4a4237; color: #ece3d3; }
	.body-input { flex-grow: 1; min-height: 0; padding: 10px; border-radius: 6px; border-width: 1px; font-size: 14px; line-height: 22px; }
	.body-input.light { background-color: #ffffff; border-color: #cbbfa6; color: #2a251f; }
	.body-input.dark { background-color: #151210; border-color: #4a4237; color: #ece3d3; }
	.header { display: flex; flex-direction: column; gap: 8px; padding-top: 16px; }
	.meta { display: flex; flex-direction: row; align-items: center; gap: 10px; font-size: 12px; line-height: 16px; user-select: none; }
	.meta.light { color: #9b9080; }
	.meta.dark { color: #7b7163; }
	.title { font-size: 26px; line-height: 34px; font-weight: 700; }
	.url { font-size: 12px; line-height: 16px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.url.light { color: #4f6b8a; }
	.url.dark { color: #87a4c3; }
	.error { display: flex; flex-direction: row; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; font-size: 12px; line-height: 16px; }
	.error.light { background-color: #f3dcd6; color: #a9483a; }
	.error.dark { background-color: #3c2521; color: #d46f5e; }
	.error-text { flex-grow: 1; }
	.hero { width: 100%; height: 380px; border-radius: 10px; }
	.hero.light { background-color: #ece4d4; }
	.hero.dark { background-color: #151210; }
	.og { width: 320px; height: 180px; border-radius: 8px; }
	.summary { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 10px; }
	.summary.light { background-color: #e2e9d6; }
	.summary.dark { background-color: #2e3927; }
	.summary-label { font-size: 11px; line-height: 14px; font-weight: 600; user-select: none; }
	.summary-label.light { color: #3f5a30; }
	.summary-label.dark { color: #b7d19f; }
	.body { max-width: 760px; }
	.placeholder { font-size: 13px; line-height: 20px; }
	.placeholder.light { color: #9b9080; }
	.placeholder.dark { color: #7b7163; }
	.related { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; }
	.related-label { padding-bottom: 4px; font-size: 11px; line-height: 14px; font-weight: 600; user-select: none; }
	.related-label.light { color: #9b9080; }
	.related-label.dark { color: #7b7163; }
</style>
