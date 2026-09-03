/**
 * RSS 2.0, RDF (RSS 1.0) and Atom in one source: the three differ in tag names, not in
 * shape, so every field below is a preference list across the vocabularies.
 */

import { extract } from '../scrape.ts';
import type { FeedEntry, FeedSource, ParsedFeed } from './types.ts';
import { child, children, descendants, parse_xml, text_of, type XmlNode } from './xml.ts';

const absolute = (href: string, base: string): string | null => {
	try {
		return new URL(href, base).toString();
	} catch {
		return null;
	}
};

function entry_link(node: XmlNode, base: string): string | null {
	for (const link of children(node, 'link')) {
		// Atom carries the address in an attribute; RSS puts it in the text.
		const href = link.attrs.href ?? link.text.trim();
		if (!href) continue;
		if (link.attrs.rel && link.attrs.rel !== 'alternate') continue;
		return absolute(href, base);
	}
	const guid = child(node, 'guid');
	if (guid && guid.attrs.ispermalink !== 'false' && /^https?:/i.test(guid.text.trim())) return guid.text.trim();
	return null;
}

function entry_image(node: XmlNode, base: string): string | null {
	for (const enclosure of children(node, 'enclosure')) {
		if (enclosure.attrs.url && (enclosure.attrs.type ?? '').startsWith('image/')) return absolute(enclosure.attrs.url, base);
	}
	for (const name of ['media:thumbnail', 'media:content', 'itunes:image']) {
		const media = child(node, name);
		const url = media?.attrs.url ?? media?.attrs.href;
		if (url && (name !== 'media:content' || (media!.attrs.medium ?? 'image') === 'image')) return absolute(url, base);
	}
	return null;
}

const date_of = (node: XmlNode): number | null => {
	const raw = text_of(node, 'pubdate', 'published', 'updated', 'dc:date', 'modified');
	const ms = raw ? Date.parse(raw) : NaN;
	return Number.isNaN(ms) ? null : ms;
};

/** Feed bodies are HTML fragments far more often than they are plain text. */
const to_text = (raw: string, base: string): string => {
	const trimmed = raw.trim();
	if (!trimmed || !/<[a-z!/]/i.test(trimmed)) return trimmed;
	return extract(trimmed, { baseUrl: base }).text || trimmed;
};

function entry_of(node: XmlNode, base: string): FeedEntry {
	const url = entry_link(node, base);
	const title = text_of(node, 'title');
	const published_at = date_of(node);
	const body = to_text(text_of(node, 'content:encoded', 'content', 'description', 'summary'), base);
	const author = text_of(node, 'dc:creator', 'author') || text_of(child(node, 'author'), 'name');
	return {
		guid: text_of(node, 'guid', 'id') || url || `${title}|${published_at ?? ''}`,
		url,
		title,
		body,
		published_at,
		image_url: entry_image(node, base),
		author
	};
}

export const rss: FeedSource = {
	type: 'rss',
	label: 'RSS / Atom',

	sniff(body, content_type) {
		if (/(rss|atom|rdf)\+xml|text\/xml|application\/xml/i.test(content_type)) return true;
		return /<(rss|feed|rdf:rdf)[\s>]/i.test(body.slice(0, 2000));
	},

	parse(body, url): ParsedFeed {
		const doc = parse_xml(body);
		if (!doc) throw new Error('not XML');
		// RSS nests everything under <channel>; Atom and RDF put it on the document element.
		const head = child(doc, 'channel') ?? doc;
		const nodes = [...descendants(doc, 'item'), ...descendants(doc, 'entry')];
		if (!nodes.length && doc.name !== 'rss' && doc.name !== 'feed' && doc.name !== 'rdf:rdf') throw new Error('no feed entries found');
		return {
			title: text_of(head, 'title'),
			site_url: entry_link(head, url),
			entries: nodes.map((node) => entry_of(node, url))
		};
	}
};
