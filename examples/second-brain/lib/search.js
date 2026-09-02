import { warn } from './log.js';
import { chunk_body, clip_snippet, fts_query, normalize_scores, query_terms, rrf, snippet_around } from './rank.js';
import { looks_like_url, normalize_url } from './scrape.js';

/**
 * @typedef {{ item: import('./store.js').Item, score: number, signals: string[], snippet: string, chunk_id: number | null }} SearchHit
 */

/**
 * @param {{ store: any, vectors: import('./vectors.js').VectorIndex, images: import('./vectors.js').VectorIndex, ml: any }} deps
 */
export function create_search({ store, vectors, images, ml }) {
	const ready = (model) => ml.available && ml.status?.[model]?.state === 'ready';
	const threshold = (key) => ml.thresholds?.[key] ?? 0;

	/** best chunk per item, item ids as the ranking key */
	async function vector_ranking(query, k) {
		const vec = await ml.embed_query(query);
		const best = new Map();
		for (const hit of vectors.top_k(vec, k, { min_score: threshold('vector') })) {
			if (!best.has(hit.group)) best.set(hit.group, { id: hit.group, chunk_id: hit.id, score: hit.score });
		}
		return [...best.values()];
	}

	/**
	 * @param {string} query
	 * @param {{ limit?: number, kinds?: string[] | null, signals?: string[] }} [opts]
	 * @returns {Promise<{ hits: SearchHit[], degraded: string[] }>}
	 */
	async function search(query, { limit = 20, kinds = null, signals = ['vector', 'fts', 'clip'] } = {}) {
		const q = query.trim();
		if (!q) return { hits: [], degraded: [] };
		const degraded = [];
		const rankings = {};
		const tasks = [];

		if (signals.includes('vector')) {
			if (ready('embed')) {
				tasks.push(
					vector_ranking(q, limit * 4)
						.then((r) => (rankings.vector = r))
						.catch((err) => {
							warn('semantic search failed:', err.message);
							degraded.push('vector');
						})
				);
			} else degraded.push('vector');
		}

		if (signals.includes('fts')) {
			const match = fts_query(q);
			rankings.fts = match ? store.search_fts(match, { limit: limit * 2, kinds }).map((r) => ({ id: r.id, snippet: r.snippet, score: -r.rank })) : [];
		}

		// A pasted address is looked up, not tokenised.
		if (looks_like_url(q)) {
			try {
				const item = store.get_item_by_url(normalize_url(q));
				if (item) rankings.url = [{ id: item.id, score: 1 }];
			} catch {}
		}

		if (signals.includes('clip') && (!kinds || kinds.includes('image')) && images.size > 0) {
			if (ready('clip')) {
				tasks.push(
					ml
						.clip_text(q)
						.then((vec) => (rankings.clip = images.top_k(vec, limit, { min_score: threshold('clip') }).map((h) => ({ id: h.group, score: h.score }))))
						.catch((err) => {
							warn('image search failed:', err.message);
							degraded.push('clip');
						})
				);
			} else degraded.push('clip');
		}

		await Promise.all(tasks);

		const fused = rrf(rankings);
		const by_id = new Map(store.get_items(fused.map((f) => f.id)).map((item) => [item.id, item]));
		const terms = query_terms(q);
		const hits = [];
		for (const f of fused) {
			const item = by_id.get(f.id);
			if (!item || (kinds && !kinds.includes(item.kind))) continue;
			const vec_hit = rankings.vector?.find((h) => h.id === f.id);
			const chunk = vec_hit ? store.get_chunk(vec_hit.chunk_id) : null;
			// The window around a query term comes first; failing that, the matched
			// chunk (what the embedder saw), and only then the body's opening.
			const source = chunk ? chunk_body(chunk.text, item.title) : item.body;
			const snippet = snippet_around(source, terms) ?? snippet_around(item.body, terms) ?? clip_snippet(source);
			hits.push({ item, score: f.score, signals: f.signals, snippet, chunk_id: chunk?.id ?? null, terms });
			if (hits.length >= limit) break;
		}
		return { hits: normalize_scores(hits), degraded, terms };
	}

	/**
	 * Chunk-level retrieval for RAG: several chunks of one item may all be relevant.
	 * @param {string} query @param {{ k?: number }} [opts]
	 * @returns {Promise<Array<{ chunk: any, item: import('./store.js').Item, score: number, signals: string[] }>>}
	 */
	async function search_chunks(query, { k = 12 } = {}) {
		const q = query.trim();
		if (!q) return [];
		const rankings = {};
		if (ready('embed')) {
			try {
				const vec = await ml.embed_query(q);
				rankings.vector = vectors.top_k(vec, k * 2, { min_score: threshold('rag') }).map((h) => ({ id: h.id, score: h.score }));
			} catch (err) {
				warn('semantic retrieval failed:', err.message);
			}
		}
		const match = fts_query(q);
		if (match) {
			rankings.fts = [];
			for (const row of store.search_fts(match, { limit: k })) {
				const first = store.chunks_of(row.id)[0];
				if (first) rankings.fts.push({ id: first.id, score: -row.rank });
			}
		}
		const out = [];
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

	/**
	 * Neighbours by stored vectors only, so it needs no worker call.
	 * @param {number} item_id @param {{ limit?: number }} [opts]
	 * @returns {Promise<SearchHit[]>}
	 */
	async function related(item_id, { limit = 8 } = {}) {
		const rankings = {};
		const centroid = vectors.centroid(item_id);
		if (centroid) {
			const best = new Map();
			for (const hit of vectors.top_k(centroid, limit * 3, { exclude_group: item_id, min_score: threshold('related') })) {
				if (!best.has(hit.group)) best.set(hit.group, { id: hit.group, chunk_id: hit.id, score: hit.score });
			}
			rankings.vector = [...best.values()];
		}
		if (images.has(item_id)) {
			const own = images.centroid(item_id);
			if (own) rankings.clip = images.top_k(own, limit, { exclude_group: item_id, min_score: threshold('clip_related') }).map((h) => ({ id: h.group, score: h.score }));
		}
		const fused = rrf(rankings).slice(0, limit);
		const by_id = new Map(store.get_items(fused.map((f) => f.id)).map((item) => [item.id, item]));
		const hits = [];
		for (const f of fused) {
			const item = by_id.get(f.id);
			if (!item) continue;
			const vec_hit = rankings.vector?.find((h) => h.id === f.id);
			const chunk = vec_hit ? store.get_chunk(vec_hit.chunk_id) : null;
			hits.push({ item, score: f.score, signals: f.signals, snippet: clip_snippet(chunk ? chunk_body(chunk.text, item.title) : item.body), chunk_id: chunk?.id ?? null });
		}
		return normalize_scores(hits);
	}

	return { search, search_chunks, related, list: (opts) => store.list_items(opts) };
}
