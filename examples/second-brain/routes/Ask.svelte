<script>
	import Button from '../components/Button.svelte';
	import ChatMessage from '../components/ChatMessage.svelte';
	import EmptyState from '../components/EmptyState.svelte';
	import Scroller from '../components/Scroller.svelte';
	import { chat, clear, send, stop } from '../lib/chat.svelte.js';
	import { data } from '../lib/data.svelte.js';
	import { push } from '../lib/router.svelte.js';

	const configured = $derived(data.capabilities?.llm?.ok ?? false);
	let focused = $state(false);
</script>

<div class="route">
	<Scroller pad="20px 24px 12px 24px" gap={14} follow={chat.streaming} testid="chat">
		{#if chat.messages.length === 0}
			{#if configured}
				<EmptyState icon="sparkles" title="Ask your brain" body="Questions are answered from your own notes, links, images and recordings, with citations you can open." />
			{:else}
				<EmptyState
					icon="sparkles"
					title="Connect a model to ask questions"
					body="Any OpenAI-compatible endpoint works: Ollama, LM Studio, OpenAI, OpenRouter. Answers cite the items they came from."
					action={{ label: 'Open settings', icon: 'settings', onclick: () => push('/settings') }}
				/>
			{/if}
		{:else}
			{#each chat.messages as message (message.id)}
				<ChatMessage {message} />
			{/each}
		{/if}
	</Scroller>

	<div class="composer">
		<div class="input-wrap" class:focused>
			<textarea
				value={chat.draft}
				minRows={1}
				maxRows={6}
				placeholder={configured ? 'Ask something… Enter sends, Shift+Enter for a new line' : 'Configure an LLM in Settings to ask questions'}
				readOnly={!configured}
				class="input"
				onchange={(e) => (chat.draft = e.value)}
				onsubmit={(e) => send(e.value)}
				onfocus={() => (focused = true)}
				onblur={() => (focused = false)}
				testId="ask-input"
			></textarea>
		</div>
		{#if chat.streaming}
			<Button label="Stop" icon="stop" onclick={stop} />
		{:else}
			<Button label="Ask" icon="send" variant="primary" disabled={!configured || !chat.draft.trim()} onclick={() => send(chat.draft)} testid="ask-send" />
		{/if}
		{#if chat.messages.length}
			<Button label="Clear" variant="ghost" onclick={clear} />
		{/if}
	</div>
</div>

<style>
	.route { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.composer { display: flex; flex-direction: row; align-items: end; gap: 8px; padding: 12px 24px 16px 24px; border-top-width: 1px; border-color: var(--divider); }
	.input-wrap { flex-grow: 1; min-width: 0; padding: 8px 12px; border-radius: 10px; border-width: 1px; background-color: var(--surface); border-color: var(--border); }
	.input-wrap.focused { background-color: var(--focusSurface); border-color: var(--accent); }
	.input { font-size: 14px; line-height: 21px; color: var(--ink); }
</style>
