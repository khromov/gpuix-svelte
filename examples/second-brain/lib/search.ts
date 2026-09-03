import { warn } from './log.ts';
import type { MlLike } from './ml-client.ts';
import { chunk_body, clip_snippet, fts_query, normalize_scores, parse_query, query_terms, rrf, snippet_around } from './rank.ts';
import { looks_like_url, normalize_url } from './scrape.ts';
import type { Settings } from './settings.ts';
import type { ChunkDetail, Item, Kind, ListOptions, Store } from './store.ts';
import type { VectorIndex } from './vectors.ts';

export interface SearchHit {
	item: Item;
	score: number;
	signals: string[];
	snippet: string;
	chunk_id: number | null;
	terms?: string[];
}

export interface SearchOptions {
	limit?: number;
	kinds?: Kind[] | null;
	signals?: string[];
	/** Overrides the `feeds.include` setting for one call. */
	feeds?: boolean;
}

export interface SearchResult {
	hits: SearchHit[];
	degraded: string[];
	terms: string[];
	kinds: Kind[] | null;
	text: string;
}

export interface ChunkHit {
	chunk: ChunkDetail;
	item: Item;
	score: number;
	signals: string[];
}

export type Search = ReturnType<typeof create_search>;

interface Ranked {
	id: number;
	score: number;
	snippet?: string;
}

interface VectorRanked extends Ranked {
	chunk_id: number;
}

type Rankings = { vector?: VectorRanked[]; fts?: Ranked[]; url?: Ranked[]; clip?: Ranked[] };

export function create_search({ store, vectors, images, ml, settings }: { store: Store; vectors: VectorIndex; images: VectorIndex; ml: MlLike; settings: Settings }) {
	// A worker that is up loads a model on demand, so an unloaded model is a slower
	// first answer, not a missing signal; only a down worker degrades the search.
	const usable = (model: 'embed' | 'clip') => ml.available && (ml.status?.worker === 'up' || ml.status?.[model]?.state === 'ready');
	const threshold = (key: keyof MlLike['thresholds']) => ml.thresholds?.[key] ?? 0;
	const include_feeds = () => settings.get('feeds.include') !== false;
	// The vector indexes know nothing about feeds, so the exclusion set comes from SQL.
	const feed_filter = (with_feeds: boolean): ((group: number) => boolean) | null => {
		if (with_feeds) return null;
		const feed_ids = store.feed_item_ids();
		return feed_ids.size === 0 ? null : (group: number) => !feed_ids.has(group);
	};

	/** best chunk per item, item ids as the ranking key */
	async function vector_ranking(query: string, k: number, filter: ((group: number) => boolean) | null): Promise<VectorRanked[]> {
		const vec = await ml.embed_query(query);
		const best = new Map<number, VectorRanked>();
		for (const hit of vectors.top_k(vec, k, { min_score: threshold('vector'), filter })) {
			if (!best.has(hit.group)) best.set(hit.group, { id: hit.group, chunk_id: hit.id, score: hit.score });
		}
		return [...best.values()];
	}

	/**
	 * `kind:` in the query outranks the `kinds` option; a query that is only a kind
	 * filter lists that kind, newest first.
	 */
	async function search(query: string, { limit = 20, kinds: kinds_opt = null, signals = ['vector', 'fts', 'clip'], feeds: feeds_opt }: SearchOptions = {}): Promise<SearchResult> {
		const parsed = parse_query(query);
		const kinds = parsed.kinds ?? kinds_opt;
		const with_feeds = parsed.feeds ?? feeds_opt ?? include_feeds();
		const exclude = feed_filter(with_feeds);
		const q = parsed.text;
		if (!q) {
			if (!kinds) return { hits: [], degraded: [], terms: [], kinds: null, text: '' };
			const hits = kinds
				.flatMap((kind) => store.list_items({ kind, limit: with_feeds ? limit : limit * 2 }))
				.filter((item) => with_feeds || item.feed_id == null)
				.sort((a, b) => b.created_at - a.created_at)
				.slice(0, limit)
				.map((item): SearchHit => ({ item, score: 1, signals: ['kind'], snippet: clip_snippet(item.body), chunk_id: null, terms: [] }));
			return { hits, degraded: [], terms: [], kinds, text: '' };
		}
		const degraded: string[] = [];
		const rankings: Rankings = {};
		const tasks: Promise<unknown>[] = [];

		if (signals.includes('vector')) {
			if (usable('embed')) {
				tasks.push(
					vector_ranking(q, limit * 4, exclude)
						.then((r) => (rankings.vector = r))
						.catch((err) => {
							warn('semantic search failed:', (err as Error).message);
							degraded.push('vector');
						})
				);
			} else degraded.push('vector');
		}

		if (signals.includes('fts')) {
			const match = fts_query(q);
			rankings.fts = match ? store.search_fts(match, { limit: limit * 2, kinds, feeds: with_feeds }).map((r) => ({ id: r.id, snippet: r.snippet, score: -r.rank })) : [];
		}

		// A pasted address is looked up, not tokenised.
		if (looks_like_url(q)) {
			try {
				const item = store.get_item_by_url(normalize_url(q));
				if (item) rankings.url = [{ id: item.id, score: 1 }];
			} catch {
				// Looked like a URL but did not parse as one; the other rankings still apply.
			}
		}

		if (signals.includes('clip') && (!kinds || kinds.includes('image')) && images.size > 0) {
			if (usable('clip')) {
				tasks.push(
					ml
						.clip_text(q)
						.then((vec) => (rankings.clip = images.top_k(vec, limit, { min_score: threshold('clip'), filter: exclude }).map((h) => ({ id: h.group, score: h.score }))))
						.catch((err) => {
							warn('image search failed:', (err as Error).message);
							degraded.push('clip');
						})
				);
			} else degraded.push('clip');
		}

		await Promise.all(tasks);

		const fused = rrf(rankings);
		const by_id = new Map(store.get_items(fused.map((f) => f.id)).map((item) => [item.id, item]));
		const terms = query_terms(q);
		const hits: SearchHit[] = [];
		for (const f of fused) {
			const item = by_id.get(f.id);
			if (!item || (kinds && !kinds.includes(item.kind))) continue;
			if (!with_feeds && item.feed_id != null && !rankings.url?.some((r) => r.id === item.id)) continue;
			const vec_hit = rankings.vector?.find((h) => h.id === f.id);
			const chunk = vec_hit ? store.get_chunk(vec_hit.chunk_id) : null;
			// The window around a query term comes first; failing that, the matched
			// chunk (what the embedder saw), and only then the body's opening.
			const source = chunk ? chunk_body(chunk.text, item.title) : item.body;
			const snippet = snippet_around(source, terms) ?? snippet_around(item.body, terms) ?? clip_snippet(source);
			hits.push({ item, score: f.score, signals: f.signals, snippet, chunk_id: chunk?.id ?? null, terms });
			if (hits.length >= limit) break;
		}
		return { hits: normalize_scores(hits), degraded, terms, kinds, text: q };
	}

	/** Chunk-level retrieval for RAG: several chunks of one item may all be relevant. */
	async function search_chunks(query: string, { k = 12, feeds: feeds_opt }: { k?: number; feeds?: boolean } = {}): Promise<ChunkHit[]> {
		const q = query.trim();
		if (!q) return [];
		const with_feeds = feeds_opt ?? include_feeds();
		const exclude = feed_filter(with_feeds);
		const rankings: { vector?: Ranked[]; fts?: Ranked[] } = {};
		if (usable('embed')) {
			try {
				const vec = await ml.embed_query(q);
				rankings.vector = vectors.top_k(vec, k * 2, { min_score: threshold('rag'), filter: exclude }).map((h) => ({ id: h.id, score: h.score }));
			} catch (err) {
				warn('semantic retrieval failed:', (err as Error).message);
			}
		}
		const match = fts_query(q);
		if (match) {
			rankings.fts = [];
			for (const row of store.search_fts(match, { limit: k, feeds: with_feeds })) {
				const first = store.chunks_of(row.id)[0];
				if (first) rankings.fts.push({ id: first.id, score: -row.rank });
			}
		}
		const out: ChunkHit[] = [];
		for (const f of rrf(rankings)) {
			const chunk = store.get_chunk(f.id);
			if (!chunk) continue;
			const item = store.get_item(chunk.item_id);
			if (!item) continue;
			out.push({ chunk, item, score: f.score, signals: f.signals });
			if (out.length >= k) break;
		}
		return out;
	}

	/** Neighbours by stored vectors only, so it needs no worker call. */
	async function related(item_id: number, { limit = 8, feeds: feeds_opt }: { limit?: number; feeds?: boolean } = {}): Promise<SearchHit[]> {
		const rankings: Rankings = {};
		// An item the feed brought in still gets neighbours out of its own feed.
		const with_feeds = feeds_opt ?? (store.get_item(item_id)?.feed_id != null || include_feeds());
		const exclude = feed_filter(with_feeds);
		const centroid = vectors.centroid(item_id);
		if (centroid) {
			const best = new Map<number, VectorRanked>();
			for (const hit of vectors.top_k(centroid, limit * 3, { exclude_group: item_id, min_score: threshold('related'), filter: exclude })) {
				if (!best.has(hit.group)) best.set(hit.group, { id: hit.group, chunk_id: hit.id, score: hit.score });
			}
			rankings.vector = [...best.values()];
		}
		if (images.has(item_id)) {
			const own = images.centroid(item_id);
			if (own) rankings.clip = images.top_k(own, limit, { exclude_group: item_id, min_score: threshold('clip_related'), filter: exclude }).map((h) => ({ id: h.group, score: h.score }));
		}
		const fused = rrf(rankings).slice(0, limit);
		const by_id = new Map(store.get_items(fused.map((f) => f.id)).map((item) => [item.id, item]));
		const hits: SearchHit[] = [];
		for (const f of fused) {
			const item = by_id.get(f.id);
			if (!item) continue;
			const vec_hit = rankings.vector?.find((h) => h.id === f.id);
			const chunk = vec_hit ? store.get_chunk(vec_hit.chunk_id) : null;
			hits.push({ item, score: f.score, signals: f.signals, snippet: clip_snippet(chunk ? chunk_body(chunk.text, item.title) : item.body), chunk_id: chunk?.id ?? null });
		}
		return normalize_scores(hits);
	}

	return { search, search_chunks, related, list: (opts?: ListOptions) => store.list_items(opts) };
}
