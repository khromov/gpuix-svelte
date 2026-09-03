import { rss } from './rss.ts';
import type { FeedSource } from './types.ts';

export const SOURCES: FeedSource[] = [rss];

export const source_of = (type: string): FeedSource | null => SOURCES.find((s) => s.type === type) ?? null;

export const detect = (body: string, content_type: string): FeedSource | null => SOURCES.find((s) => s.sniff(body, content_type)) ?? null;

export type { FeedEntry, FeedSource, ParsedFeed } from './types.ts';
export { create_feeds, type Feeds } from './poll.ts';
