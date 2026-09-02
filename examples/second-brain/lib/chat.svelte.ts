import { get_app } from './data.svelte.js';

/**
 * @typedef {{ id: number, role: 'user' | 'assistant', content: string, sources?: any[], cited?: number[],
 *   streaming?: boolean, error?: string | null }} ChatMessage
 */

/** @type {{ messages: ChatMessage[], streaming: boolean, draft: string }} */
export const chat = $state({ messages: [], streaming: false, draft: '' });

let controller = null;

export async function send(question) {
	const q = question.trim();
	if (!q || chat.streaming) return;
	const app = get_app();
	chat.draft = '';
	const history = chat.messages
		.filter((m) => !m.error && m.content)
		.slice(-6)
		.map((m) => ({ role: m.role, content: m.content }));
	chat.messages.push({ id: Date.now(), role: 'user', content: q });
	chat.messages.push({ id: Date.now() + 1, role: 'assistant', content: '', sources: [], cited: [], streaming: true, error: null });
	// Hold the message, not its index: clear() empties the list mid-stream and the
	// abort's rejection still lands here.
	const msg = chat.messages[chat.messages.length - 1];
	chat.streaming = true;
	controller = new AbortController();
	try {
		const result = await app.ask(q, {
			history,
			signal: controller.signal,
			on_token: (_delta, full) => {
				msg.content = full;
			}
		});
		Object.assign(msg, { content: result.answer, sources: result.sources, cited: result.cited, streaming: false });
	} catch (err) {
		Object.assign(msg, { streaming: false, error: err.name === 'AbortError' ? 'stopped' : err.message });
	} finally {
		chat.streaming = false;
		controller = null;
	}
}

export function stop() {
	controller?.abort();
}

export function clear() {
	stop();
	chat.messages = [];
}
