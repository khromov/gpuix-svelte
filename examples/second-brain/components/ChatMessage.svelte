<script lang="ts">
	import type { ChatMessage } from '../lib/chat.svelte.ts';
	import Markdown from './Markdown.svelte';
	import SourceChip from './SourceChip.svelte';
	import Spinner from './Spinner.svelte';

	let { message }: { message: ChatMessage } = $props();

	const user = $derived(message.role === 'user');
</script>

{#if user}
	<div class="row user">
		<div class="bubble user">{message.content}</div>
	</div>
{:else}
	<div class="row">
		<div class="answer">
			{#if message.content}
				<Markdown source={message.content} />
			{:else if message.streaming}
				<div class="thinking"><Spinner size={12} /><div>Thinking…</div></div>
			{/if}
			{#if message.error}
				<div class="error">{message.error}</div>
			{/if}
			{#if message.sources?.length}
				<div class="sources">
					{#each message.sources as source (source.n)}
						<SourceChip {source} cited={message.cited?.includes(source.n)} />
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.row { display: flex; flex-direction: row; }
	.row.user { justify-content: end; }
	.bubble { max-width: 70%; padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 21px; }
	.bubble.user { background-color: var(--accentSoft); color: var(--ink); }
	.answer { display: flex; flex-direction: column; gap: 10px; max-width: 86%; padding: 12px 16px; border-radius: 14px; border-width: 1px; background-color: var(--surface); border-color: var(--border); }
	.thinking { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; color: var(--inkMuted); }
	.error { font-size: 12px; line-height: 16px; color: var(--danger); }
	.sources { display: flex; flex-direction: row; flex-wrap: wrap; gap: 6px; }
</style>
