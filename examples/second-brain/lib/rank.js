/**
 * Reciprocal rank fusion: each signal contributes 1 / (k + rank), so a hit ranked
 * well by two signals beats one signal's favourite without any score calibration.
 *
 * @param {Record<string, Array<{ id: number }>>} rankings best first
 * @param {{ k?: number }} [opts]
 * @returns {Array<{ id: number, score: number, signals: string[], ranks: Record<string, number> }>}
 */
export function rrf(rankings, { k = 60 } = {}) {
	const fused = new Map();
	for (const [signal, list] of Object.entries(rankings)) {
		list.forEach((hit, i) => {
			const entry = fused.get(hit.id) ?? { id: hit.id, score: 0, signals: [], ranks: {} };
			entry.score += 1 / (k + i + 1);
			entry.signals.push(signal);
			entry.ranks[signal] = i + 1;
			fused.set(hit.id, entry);
		});
	}
	return [...fused.values()].sort((a, b) => b.score - a.score);
}

/** Every term quoted, so FTS5 operators and punctuation in the query are just words. */
export function fts_query(raw) {
	const terms = (raw ?? '').replace(/"/g, ' ').split(/\s+/).filter(Boolean);
	if (!terms.length) return null;
	return terms.map((t, i) => `"${t}"${i === terms.length - 1 ? '*' : ''}`).join(' ');
}

/** @param {string} text @param {number} [max] */
export function clip_snippet(text, max = 200) {
	const t = (text ?? '').replace(/\s+/g, ' ').trim();
	if (t.length <= max) return t;
	return t.slice(0, max - 1).replace(/\s\S*$/, '') + '…';
}

/** The query's words, longest first, without FTS syntax. */
export function query_terms(query) {
	return [...new Set((query ?? '').toLowerCase().replace(/["*]/g, ' ').split(/\s+/).filter((t) => t.length >= 2))].sort((a, b) => b.length - a.length);
}

/**
 * A window of `max` characters around the first place any query term occurs,
 * so a result shows why it matched rather than how it starts.
 *
 * @param {string} text
 * @param {string[]} terms lowercase
 * @param {number} [max]
 * @returns {string | null} null when no term occurs
 */
export function snippet_around(text, terms, max = 200) {
	const flat = (text ?? '').replace(/\s+/g, ' ').trim();
	const lower = flat.toLowerCase();
	let at = -1;
	for (const term of terms) {
		const i = lower.indexOf(term);
		if (i !== -1 && (at === -1 || i < at)) at = i;
	}
	if (at === -1) return null;
	if (flat.length <= max) return flat;
	let start = Math.max(0, at - Math.floor(max / 3));
	if (start > 0) {
		const space = flat.lastIndexOf(' ', start);
		start = space > 0 ? space + 1 : start;
	}
	let end = Math.min(flat.length, start + max);
	if (end < flat.length) {
		const space = flat.lastIndexOf(' ', end);
		if (space > start + max / 2) end = space;
	}
	return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '');
}

/** A chunk opens with its heading path; next to the item's title that line says nothing new. */
export function chunk_body(text, title) {
	const at = text.indexOf('\n\n');
	if (at === -1 || at > 160) return text;
	const head = text.slice(0, at).trim();
	return title && (head === title || head.startsWith(`${title} ›`) || title.startsWith(head)) ? text.slice(at + 2) : text;
}

/** Top hit becomes 1.0, for display only. */
export function normalize_scores(hits) {
	const top = hits[0]?.score ?? 0;
	return top > 0 ? hits.map((h) => ({ ...h, score: h.score / top })) : hits;
}
