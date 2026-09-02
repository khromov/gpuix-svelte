/**
 * Link ingestion: fetch a page and boil it down to a title, some metadata and a
 * markdown-ish text. `extract` is one synchronous HTMLRewriter pass over the
 * whole document, so it is pure and fixture-testable.
 */

import { warn } from './log.ts';
import type { Failure, Fetcher } from './types.ts';

export interface PageData {
	title: string;
	siteName: string;
	description: string;
	imageUrl: string | null;
	canonical: string | null;
	lang: string;
	text: string;
	candidates: Array<{ name: string; chars: number }>;
}

export type ScrapedPage = PageData & { url: string; contentType: string; truncated: boolean };

interface Span {
	start: number;
	end: number;
}

const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Substrate/0.1';

const DROP = [
	'script', 'style', 'noscript', 'template', 'nav', 'body > header', 'footer', 'aside', 'form', 'iframe', 'svg',
	'canvas', 'video', 'audio', 'object', 'embed', 'button', 'select', 'dialog',
	'[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]', '[role="dialog"]',
	'[aria-hidden="true"]', '[hidden]',
	'.sidebar', '.comments', '#comments', '.share', '.social', '.related', '.newsletter', '.cookie', '.advertisement', '.ad'
].join(', ');

// More candidates only help: the smallest one that still holds a quarter of the page wins.
const CANDIDATES = [
	'article', 'main', '[role="main"]', '[itemprop="articleBody"]', '#content', '#main', '#primary', '#bodyContent',
	'#mw-content-text', '.mw-parser-output', '.post-content', '.entry-content', '.article-body', '.article-content',
	'.post-body', '.entry', '.post', '.article', '.prose', '.markdown-body', '.story-body', '.blog-post', '.page-content'
].join(', ');

const BLOCK_TAGS = new Set([
	'p', 'blockquote', 'div', 'section', 'article', 'main', 'figure', 'figcaption', 'dd', 'dt', 'ul', 'ol', 'table', 'tr',
	'header', 'footer', 'aside', 'nav', 'address', 'details', 'summary', 'hr'
]);

const ENTITIES: Record<string, string> = {
	amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', copy: '©',
	reg: '®', trade: '™', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', bull: '•', middot: '·',
	times: '×', deg: '°', euro: '€', pound: '£', yen: '¥', sect: '§', para: '¶', shy: '', ensp: ' ', emsp: ' ', thinsp: ' ',
	zwnj: '', zwj: '', lrm: '', rlm: '', larr: '←', rarr: '→', uarr: '↑', darr: '↓', hearts: '♥', frac12: '½', frac14: '¼',
	frac34: '¾', plusmn: '±', micro: 'µ', iexcl: '¡', iquest: '¿', szlig: 'ß', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä',
	Ouml: 'Ö', Uuml: 'Ü', aring: 'å', Aring: 'Å', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', eacute: 'é', egrave: 'è',
	agrave: 'à', ccedil: 'ç', ntilde: 'ñ'
};

export function decode_entities(s: string): string {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
		if (body[0] === '#') {
			const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
		}
		return ENTITIES[body] ?? match;
	});
}

const tidy = (s: string) =>
	s
		.replace(/\r/g, '')
		.replace(/[ \t\f\v ]+/g, ' ')
		.replace(/ *\n */g, '\n')
		// Table rows: empty cells collapse, and a row that was only cells goes away.
		.replace(/(?: ?\|){2,}/g, ' |')
		.replace(/^[ |]+$/gm, '')
		.replace(/ \|$/gm, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	const cut = text.lastIndexOf('\n', max);
	return text.slice(0, cut > max / 2 ? cut : max) + '\n\n[truncated]';
}

const nonblank = (tokens: string[]) => tokens.join('').replace(/\s+/g, '').length;

function resolve(href: string | null | undefined, base: string): string | null {
	if (!href) return null;
	try {
		return new URL(href, base).href;
	} catch {
		return null;
	}
}

export function extract(html: string, { baseUrl = 'http://localhost/', maxChars = 200_000 }: { baseUrl?: string; maxChars?: number } = {}): PageData {
	const meta = { title: '', og: {} as Record<string, string>, twitter: {} as Record<string, string>, description: '', canonical: '', lang: '', base: '' };
	const out: string[] = [];
	const candidates: Array<Span & { name: string }> = [];
	const headings: Array<Span & { level: number }> = [];
	let skip = 0;
	let pre = 0;
	let textBuf = '';
	let titleBuf = '';

	// Marker handlers only raise flags: lol-html keeps one end-tag callback per
	// element (a later onEndTag replaces the earlier one), so the `*` handler below
	// is the single place that registers it.
	const flags = { drop: false, candidate: false };
	const attr = (el: HTMLRewriterTypes.Element, name: string) => {
		const value = el.getAttribute(name);
		return value == null ? null : decode_entities(value);
	};
	const push = (s: string) => {
		if (skip === 0) out.push(s);
	};

	new HTMLRewriter()
		.on('html', {
			element(el) {
				meta.lang = attr(el, 'lang') ?? '';
			}
		})
		.on('base[href]', {
			element(el) {
				meta.base ||= attr(el, 'href') ?? '';
			}
		})
		.on('meta', {
			element(el) {
				const key = (attr(el, 'property') ?? attr(el, 'name') ?? '').toLowerCase();
				const content = attr(el, 'content');
				if (!key || content == null) return;
				if (key.startsWith('og:')) meta.og[key.slice(3)] ??= content;
				else if (key.startsWith('twitter:')) meta.twitter[key.slice(8)] ??= content;
				else if (key === 'description') meta.description ||= content;
			}
		})
		.on('link[rel~="canonical"]', {
			element(el) {
				meta.canonical ||= attr(el, 'href') ?? '';
			}
		})
		.on('title', {
			text(t) {
				titleBuf += t.text;
				if (t.lastInTextNode) {
					meta.title ||= decode_entities(titleBuf).trim();
					titleBuf = '';
				}
			}
		})
		.on(DROP, {
			element() {
				flags.drop = true;
			}
		})
		.on(CANDIDATES, {
			element() {
				flags.candidate = true;
			}
		})
		.on('*', {
			element(el) {
				const tag = el.tagName;
				const drop = flags.drop || tag === 'title';
				const wanted = flags.candidate && !drop;
				flags.drop = flags.candidate = false;
				const content = el.canHaveContent;

				if (tag === 'body') skip = 0;

				// A depth counter rather than el.remove(): the rewritten output is never
				// read, and the count does not depend on how removed subtrees are dispatched.
				if (drop) {
					if (!content) return;
					skip++;
					el.onEndTag(() => {
						skip = Math.max(0, skip - 1);
					});
					return;
				}

				let open = '';
				let close = '';
				if (/^h[1-6]$/.test(tag)) {
					open = `\n\n${'#'.repeat(Number(tag[1]))} `;
					close = '\n\n';
				} else if (tag === 'li') {
					open = '\n- ';
					close = '\n';
				} else if (tag === 'td' || tag === 'th') {
					open = ' ';
					close = ' |';
				} else if (tag === 'br') {
					open = '\n';
				} else if (tag === 'pre') {
					open = '\n```\n';
					close = '\n```\n';
				} else if (BLOCK_TAGS.has(tag)) {
					open = '\n';
					close = '\n';
				}
				push(open);

				const id = attr(el, 'id');
				const candidate = wanted && content ? { name: tag + (id ? `#${id}` : ''), start: out.length, end: -1 } : null;
				if (candidate) candidates.push(candidate);
				if (!content) return;

				const heading = /^h[1-6]$/.test(tag) && skip === 0 ? { level: Number(tag[1]), start: out.length, end: -1 } : null;
				if (heading) headings.push(heading);
				const fence = tag === 'pre';
				if (fence) pre++;
				if (candidate || heading || close) {
					el.onEndTag(() => {
						if (candidate) candidate.end = out.length;
						if (heading) heading.end = out.length;
						if (fence) pre = Math.max(0, pre - 1);
						push(close);
					});
				}
			}
		})
		.onDocument({
			text(t) {
				if (skip > 0) return;
				// Chunks split mid-word and even mid-entity; only the last one is safe to decode.
				textBuf += t.text;
				if (!t.lastInTextNode) return;
				const s = decode_entities(textBuf);
				textBuf = '';
				out.push(pre > 0 ? s : s.replace(/\s+/g, ' '));
			}
		})
		.transform(html);

	const total = nonblank(out);
	const scored = candidates
		.filter((c) => c.end > c.start)
		.map((c) => ({ ...c, chars: nonblank(out.slice(c.start, c.end)) }));
	// The smallest container that still holds most of the page: article beats main.
	const winner = scored
		.filter((c) => c.chars >= Math.max(400, 0.25 * total))
		.sort((a, b) => a.chars - b.chars)[0];
	const text = truncate(tidy((winner ? out.slice(winner.start, winner.end) : out).join('')), maxChars);

	const base = resolve(meta.base, baseUrl) ?? baseUrl;
	let hostname = '';
	try {
		hostname = new URL(baseUrl).hostname.replace(/^www\./, '');
	} catch {}

	const siteName = decode_entities(meta.og.site_name || hostname);
	const headline = headings
		.filter((h) => h.end > h.start && h.level <= 2 && (!winner || h.start >= winner.start))
		.map((h) => tidy(out.slice(h.start, h.end).join('')).replace(/^#+\s*/, ''))
		.find((t) => t.length >= 8 && t.length <= 140 && t.split(/\s+/).length >= 2);

	return {
		title: pick_title({ og: decode_entities(meta.og.title || meta.twitter.title || ''), tag: decode_entities(meta.title), headline, siteName, hostname }),
		siteName,
		description: decode_entities(meta.og.description || meta.description || meta.twitter.description || '').trim(),
		imageUrl: resolve(meta.og.image || meta.twitter.image, base),
		canonical: resolve(meta.canonical || meta.og.url, base),
		lang: meta.lang,
		text,
		candidates: scored.map(({ name, chars }) => ({ name, chars }))
	};
}

const words_of = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));

/**
 * og:title wins when it says more than the site's name; a `<title>` loses its
 * " | Site" tail; and a page whose tags only name the site takes its first headline.
 */
export function pick_title({ og, tag, headline, siteName, hostname }: { og: string; tag: string; headline?: string; siteName: string; hostname: string }): string {
	const site = (siteName || hostname || '').toLowerCase();
	const generic = (t: string) => !t || t.toLowerCase() === site || t.toLowerCase() === hostname.toLowerCase();
	const strip_site = (t: string) => {
		const m = /^(.*?)\s+[|\-–—:·]\s+([^|\-–—:·]+)$/.exec(t);
		if (!m) return t;
		const tail = m[2].trim().toLowerCase();
		return tail === site || tail === hostname.toLowerCase() || site.includes(tail) ? m[1].trim() : t;
	};
	const clean_og = strip_site((og ?? '').trim());
	if (!generic(clean_og)) return clean_og;
	const clean_tag = strip_site((tag ?? '').trim());
	if (headline) {
		const tw = words_of(clean_tag);
		const hw = words_of(headline);
		const shared = [...hw].filter((w) => tw.has(w)).length;
		if (generic(clean_tag) || shared < Math.ceil(hw.size / 2)) return headline;
	}
	return clean_tag || headline || '';
}

export function normalize_url(raw: string): string {
	const url = new URL(raw.trim());
	url.hostname = url.hostname.toLowerCase();
	url.hash = '';
	for (const key of [...url.searchParams.keys()]) {
		if (/^utm_/i.test(key) || key === 'fbclid' || key === 'gclid' || key === 'ref') url.searchParams.delete(key);
	}
	if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
	return url.href;
}

/** A URL on its own line is a link; anything else is a note. */
export function looks_like_url(text: string): boolean {
	const t = text.trim();
	return /^https?:\/\/\S+$/i.test(t) && !/\s/.test(t);
}

export function friendly_fetch_error(err: unknown, url: string): Failure {
	let host = url;
	try {
		host = new URL(url).host;
	} catch {}
	const message = String((err as Failure)?.message ?? err);
	const name = (err as Failure)?.name ?? '';
	let friendly: string;
	if (name === 'TimeoutError' || /timed? ?out/i.test(message)) friendly = `${host} timed out`;
	else if (/ConnectionRefused|ECONNREFUSED/i.test(message)) friendly = `connection refused by ${host}`;
	else if (/ENOTFOUND|getaddrinfo|dns|FailedToOpenSocket/i.test(message)) friendly = `host not found: ${host}`;
	else if (/certificate|TLS|SSL/i.test(message)) friendly = `TLS error talking to ${host}`;
	else friendly = `${host}: ${message}`;
	const out = new Error(friendly) as Failure;
	out.cause = err;
	out.transient = !/host not found/.test(friendly);
	return out;
}

async function read_capped(res: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
	const reader = res.body!.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	let truncated = false;
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.byteLength;
		if (received > maxBytes) {
			truncated = true;
			await reader.cancel();
			break;
		}
	}
	const bytes = new Uint8Array(received);
	let at = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, at);
		at += chunk.byteLength;
	}
	return { bytes, truncated };
}

function decode_body(bytes: Uint8Array, contentType: string): string {
	let label = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
	if (!label) {
		const head = new TextDecoder('latin1' as Bun.Encoding).decode(bytes.subarray(0, 2048));
		label = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
	}
	try {
		return new TextDecoder((label ?? 'utf-8') as Bun.Encoding).decode(bytes);
	} catch {
		return new TextDecoder('utf-8').decode(bytes);
	}
}

export async function scrape(
	url: string,
	{ timeoutMs = 15_000, maxBytes = 3_000_000, maxChars = 200_000, fetch: fetch_fn = fetch }: { timeoutMs?: number; maxBytes?: number; maxChars?: number; fetch?: Fetcher } = {}
): Promise<ScrapedPage> {
	if (!/^https?:\/\//i.test(url)) throw Object.assign(new Error('only http(s) links can be scraped'), { transient: false });

	let res: Response;
	try {
		res = await fetch_fn(url, {
			redirect: 'follow',
			signal: AbortSignal.timeout(timeoutMs),
			headers: {
				'User-Agent': UA,
				Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
				'Accept-Language': 'en-US,en;q=0.8'
			}
		});
	} catch (err) {
		throw friendly_fetch_error(err, url);
	}

	if (!res.ok) {
		const err = new Error(`HTTP ${res.status} from ${new URL(res.url || url).host}`) as Failure;
		err.transient = res.status === 429 || res.status >= 500;
		throw err;
	}

	const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
	const type = contentType.split(';')[0].trim();
	const permanent = (message: string) => Object.assign(new Error(message), { transient: false });
	if (type === 'application/pdf') throw permanent('PDF pages are not supported yet');
	if (type.startsWith('image/')) throw permanent('that URL is an image — use Add image instead');
	if (type.startsWith('audio/') || type.startsWith('video/')) throw permanent('that URL is media, not a page');

	const { bytes, truncated } = await read_capped(res, maxBytes);
	const finalUrl = res.url || url;
	const body = decode_body(bytes, contentType);

	if (type === 'text/plain') {
		return { ...empty_page(finalUrl), text: truncate(tidy(body), maxChars), url: finalUrl, contentType: type, truncated };
	}
	if (type === 'application/json') {
		let text = body;
		try {
			text = JSON.stringify(JSON.parse(body), null, 2);
		} catch {}
		return { ...empty_page(finalUrl), text: '```\n' + truncate(text, maxChars) + '\n```', url: finalUrl, contentType: type, truncated };
	}
	if (type && type !== 'text/html' && type !== 'application/xhtml+xml') {
		throw permanent(`unsupported content type ${type}`);
	}

	const page = extract(body, { baseUrl: finalUrl, maxChars });
	return { ...page, url: finalUrl, contentType: type || 'text/html', truncated };
}

function empty_page(url: string): PageData {
	let hostname = '';
	try {
		hostname = new URL(url).hostname.replace(/^www\./, '');
	} catch {}
	return { title: '', siteName: hostname, description: '', imageUrl: null, canonical: url, lang: '', text: '', candidates: [] };
}

/** The thumbnail is optional: any failure here is a warning, never a failed ingest. */
export async function fetch_image(
	url: string,
	destPath: string,
	{ maxBytes = 8_000_000, maxDim = 512, fetch: fetch_fn = fetch }: { maxBytes?: number; maxDim?: number; fetch?: Fetcher } = {}
): Promise<{ path: string; width: number; height: number } | null> {
	try {
		const res = await fetch_fn(url, {
			redirect: 'follow',
			signal: AbortSignal.timeout(10_000),
			headers: { 'User-Agent': UA, Accept: 'image/*' }
		});
		if (!res.ok) return null;
		const length = Number(res.headers.get('content-length') ?? 0);
		if (length > maxBytes) return null;
		const { bytes, truncated } = await read_capped(res, maxBytes);
		if (truncated) return null;

		await new Bun.Image(bytes).resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).write(destPath);
		const { width, height } = await new Bun.Image(destPath).metadata();
		return { path: destPath, width, height };
	} catch (err) {
		warn(`thumbnail skipped for ${url}:`, (err as Error).message);
		return null;
	}
}
