// Renders README.md and docs/*.md to static HTML in dist/docs, for GitHub Pages; code blocks are
// coloured in the browser by docs/assets/prism.js, a vendored Prism build.

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked, type Tokens } from 'marked';

const REPO = 'https://github.com/khromov/gpuix-svelte';

const PAGES = [
	{ source: 'README.md', out: 'index.html', nav: 'Overview' },
	{ source: 'docs/styling.md', out: 'styling.html', nav: 'Styling' },
	{ source: 'docs/components.md', out: 'components.html', nav: 'Components' },
	{ source: 'docs/guide.md', out: 'guide.html', nav: 'Guide' },
	{ source: 'docs/testing.md', out: 'testing.html', nav: 'Testing' },
	{ source: 'docs/shipping.md', out: 'shipping.html', nav: 'Shipping' },
	{ source: 'docs/contributing.md', out: 'contributing.html', nav: 'Contributing' }
];

const root = fileURLToPath(new URL('..', import.meta.url));
const out_dir = join(root, 'dist/docs');

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// GitHub's anchor rule, so `file.md#heading` links written for github.com land here too.
const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.replace(/[^\p{L}\p{N}\s_-]/gu, '')
		.trim()
		.replace(/\s/g, '-');

// Links between published pages stay on the site; everything else in the repo goes to GitHub.
function rewrite(href: string, from: string) {
	if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return href;
	const [path, hash = ''] = href.split('#');
	const target = posix.normalize(posix.join(posix.dirname(from), path)).replace(/\/$/, '');
	const page = PAGES.find((p) => p.source === target);
	if (page) return page.out + (hash ? `#${hash}` : '');
	return `${REPO}/blob/main/${target}${hash ? `#${hash}` : ''}`;
}

function render(source: string) {
	const marked = new Marked({
		gfm: true,
		walkTokens(token) {
			if (token.type === 'link' || token.type === 'image') token.href = rewrite(token.href, source);
		},
		renderer: {
			heading({ tokens, depth }: Tokens.Heading) {
				const html = this.parser.parseInline(tokens);
				const id = slug(html);
				return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${html}</a></h${depth}>\n`;
			}
		}
	});
	const html = marked.parse(readFileSync(join(root, source), 'utf8'), { async: false });
	return html.replace(
		/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/g,
		(_, kind: string) => `<blockquote class="alert ${kind.toLowerCase()}"><p><strong>${kind[0]}${kind.slice(1).toLowerCase()}</strong><br>`
	);
}

const CSS = `
:root { color-scheme: light dark; --bg: #fff; --fg: #1f2328; --muted: #59636e; --line: #d1d9e0; --code: #f6f8fa; --link: #0969da; --warn: #9a6700; --t-comment: #59636e; --t-keyword: #cf222e; --t-string: #0a3069; --t-fn: #8250df; --t-tag: #116329; --t-attr: #0550ae; --t-num: #0550ae; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d; --code: #151b23; --link: #4493f8; --warn: #d29922; --t-comment: #9198a1; --t-keyword: #ff7b72; --t-string: #a5d6ff; --t-fn: #d2a8ff; --t-tag: #7ee787; --t-attr: #79c0ff; --t-num: #79c0ff; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
.layout { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 48px; max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
nav { position: sticky; top: 32px; align-self: start; display: flex; flex-direction: column; gap: 4px; }
nav .brand { font-weight: 700; color: var(--fg); margin-bottom: 12px; }
nav a { color: var(--muted); text-decoration: none; padding: 2px 0; }
nav a[aria-current] { color: var(--fg); font-weight: 600; }
nav a:hover { color: var(--link); }
main { min-width: 0; }
a { color: var(--link); }
h1, h2, h3 { line-height: 1.25; margin: 1.6em 0 0.6em; }
h1 { margin-top: 0; font-size: 2em; }
h2 { padding-bottom: 0.3em; border-bottom: 1px solid var(--line); }
h1 a.anchor, h2 a.anchor, h3 a.anchor, h4 a.anchor { color: inherit; text-decoration: none; }
code { font: 0.875em ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--code); padding: 0.15em 0.35em; border-radius: 6px; }
pre { background: var(--code); padding: 16px; border-radius: 8px; overflow-x: auto; line-height: 1.45; }
pre code { padding: 0; background: none; }
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--line); padding: 6px 12px; text-align: left; vertical-align: top; }
img { max-width: 100%; }
blockquote { margin: 0; padding: 0 16px; border-left: 4px solid var(--line); color: var(--muted); }
blockquote.alert { color: var(--fg); }
blockquote.warning, blockquote.caution { border-color: var(--warn); }
blockquote.alert strong { color: var(--warn); }
.token.comment, .token.prolog, .token.doctype { color: var(--t-comment); font-style: italic; }
.token.keyword, .token.important, .token.atrule .token.rule { color: var(--t-keyword); }
.token.string, .token.attr-value, .token.regex, .token.url { color: var(--t-string); }
.token.function, .token.class-name, .token.selector { color: var(--t-fn); }
.token.tag, .token.builtin { color: var(--t-tag); }
.token.attr-name, .token.property, .token.parameter, .token.variable { color: var(--t-attr); }
.token.number, .token.boolean, .token.constant { color: var(--t-num); }
.token.punctuation, .token.operator { color: var(--muted); }
details { margin: 1em 0; }
summary { cursor: pointer; font-weight: 600; }
@media (max-width: 760px) {
  .layout { grid-template-columns: 1fr; gap: 16px; padding: 16px; }
  nav { position: static; flex-direction: row; flex-wrap: wrap; gap: 4px 16px; }
  nav .brand { width: 100%; margin: 0; }
}
`;

function page(current: (typeof PAGES)[number], body: string) {
	const title = body.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1].replace(/<[^>]+>/g, '') ?? 'gpuix-svelte';
	const nav = PAGES.map((p) => `<a href="${p.out}"${p === current ? ' aria-current="page"' : ''}>${p.nav}</a>`).join('\n');
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title === 'gpuix-svelte' ? title : `${title} — gpuix-svelte`)}</title>
<style>${CSS}</style>
<script src="prism.js" defer></script>
</head>
<body>
<div class="layout">
<nav>
<a class="brand" href="index.html">gpuix-svelte</a>
${nav}
<a href="${REPO}">GitHub</a>
</nav>
<main>
${body}
</main>
</div>
</body>
</html>
`;
}

rmSync(out_dir, { recursive: true, force: true });
mkdirSync(out_dir, { recursive: true });
for (const p of PAGES) writeFileSync(join(out_dir, p.out), page(p, render(p.source)));
copyFileSync(join(root, 'docs/assets/prism.js'), join(out_dir, 'prism.js'));
console.log(`[docs] ${PAGES.length} pages → ${out_dir}`);
