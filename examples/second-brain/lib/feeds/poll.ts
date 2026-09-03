/**
 * Subscriptions that fill the library on their own. Polling runs here rather than in
 * the ML worker: that process handles one job at a time, and it does not exist at all
 * when the model dependencies are missing, which would leave feeds silently unpolled.
 */

import { Cron } from 'croner';
import type { Bus } from '../bus.ts';
import type { Ingestor } from '../ingest.ts';
import { log, warn } from '../log.ts';
import { derive_title } from '../media.ts';
import { friendly_fetch_error, normalize_url } from '../scrape.ts';
import type { Settings } from '../settings.ts';
import { DEFAULT_SCHEDULE, type Feed, type Item, type Store } from '../store.ts';
import type { Fetcher } from '../types.ts';
import { detect, source_of } from './index.ts';
import type { FeedEntry, FeedSource } from './types.ts';

export interface FeedDeps {
	store: Store;
	settings: Settings;
	bus: Bus;
	ingest: Pick<Ingestor, 'enqueue'>;
	delete_item: (id: number) => boolean;
	fetch?: Fetcher;
}

export interface PollResult {
	added: number;
	pruned: number;
	unchanged: boolean;
}

export type Feeds = ReturnType<typeof create_feeds>;

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 8_000_000;
// A boot with ten feeds should not be ten simultaneous fetches.
const CATCH_UP_STAGGER_MS = 4_000;

const USER_AGENT = 'Substrate/0.1 (+https://github.com/khromov/gpuix-svelte)';

const excerpt = (text: string, max = 200): string => (text.length > max ? `${text.slice(0, max - 1).replace(/\s\S*$/, '')}…` : text);

export function create_feeds({ store, settings, bus, ingest, delete_item, fetch: fetch_fn = fetch }: FeedDeps) {
	const jobs = new Map<number, Cron>();
	const timers = new Set<ReturnType<typeof setTimeout>>();
	const running = new Set<number>();

	const emit = (id: number | null = null) => bus.emit({ type: 'feed', id });
	// Screenshots, the frame bench and the tests all want a brain that never phones home.
	const polling_allowed = () => process.env.GPUIX_BRAIN_FEEDS !== '0' && process.env.GPUIX_BRAIN_OFFLINE !== '1';

	async function fetch_doc(url: string, conditional: Feed | null): Promise<{ status: number; body: string; content_type: string; etag: string | null; last_modified: string | null; url: string }> {
		const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5' };
		if (conditional?.etag) headers['if-none-match'] = conditional.etag;
		if (conditional?.last_modified) headers['if-modified-since'] = conditional.last_modified;
		let res: Response;
		try {
			res = await fetch_fn(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
		} catch (err) {
			throw friendly_fetch_error(err, url);
		}
		if (res.status === 304) return { status: 304, body: '', content_type: '', etag: conditional?.etag ?? null, last_modified: conditional?.last_modified ?? null, url };
		if (!res.ok) {
			const failure = new Error(`${res.status} ${res.statusText} from ${url}`) as Error & { transient: boolean };
			failure.transient = res.status >= 500 || res.status === 429;
			throw failure;
		}
		const body = (await res.text()).slice(0, MAX_BYTES);
		return {
			status: res.status,
			body,
			content_type: res.headers.get('content-type') ?? '',
			etag: res.headers.get('etag'),
			last_modified: res.headers.get('last-modified'),
			url: res.url || url
		};
	}

	/** A blog's homepage is what people paste, so its `<link rel="alternate">` is followed once. */
	function alternate_feed(html: string, base: string): string | null {
		for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
			if (!/rel\s*=\s*["']?[^"'>]*alternate/i.test(tag)) continue;
			if (!/type\s*=\s*["']?application\/(rss|atom|rdf)\+xml/i.test(tag)) continue;
			const href = tag.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
			const value = href?.[2] ?? href?.[3] ?? href?.[4];
			if (value) {
				try {
					return new URL(value, base).toString();
				} catch {
					// A relative href against a base that will not parse; try the next link tag.
				}
			}
		}
		return null;
	}

	async function resolve_source(url: string): Promise<{ url: string; source: FeedSource; body: string; doc: Awaited<ReturnType<typeof fetch_doc>> }> {
		let doc = await fetch_doc(url, null);
		let source = detect(doc.body, doc.content_type);
		if (!source) {
			const alternate = alternate_feed(doc.body, doc.url);
			if (!alternate) throw new Error(`no feed found at ${url}`);
			doc = await fetch_doc(alternate, null);
			source = detect(doc.body, doc.content_type);
			if (!source) throw new Error(`no feed found at ${alternate}`);
			url = alternate;
		}
		return { url, source, body: doc.body, doc };
	}

	function ingest_entry(feed: Feed, entry: FeedEntry): Item | null {
		const url = entry.url ? normalize_url(entry.url) : null;
		if (url) {
			const existing = store.get_item_by_url(url);
			// Already captured by hand: adopt it rather than fail the unique index.
			if (existing) {
				if (existing.feed_id == null) store.update_item(existing.id, { feed_id: feed.id });
				store.record_entry(feed.id, entry.guid, existing.id);
				return null;
			}
		}
		// `full_text` is only ever "leave the body empty": ingest scrapes a link that has none.
		const body = feed.full_text && url ? '' : entry.body;
		const title = entry.title || derive_title(entry.body) || url || feed.title;
		const item = store.insert_item({
			kind: url ? 'link' : 'text',
			title,
			body,
			source_url: url,
			feed_id: feed.id,
			created_at: entry.published_at ?? Date.now(),
			meta: { feed: true, auto_title: !entry.title, author: entry.author, excerpt: excerpt(entry.body), site_name: feed.title }
		});
		store.record_entry(feed.id, entry.guid, item.id);
		bus.emit({ type: 'item', id: item.id, status: item.status, added: true });
		ingest.enqueue(item.id);
		return item;
	}

	function prune(feed: Feed): number {
		if (feed.retention_days == null && feed.retention_max == null) return 0;
		const items = store.feed_entry_items(feed.id);
		const cutoff = feed.retention_days == null ? null : Date.now() - feed.retention_days * 86_400_000;
		let pruned = 0;
		items.forEach((item, index) => {
			// Anything you have edited is yours now, whatever the feed says.
			if (item.meta.edited) return;
			const too_many = feed.retention_max != null && index >= feed.retention_max;
			const too_old = cutoff != null && item.created_at < cutoff;
			if ((too_many || too_old) && delete_item(item.id)) pruned++;
		});
		return pruned;
	}

	async function poll(id: number, { force = false }: { force?: boolean } = {}): Promise<PollResult> {
		const feed = store.get_feed(id);
		if (!feed) throw new Error(`no feed ${id}`);
		if (running.has(id)) return { added: 0, pruned: 0, unchanged: true };
		running.add(id);
		try {
			const doc = await fetch_doc(feed.url, force ? null : feed);
			if (doc.status === 304) {
				store.update_feed(id, { last_polled_at: Date.now(), last_ok_at: Date.now(), last_error: null });
				emit(id);
				return { added: 0, pruned: 0, unchanged: true };
			}
			const source = source_of(feed.type) ?? detect(doc.body, doc.content_type);
			if (!source) throw new Error(`${feed.url} is no longer a feed this build can read`);
			const parsed = source.parse(doc.body, doc.url);
			let added = 0;
			// Oldest first, so ids and the timeline agree.
			for (const entry of [...parsed.entries].reverse()) {
				if (store.seen_entry(feed.id, entry.guid)) continue;
				if (ingest_entry(feed, entry)) added++;
			}
			const now = Date.now();
			store.update_feed(id, {
				title: feed.title || parsed.title,
				site_url: feed.site_url ?? parsed.site_url,
				etag: doc.etag,
				last_modified: doc.last_modified,
				last_polled_at: now,
				last_ok_at: now,
				last_error: null
			});
			const pruned = prune(store.get_feed(id)!);
			emit(id);
			if (added || pruned) log(`feed ${feed.title || feed.url}: ${added} new, ${pruned} pruned`);
			return { added, pruned, unchanged: added === 0 };
		} catch (err) {
			store.update_feed(id, { last_polled_at: Date.now(), last_error: (err as Error).message });
			emit(id);
			throw err;
		} finally {
			running.delete(id);
		}
	}

	function schedule(feed: Feed) {
		jobs.get(feed.id)?.stop();
		jobs.delete(feed.id);
		if (!feed.enabled || !polling_allowed()) return;
		try {
			// `protect` keeps a slow poll from being started again underneath itself.
			jobs.set(
				feed.id,
				new Cron(feed.schedule, { name: `feed:${feed.id}`, protect: true }, () => {
					poll(feed.id).catch((err) => warn(`feed ${feed.id} poll failed:`, (err as Error).message));
				})
			);
		} catch {
			warn(`feed ${feed.id} has an unusable schedule (${feed.schedule}); it will only refresh by hand`);
		}
	}

	/** A poll the app was closed for: the run its schedule wanted is already in the past. */
	function missed(feed: Feed): boolean {
		if (!feed.last_polled_at) return true;
		try {
			const next = new Cron(feed.schedule).nextRun(new Date(feed.last_polled_at));
			return next != null && next.getTime() <= Date.now();
		} catch {
			return false;
		}
	}

	const feeds = {
		list: (): Feed[] => store.list_feeds(),
		get: (id: number) => store.get_feed(id),
		counts: () => store.feed_counts(),

		async add(url: string, options: Partial<Feed> = {}): Promise<{ feed: Feed; result: PollResult }> {
			const normalized = normalize_url(url);
			if (store.get_feed_by_url(normalized)) throw new Error('already subscribed to that feed');
			const found = await resolve_source(normalized);
			if (store.get_feed_by_url(found.url)) throw new Error('already subscribed to that feed');
			const parsed = found.source.parse(found.body, found.doc.url);
			const feed = store.insert_feed({
				...options,
				type: found.source.type,
				url: found.url,
				title: options.title ?? parsed.title,
				site_url: parsed.site_url,
				schedule: options.schedule ?? settings.get('feeds.schedule') ?? DEFAULT_SCHEDULE
			});
			emit(feed.id);
			// The first poll is the backfill: everything the feed currently carries.
			const result = await poll(feed.id, { force: true });
			schedule(store.get_feed(feed.id)!);
			return { feed: store.get_feed(feed.id)!, result };
		},

		update(id: number, patch: Partial<Feed>): Feed | null {
			const feed = store.update_feed(id, patch);
			if (feed) schedule(feed);
			emit(id);
			return feed;
		},

		remove(id: number, { keep_items = true }: { keep_items?: boolean } = {}): number {
			jobs.get(id)?.stop();
			jobs.delete(id);
			const item_ids = keep_items ? [] : store.feed_items(id);
			for (const item_id of item_ids) delete_item(item_id);
			store.delete_feed(id);
			emit(null);
			return item_ids.length;
		},

		refresh: (id: number) => poll(id, { force: true }),

		async refresh_all(): Promise<number> {
			let added = 0;
			for (const feed of store.list_feeds()) {
				if (!feed.enabled) continue;
				try {
					added += (await poll(feed.id)).added;
				} catch (err) {
					warn(`feed ${feed.id} poll failed:`, (err as Error).message);
				}
			}
			return added;
		},

		/** Schedules every enabled feed and catches up whatever was missed while the app was shut. */
		start() {
			if (!polling_allowed()) return;
			let due = 0;
			for (const feed of store.list_feeds()) {
				schedule(feed);
				if (!feed.enabled || !missed(feed)) continue;
				const timer = setTimeout(
					() => {
						timers.delete(timer);
						poll(feed.id).catch((err) => warn(`feed ${feed.id} catch-up failed:`, (err as Error).message));
					},
					due++ * CATCH_UP_STAGGER_MS
				);
				timers.add(timer);
			}
		},

		stop() {
			for (const job of jobs.values()) job.stop();
			jobs.clear();
			for (const timer of timers) clearTimeout(timer);
			timers.clear();
		},

		/** `null` when the expression is one croner cannot read. */
		next_run(schedule_expr: string): number | null {
			try {
				return new Cron(schedule_expr).nextRun()?.getTime() ?? null;
			} catch {
				return null;
			}
		}
	};

	return feeds;
}
