<script lang="ts">
	import { ago, data, display_title, get_app, preview, status_text } from '../lib/data.svelte.ts';
	import { push } from '../lib/router.svelte.ts';
	import { match_ranges } from '../lib/rank.ts';
	import type { Item } from '../lib/store.ts';
	import { resolved } from '../lib/theme.svelte.ts';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import KindBadge from './KindBadge.svelte';
	import Spinner from './Spinner.svelte';
	import Thumb from './Thumb.svelte';

	let {
		item,
		onopen,
		snippet = null,
		signals = null,
		terms = null,
		compact = false
	}: {
		item: Item;
		onopen: (item: Item) => void;
		snippet?: string | null;
		signals?: string[] | null;
		terms?: string[] | null;
		compact?: boolean;
	} = $props();

	// A CLIP hit means the picture itself matched the words, which deserves saying.
	const SIGNAL: Record<string, string> = { vector: 'semantic', fts: 'keyword', clip: 'visual match', url: 'address', kind: 'by kind' };
	// GPUI paints these behind matching text; the ochre reads on both palettes.
	const MARK = { light: 'rgba(184, 130, 43, 0.35)', dark: 'rgba(217, 163, 74, 0.38)' };
	const mode = $derived(resolved());
	const busy = $derived(item.status === 'pending' || item.status === 'processing');
	const failed = $derived(item.status === 'error');
	const title = $derived(display_title(item));
	const text = $derived(snippet ?? preview(item));
	const mark = (s: string) => {
		if (!terms?.length) return null;
		const ranges = match_ranges(s, terms);
		return ranges.length ? { ranges, color: MARK[mode], radius: 3 } : null;
	};
	const feed = $derived(item.feed_id == null ? null : (data.feeds.find((f) => f.id === item.feed_id) ?? null));
	const title_mark = $derived(mark(title));
	const text_mark = $derived(mark(text));
</script>

<div class="card" class:failed class:compact hitbox="self" onclick={onopen} testId="item-{item.id}">
	<Thumb {item} size={compact ? 40 : 52} />
	<div class="body">
		{#if title_mark}
			<div class="title" highlight={title_mark}>{title}</div>
		{:else}
			<div class="title">{title}</div>
		{/if}
		{#if !compact}
			{#if text_mark}
				<div class="snippet" highlight={text_mark}>{text}</div>
			{:else}
				<div class="snippet">{text}</div>
			{/if}
		{/if}
		<div class="meta">
			<KindBadge kind={item.kind} />
			{#if feed}
				<div class="feed" hitbox="self" onclick={() => push('/feeds')}>
					<Icon name="rss" size={11} tone="faint" />
					<div class="feed-name">{feed.title}</div>
				</div>
			{/if}
			{#if busy}
				<Spinner size={11} />
				<div class="status">{status_text(item)}</div>
			{:else if failed}
				<div class="error">{item.error ?? 'failed'}</div>
			{/if}
			{#each signals ?? [] as signal (signal)}
				<div class="signal {signal}">
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
	.card { display: flex; flex-direction: row; align-items: start; gap: 12px; padding: 12px; border-width: 1px; border-radius: 10px; cursor: pointer; user-select: none; background-color: var(--surface); border-color: var(--border); }
	.card.compact { padding: 8px 10px; gap: 10px; align-items: center; }
	.card:hover { background-color: var(--raised); border-color: var(--borderStrong); }
	.card.failed { border-color: var(--dangerBorder); }
	.body { display: flex; flex-direction: column; gap: 4px; flex-grow: 1; min-width: 0; }
	.title { font-size: 14px; line-height: 20px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.snippet { font-size: 13px; line-height: 18px; line-clamp: 3; color: var(--inkMuted); }
	.meta { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 11px; line-height: 16px; color: var(--inkFaint); }
	.error { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--danger); }
	.feed { display: flex; flex-direction: row; align-items: center; gap: 4px; max-width: 160px; cursor: pointer; }
	.feed-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--inkFaint); }
	.signal { display: flex; flex-direction: row; align-items: center; gap: 4px; padding: 0 6px; border-width: 1px; border-radius: 4px; border-color: var(--border); color: var(--inkMuted); }
	.signal.clip { background-color: var(--plumSoft); border-color: var(--plumBorder); color: var(--plum); font-weight: 600; }
	.actions { display: flex; flex-direction: row; align-items: center; }
</style>
