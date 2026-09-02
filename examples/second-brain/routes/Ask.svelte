<script>
	import Button from '../components/Button.svelte';
	import ChatMessage from '../components/ChatMessage.svelte';
	import EmptyState from '../components/EmptyState.svelte';
	import Scroller from '../components/Scroller.svelte';
	import { chat, clear, send, stop } from '../lib/chat.svelte.js';
	import { data } from '../lib/data.svelte.js';
	import { push } from '../lib/router.svelte.js';
	import { resolved } from '../lib/theme.svelte.js';

	const mode = $derived(resolved());
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

	<div class="composer {mode}">
		<div class="input-wrap {mode}" class:focused>
			<textarea
				value={chat.draft}
				minRows={1}
				maxRows={6}
				placeholder={configured ? 'Ask something… Enter sends, Shift+Enter for a new line' : 'Configure an LLM in Settings to ask questions'}
				readOnly={!configured}
				class="input {mode}"
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
	.composer { display: flex; flex-direction: row; align-items: end; gap: 8px; padding: 12px 24px 16px 24px; border-top-width: 1px; }
	.composer.light { border-color: #e2d8c4; }
	.composer.dark { border-color: #2b2621; }
	.input-wrap { flex-grow: 1; min-width: 0; padding: 8px 12px; border-radius: 10px; border-width: 1px; }
	.input-wrap.light { background-color: #fbf7ef; border-color: #e2d8c4; }
	.input-wrap.focused.light { background-color: #ffffff; border-color: #5f7a4a; }
	.input-wrap.dark { background-color: #231f1b; border-color: #36302a; }
	.input-wrap.focused.dark { border-color: #8fae74; }
	.input { font-size: 14px; line-height: 21px; }
	.input.light { color: #2a251f; }
	.input.dark { color: #ece3d3; }
</style>
