import type { Kind } from './store.ts';

export interface Fused {
	id: number;
	score: number;
	signals: string[];
	ranks: Record<string, number>;
}

/**
 * Reciprocal rank fusion: each signal contributes 1 / (k + rank), so a hit ranked
 * well by two signals beats one signal's favourite without any score calibration.
 * Every ranking is best first.
 */
export function rrf(rankings: Record<string, Array<{ id: number }>>, { k = 60 }: { k?: number } = {}): Fused[] {
	const fused = new Map<number, Fused>();
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
export function fts_query(raw: string | null | undefined): string | null {
	const terms = (raw ?? '').replace(/"/g, ' ').split(/\s+/).filter(Boolean);
	if (!terms.length) return null;
	return terms.map((t, i) => `"${t}"${i === terms.length - 1 ? '*' : ''}`).join(' ');
}

export function clip_snippet(text: string | null | undefined, max = 200): string {
	const t = (text ?? '').replace(/\s+/g, ' ').trim();
	if (t.length <= max) return t;
	return t.slice(0, max - 1).replace(/\s\S*$/, '') + '…';
}

const KIND_ALIASES: Record<string, Kind> = {
	note: 'text', notes: 'text', text: 'text',
	link: 'link', links: 'link', url: 'link', urls: 'link',
	image: 'image', images: 'image', img: 'image', photo: 'image', photos: 'image', picture: 'image', pictures: 'image',
	audio: 'audio', recording: 'audio', recordings: 'audio', voice: 'audio', memo: 'audio'
};

/** `kind:link`, `kind:image,audio` and `is:note` narrow a query; the rest is the text. */
export function parse_query(query: string | null | undefined): { text: string; kinds: Kind[] | null; unknown: string[] } {
	const kinds = new Set<Kind>();
	const unknown: string[] = [];
	const text = (query ?? '')
		.replace(/(?:^|\s)(?:kind|is|type):([\w,]*)/gi, (_, list: string) => {
			for (const word of list.split(',').filter(Boolean)) {
				const kind = KIND_ALIASES[word.toLowerCase()];
				if (kind) kinds.add(kind);
				else unknown.push(word);
			}
			return ' ';
		})
		.replace(/\s+/g, ' ')
		.trim();
	return { text, kinds: kinds.size ? [...kinds] : null, unknown };
}

/** The query's words, longest first, without FTS syntax. */
export function query_terms(query: string | null | undefined): string[] {
	return [...new Set((query ?? '').toLowerCase().replace(/["*]/g, ' ').split(/\s+/).filter((t) => t.length >= 2))].sort((a, b) => b.length - a.length);
}

/**
 * A window of `max` characters around the first place any query term occurs,
 * so a result shows why it matched rather than how it starts; null when no
 * (lowercase) term occurs.
 */
export function snippet_around(text: string | null | undefined, terms: string[], max = 200): string | null {
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

/** Sorted, non-overlapping character ranges of every (lowercase) term occurrence, for GPUI's `highlight={{ ranges }}`. */
export function match_ranges(text: string | null | undefined, terms: string[]): Array<[number, number]> {
	const lower = (text ?? '').toLowerCase();
	const ranges: Array<[number, number]> = [];
	for (const term of terms) {
		let from = 0;
		for (;;) {
			const at = lower.indexOf(term, from);
			if (at === -1) break;
			ranges.push([at, at + term.length]);
			from = at + term.length;
		}
	}
	ranges.sort((a, b) => a[0] - b[0]);
	const out: Array<[number, number]> = [];
	for (const r of ranges) {
		const last = out[out.length - 1];
		if (last && r[0] < last[1]) last[1] = Math.max(last[1], r[1]);
		else out.push([r[0], r[1]]);
	}
	return out;
}

/** A chunk opens with its heading path; next to the item's title that line says nothing new. */
export function chunk_body(text: string, title: string): string {
	const at = text.indexOf('\n\n');
	if (at === -1 || at > 160) return text;
	const head = text.slice(0, at).trim();
	return title && (head === title || head.startsWith(`${title} ›`) || title.startsWith(head)) ? text.slice(at + 2) : text;
}

/** Top hit becomes 1.0, for display only. */
export function normalize_scores<T extends { score: number }>(hits: T[]): T[] {
	const top = hits[0]?.score ?? 0;
	return top > 0 ? hits.map((h) => ({ ...h, score: h.score / top })) : hits;
}
