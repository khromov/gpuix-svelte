<script>
	import { ago, display_title, get_app, preview, status_text } from '../lib/data.svelte.js';
	import { match_ranges } from '../lib/rank.js';
	import { resolved } from '../lib/theme.svelte.js';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import KindBadge from './KindBadge.svelte';
	import Spinner from './Spinner.svelte';
	import Thumb from './Thumb.svelte';

	let { item, onopen, snippet = null, signals = null, terms = null, compact = false } = $props();

	// A CLIP hit means the picture itself matched the words, which deserves saying.
	const SIGNAL = { vector: 'semantic', fts: 'keyword', clip: 'visual match', url: 'address', kind: 'by kind' };
	// GPUI paints these behind matching text; the ochre reads on both palettes.
	const MARK = { light: 'rgba(184, 130, 43, 0.35)', dark: 'rgba(217, 163, 74, 0.38)' };
	const mode = $derived(resolved());
	const busy = $derived(item.status === 'pending' || item.status === 'processing');
	const failed = $derived(item.status === 'error');
	const title = $derived(display_title(item));
	const text = $derived(snippet ?? preview(item));
	const mark = (s) => {
		if (!terms?.length) return null;
		const ranges = match_ranges(s, terms);
		return ranges.length ? { ranges, color: MARK[mode], radius: 3 } : null;
	};
	const title_mark = $derived(mark(title));
	const text_mark = $derived(mark(text));
</script>

<div class="card {mode}" class:failed class:compact onclick={onopen} testId="item-{item.id}">
	<Thumb {item} size={compact ? 40 : 52} />
	<div class="body">
		{#if title_mark}
			<div class="title" highlight={title_mark}>{title}</div>
		{:else}
			<div class="title">{title}</div>
		{/if}
		{#if !compact}
			{#if text_mark}
				<div class="snippet {mode}" highlight={text_mark}>{text}</div>
			{:else}
				<div class="snippet {mode}">{text}</div>
			{/if}
		{/if}
		<div class="meta {mode}">
			<KindBadge kind={item.kind} />
			{#if busy}
				<Spinner size={11} />
				<div class="status">{status_text(item)}</div>
			{:else if failed}
				<div class="error {mode}">{item.error ?? 'failed'}</div>
			{/if}
			{#each signals ?? [] as signal}
				<div class="signal {signal} {mode}">
					{#if signal === 'clip'}<Icon name="sparkles" size={11} tone="image" />{/if}
					<div class="signal-text">{SIGNAL[signal] ?? signal}</div>
				</div>
			{/each}
			<div class="age">{ago(item.created_at)}</div>
		</div>
	</div>
	{#if failed}
		<div class="actions">
			<Button label="Retry" icon="refresh" small onclick={() => get_app().retry(item.id)} />
		</div>
	{/if}
</div>

<style>
	.card { display: flex; flex-direction: row; align-items: start; gap: 12px; padding: 12px; border-width: 1px; border-radius: 10px; cursor: pointer; user-select: none; }
	.card.compact { padding: 8px 10px; gap: 10px; align-items: center; }
	.card.light { background-color: #fbf7ef; border-color: #e2d8c4; }
	.card.light:hover { background-color: #ffffff; border-color: #cbbfa6; }
	.card.dark { background-color: #231f1b; border-color: #36302a; }
	.card.dark:hover { background-color: #2b2621; border-color: #4a4237; }
	.card.failed.light { border-color: #d9a196; }
	.card.failed.dark { border-color: #7a4137; }
	.body { display: flex; flex-direction: column; gap: 4px; flex-grow: 1; min-width: 0; pointer-events: none; }
	.title { font-size: 14px; line-height: 20px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.snippet { font-size: 13px; line-height: 18px; line-clamp: 3; }
	.snippet.light { color: #6b6154; }
	.snippet.dark { color: #b2a791; }
	.meta { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 11px; line-height: 16px; }
	.meta.light { color: #9b9080; }
	.meta.dark { color: #7b7163; }
	.error { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.error.light { color: #a9483a; }
	.error.dark { color: #d46f5e; }
	.signal { display: flex; flex-direction: row; align-items: center; gap: 4px; padding: 0 6px; border-width: 1px; border-radius: 4px; }
	.signal.light { border-color: #e2d8c4; color: #6b6154; }
	.signal.dark { border-color: #4a4237; color: #b2a791; }
	.signal.clip.light { background-color: #ede0ec; border-color: #d9c4d8; color: #7a5878; font-weight: 600; }
	.signal.clip.dark { background-color: #352a36; border-color: #5a4459; color: #b48ab0; font-weight: 600; }
	.signal-text { pointer-events: none; }
	.actions { display: flex; flex-direction: row; align-items: center; }
</style>
