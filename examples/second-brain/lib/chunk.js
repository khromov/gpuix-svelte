/**
 * @typedef {{ idx: number, text: string, heading: string, words: number }} TextChunk
 */

/**
 * Whitespace-separated words, but never fewer than one per seven characters: a
 * minified script or a URL list is one "word" and thousands of tokens, and the
 * embedder's attention memory grows with the square of the token count.
 * @param {string} s
 */
export const count_words = (s) => {
	const t = s.trim();
	return t ? Math.max(t.split(/\s+/).length, Math.ceil(t.length / 7)) : 0;
};

const SENTENCE = /(?<=[.!?…])\s+(?=\S)/;

function split_blocks(body) {
	const lines = body.replace(/\r\n?/g, '\n').split('\n');
	const blocks = [];
	let buf = [];
	let code = false;

	const flush = () => {
		const text = buf.join('\n').trim();
		if (text) blocks.push({ text, code, words: count_words(text), heading: null });
		buf = [];
	};

	for (const line of lines) {
		if (/^\s*```/.test(line)) {
			if (!code) {
				flush();
				code = true;
				buf.push(line);
			} else {
				buf.push(line);
				flush();
				code = false;
			}
			continue;
		}
		if (code) {
			buf.push(line);
			continue;
		}
		const heading = /^(#{1,6})\s+(.*\S)\s*#*\s*$/.exec(line);
		if (heading) {
			flush();
			blocks.push({ text: heading[2], code: false, words: 0, heading: heading[1].length });
			continue;
		}
		if (line.trim() === '') flush();
		else buf.push(line);
	}
	if (code) buf.push('```');
	flush();
	return blocks;
}

function split_long(block, max) {
	const joiner = block.code ? '\n' : ' ';
	// A sentence (or code line) longer than `max` words is cut at word boundaries,
	// and a single word longer than a chunk at character boundaries.
	const parts = (block.code ? block.text.split('\n') : block.text.split(SENTENCE)).flatMap((part) => {
		if (count_words(part) <= max) return [part];
		const out = [];
		let cur = [];
		let words = 0;
		for (const word of part.split(/\s+/).filter(Boolean)) {
			if (word.length > max * 7) {
				if (cur.length) out.push(cur.join(' '));
				cur = [];
				words = 0;
				for (let i = 0; i < word.length; i += max * 7) out.push(word.slice(i, i + max * 7));
				continue;
			}
			const w = count_words(word);
			if (words + w > max && cur.length) {
				out.push(cur.join(' '));
				cur = [];
				words = 0;
			}
			cur.push(word);
			words += w;
		}
		if (cur.length) out.push(cur.join(' '));
		return out;
	});
	const pieces = [];
	let cur = [];
	let words = 0;
	for (const part of parts) {
		const w = count_words(part);
		if (words > 0 && words + w > max) {
			pieces.push({ text: cur.join(joiner), words });
			cur = [];
			words = 0;
		}
		cur.push(part);
		words += w;
	}
	if (cur.length) pieces.push({ text: cur.join(joiner), words });
	return pieces;
}

function tail_sentences(text, budget) {
	const sentences = text.split(SENTENCE);
	const out = [];
	let words = 0;
	for (let i = sentences.length - 1; i >= 0 && words < budget; i--) {
		const w = count_words(sentences[i]);
		if (words > 0 && words + w > budget) break;
		out.unshift(sentences[i]);
		words += w;
	}
	return { text: out.join(' '), words };
}

/**
 * Paragraph-aligned chunks of roughly `target` words with a heading path prefixed to
 * each, so a chunk still reads in context once it is retrieved on its own.
 *
 * @param {string} body markdown
 * @param {{ target?: number, max?: number, overlap?: number }} [opts]
 * @returns {TextChunk[]}
 */
export function chunk_markdown(body, { target = 350, max = 500, overlap = 0.15 } = {}) {
	const blocks = split_blocks(body ?? '');
	const chunks = [];
	const stack = [];
	let heading = '';
	let current = [];
	let words = 0;
	let lastCode = false;

	const emit = () => {
		if (!current.length) return;
		const text = current.join('\n\n');
		chunks.push({ idx: chunks.length, heading, text: heading ? `${heading}\n\n${text}` : text, words });
	};
	const reset = () => {
		current = [];
		words = 0;
	};
	const carry = () => {
		if (lastCode || !chunks.length) return;
		const tail = tail_sentences(current[current.length - 1] ?? '', Math.round(overlap * target));
		reset();
		if (tail.words > 0 && tail.words < target / 2) {
			current.push(tail.text);
			words = tail.words;
		}
	};

	for (const block of blocks) {
		if (block.heading !== null) {
			if (words >= target / 2) {
				emit();
				reset();
			}
			stack.length = block.heading;
			stack[block.heading - 1] = block.text;
			if (words === 0) heading = stack.filter(Boolean).join(' › ');
			continue;
		}
		const pieces = block.words > max ? split_long(block, max) : [block];
		for (const piece of pieces) {
			if (words > 0 && words + piece.words > target) {
				emit();
				carry();
				heading = stack.filter(Boolean).join(' › ');
				if (words + piece.words > max) reset();
			}
			current.push(piece.text);
			words += piece.words;
			lastCode = block.code;
		}
	}
	emit();
	return chunks;
}

/** The model prefix is the worker's business; the title is ours. */
export const embed_text = (title, chunk) => (title ? `${title}\n\n${chunk.text}` : chunk.text);
