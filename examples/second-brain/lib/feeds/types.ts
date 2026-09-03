/** The seam every feed kind implements. Adding one is a module plus an entry in `SOURCES`. */

export interface FeedEntry {
	/** Stable across polls; the poller has seen this entry once it is recorded. */
	guid: string;
	url: string | null;
	title: string;
	/** Plain text, already unwrapped from whatever markup the feed carried. */
	body: string;
	published_at: number | null;
	image_url: string | null;
	author: string;
}

export interface ParsedFeed {
	title: string;
	site_url: string | null;
	entries: FeedEntry[];
}

export interface FeedSource {
	type: string;
	label: string;
	/** Cheap enough to run over every source in turn on the first fetch. */
	sniff(body: string, content_type: string): boolean;
	parse(body: string, url: string): ParsedFeed;
}
