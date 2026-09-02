/**
 * OpenAI-compatible chat completions over fetch: OpenAI, OpenRouter, Ollama and
 * LM Studio all speak this, differing only in how much of the base URL they expect.
 */

import { friendly_fetch_error } from './scrape.js';

/**
 * @typedef {{ baseUrl: string, apiKey?: string, model: string, timeoutMs?: number }} LlmConfig
 * @typedef {{ role: 'system' | 'user' | 'assistant', content: string | Array<{ type: 'text', text: string } |
 *   { type: 'image_url', image_url: { url: string, detail?: 'low' | 'high' | 'auto' } }> }} Message
 */

/** `http://localhost:11434` and a pasted `…/v1/chat/completions` both end up as `…/v1`. */
export function normalize_base_url(input) {
	let url = (input ?? '').trim().replace(/\/+$/, '');
	if (!url) return '';
	if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
	url = url.replace(/\/(chat\/completions|completions|models)$/i, '');
	if (!/\/v\d+$/i.test(url)) url += '/v1';
	return url;
}

/** @returns {LlmConfig | null} */
export function llm_config_from_env() {
	const baseUrl = process.env.GPUIX_BRAIN_LLM_URL;
	const model = process.env.GPUIX_BRAIN_LLM_MODEL;
	if (!baseUrl || !model) return null;
	return { baseUrl: normalize_base_url(baseUrl), apiKey: process.env.GPUIX_BRAIN_LLM_KEY ?? '', model };
}

/** @param {LlmConfig | null} config */
export function llm_available(config) {
	if (!config?.baseUrl || !config?.model) return { ok: false, reason: 'no LLM configured — set a base URL and model in Settings' };
	return { ok: true };
}

export class LlmError extends Error {
	/** @param {string} message @param {{ status?: number, code?: string, cause?: unknown }} [extra] */
	constructor(message, { status = 0, code = 'LLM', cause } = {}) {
		super(message);
		this.name = 'LlmError';
		this.status = status;
		this.code = code;
		this.cause = cause;
	}
}

/**
 * One `data:` payload per event, buffered across chunk boundaries.
 *
 * @param {ReadableStream<Uint8Array>} body
 * @returns {AsyncGenerator<string>}
 */
export async function* parse_sse(body) {
	const decoder = new TextDecoder();
	let buf = '';
	let data = [];

	const take = (line) => {
		if (line.endsWith('\r')) line = line.slice(0, -1);
		if (line === '') {
			const event = data.length ? data.join('\n') : null;
			data = [];
			return event;
		}
		if (line[0] === ':') return null;
		const colon = line.indexOf(':');
		const field = colon === -1 ? line : line.slice(0, colon);
		let value = colon === -1 ? '' : line.slice(colon + 1);
		if (value[0] === ' ') value = value.slice(1);
		if (field === 'data') data.push(value);
		return null;
	};

	for await (const chunk of body) {
		buf += decoder.decode(chunk, { stream: true });
		let nl;
		while ((nl = buf.indexOf('\n')) !== -1) {
			const event = take(buf.slice(0, nl));
			buf = buf.slice(nl + 1);
			if (event !== null) yield event;
		}
	}
	buf += decoder.decode();
	if (buf) take(buf.replace(/\r?\n?$/, ''));
	if (data.length) yield data.join('\n');
}

function host_of(url) {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

/**
 * @param {number} status
 * @param {string} body
 * @param {{ url: string, baseUrl: string, model: string }} ctx
 */
export function friendly_http_error(status, body, { url, baseUrl, model }) {
	const host = host_of(url);
	let detail = '';
	try {
		detail = JSON.parse(body)?.error?.message ?? '';
	} catch {
		detail = body.slice(0, 200);
	}
	let message;
	if (status === 401 || status === 403) message = `API key rejected by ${host}`;
	else if (status === 404 && /model/i.test(detail)) {
		message = `model "${model}" not found on ${host}`;
		if (/:11434/.test(host)) message += ` — try \`ollama pull ${model}\``;
	} else if (status === 404) message = `nothing at ${url} — check the base URL (${baseUrl}); Ollama and LM Studio serve …/v1`;
	else if (status === 400 && /image|vision|multimodal/i.test(detail)) message = `${model} can't take images — pick a vision model`;
	else if (status === 429) message = `${host} is rate limiting (${detail || 'try again later'})`;
	else if (status >= 500) message = `${host} returned ${status}${detail ? `: ${detail}` : ''}`;
	else message = `${host} returned ${status}${detail ? `: ${detail}` : ''}`;
	return new LlmError(message, { status, code: status === 429 || status >= 500 ? 'TRANSIENT' : 'HTTP' });
}

const DESCRIBE_PROMPT =
	'Describe this image in two or three sentences. Transcribe any visible text verbatim. End with a line starting "Tags:" and three to six comma-separated tags.';

/**
 * @param {LlmConfig} config
 */
export function create_llm(config) {
	const baseUrl = normalize_base_url(config.baseUrl);
	const timeoutMs = config.timeoutMs ?? 120_000;

	const headers = () => {
		const h = { 'Content-Type': 'application/json', 'X-Title': 'Substrate' };
		if (config.apiKey) h.Authorization = `Bearer ${config.apiKey}`;
		return h;
	};

	const request = async (path, init, signal) => {
		const url = `${baseUrl}${path}`;
		const signals = [AbortSignal.timeout(timeoutMs)];
		if (signal) signals.push(signal);
		let res;
		try {
			res = await fetch(url, { ...init, headers: headers(), signal: AbortSignal.any(signals) });
		} catch (err) {
			if (signal?.aborted) throw err;
			const friendly = friendly_fetch_error(err, url);
			if (/connection refused/.test(friendly.message)) {
				throw new LlmError(`nothing listening at ${host_of(url)} — is Ollama / LM Studio running?`, { code: 'TRANSIENT', cause: err });
			}
			throw new LlmError(friendly.message, { code: friendly.transient ? 'TRANSIENT' : 'NETWORK', cause: err });
		}
		if (!res.ok) {
			const body = await res.text().catch(() => '');
			throw friendly_http_error(res.status, body.slice(0, 2048), { url, baseUrl, model: config.model });
		}
		return res;
	};

	/**
	 * @param {Message[]} messages
	 * @param {{ stream?: boolean, signal?: AbortSignal, onDelta?: (delta: string, full: string) => void,
	 *   temperature?: number, maxTokens?: number }} [opts]
	 * @returns {Promise<string>}
	 */
	async function chat(messages, { stream = true, signal, onDelta, temperature = 0.2, maxTokens } = {}) {
		const body = { model: config.model, messages, stream, temperature };
		if (maxTokens) body.max_tokens = maxTokens;
		const res = await request('/chat/completions', { method: 'POST', body: JSON.stringify(body) }, signal);

		const type = (res.headers.get('content-type') ?? '').toLowerCase();
		if (!stream || type.includes('application/json')) {
			const json = await res.json();
			if (json.error) throw new LlmError(json.error.message ?? String(json.error));
			const text = json.choices?.[0]?.message?.content ?? '';
			onDelta?.(text, text);
			return text;
		}

		let full = '';
		for await (const payload of parse_sse(res.body)) {
			if (payload === '[DONE]') break;
			let obj;
			try {
				obj = JSON.parse(payload);
			} catch {
				continue;
			}
			if (obj.error) throw new LlmError(obj.error.message ?? String(obj.error));
			const delta = obj.choices?.[0]?.delta?.content ?? '';
			if (!delta) continue;
			full += delta;
			onDelta?.(delta, full);
		}
		return full;
	}

	async function models() {
		const res = await request('/models', { method: 'GET' });
		const json = await res.json();
		const list = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : [];
		return list.map((m) => m.id ?? m.name).filter(Boolean).sort();
	}

	async function test() {
		const list = await models();
		return { ok: true, models: list, modelListed: list.includes(config.model) };
	}

	/**
	 * @param {Uint8Array} bytes
	 * @param {{ prompt?: string, signal?: AbortSignal }} [opts]
	 */
	async function describe_image(bytes, { prompt = DESCRIBE_PROMPT, signal } = {}) {
		const webp = await new Bun.Image(bytes).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).bytes();
		const url = `data:image/webp;base64,${Buffer.from(webp).toString('base64')}`;
		return chat(
			[{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url, detail: 'low' } }] }],
			{ stream: false, signal }
		);
	}

	/** @param {string} text @param {{ maxWords?: number, signal?: AbortSignal }} [opts] */
	async function summarize(text, { maxWords = 120, signal } = {}) {
		return chat(
			[
				{ role: 'system', content: `Summarize the user's text in three to five bullet points, at most ${maxWords} words in total. Plain markdown, no preamble.` },
				{ role: 'user', content: text.slice(0, 24_000) }
			],
			{ stream: false, signal }
		);
	}

	/** @param {string} text @param {{ signal?: AbortSignal }} [opts] */
	async function suggest_title(text, { signal } = {}) {
		const raw = await chat(
			[
				{ role: 'system', content: 'Reply with only a title for the text: at most eight words, no quotes, no trailing period.' },
				{ role: 'user', content: text.slice(0, 6000) }
			],
			{ stream: false, signal, maxTokens: 32 }
		);
		return raw.split('\n')[0].replace(/^["'“”]+|["'“”.]+$/g, '').trim().slice(0, 80);
	}

	return { config: { ...config, baseUrl }, chat, models, test, describe_image, summarize, suggest_title };
}
