<script>
	import { resolved } from '../lib/theme.svelte.js';
	import Markdown from './Markdown.svelte';
	import SourceChip from './SourceChip.svelte';
	import Spinner from './Spinner.svelte';

	let { message } = $props();

	const mode = $derived(resolved());
	const user = $derived(message.role === 'user');
</script>

{#if user}
	<div class="row user">
		<div class="bubble user {mode}">{message.content}</div>
	</div>
{:else}
	<div class="row">
		<div class="answer {mode}">
			{#if message.content}
				<Markdown source={message.content} />
			{:else if message.streaming}
				<div class="thinking {mode}"><Spinner size={12} /><div>Thinking…</div></div>
			{/if}
			{#if message.error}
				<div class="error {mode}">{message.error}</div>
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
	.bubble.user.light { background-color: #e2e9d6; color: #2a251f; }
	.bubble.user.dark { background-color: #2e3927; color: #ece3d3; }
	.answer { display: flex; flex-direction: column; gap: 10px; max-width: 86%; padding: 12px 16px; border-radius: 14px; border-width: 1px; }
	.answer.light { background-color: #fbf7ef; border-color: #e2d8c4; }
	.answer.dark { background-color: #231f1b; border-color: #36302a; }
	.thinking { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; }
	.thinking.light { color: #6b6154; }
	.thinking.dark { color: #b2a791; }
	.error { font-size: 12px; line-height: 16px; }
	.error.light { color: #a9483a; }
	.error.dark { color: #d46f5e; }
	.sources { display: flex; flex-direction: row; flex-wrap: wrap; gap: 6px; }
</style>
