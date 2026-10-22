// Renders README.md and docs/*.md to static HTML in dist/docs, for GitHub Pages; code blocks are
// coloured in the browser by docs/assets/prism.js, a vendored Prism build. Beside each page goes a
// standalone markdown copy, indexed by llms.txt (https://llmstxt.org) for coding agents. The
// homepage (homepage/) is copied to the root, so the README renders as overview.html. --serve then
// serves dist/docs on PORT (default 4321) and opens it in the browser.

import { spawn } from 'node:child_process';
import { copyFileSync, cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename, extname, join, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked, type Tokens } from 'marked';

const REPO = 'https://github.com/khromov/gpuix-svelte';
const SITE = 'https://khromov.github.io/gpuix-svelte/';
const NPM = 'https://www.npmjs.com/package/gpuix-svelte';

const PAGES = [
	{ source: 'README.md', name: 'overview', nav: 'Overview', about: 'what the package is, setup, how it differs from Svelte on the web, TypeScript config' },
	{ source: 'docs/styling.md', name: 'styling', nav: 'Styling', about: 'every CSS property and value GPUI accepts, what is dropped, theming with var() and set_css_vars' },
	{ source: 'docs/components.md', name: 'components', nav: 'Components', about: 'Scroller (scrollbars, virtual lists), Portal (modals, menus, toasts), Tooltip, Popover and the native <anchored> they build on' },
	{ source: 'docs/guide.md', name: 'guide', nav: 'Guide', about: 'forms and inputs, keyboard shortcuts and focus, window and desktop helpers, state that survives hot reload' },
	{ source: 'docs/testing.md', name: 'testing', nav: 'Testing', about: 'headless tests through gpuix-svelte/test: mount, click, type, read back, screenshot; gpuix-svelte/automation drives a running window' },
	{ source: 'docs/shipping.md', name: 'shipping', nav: 'Shipping', about: 'standalone binaries with Bun, macOS signing, running in a browser on WebGPU' },
	{ source: 'docs/contributing.md', name: 'contributing', nav: 'Contributing', about: 'working on the gpuix-svelte repository itself', optional: true }
];
type Page = (typeof PAGES)[number];

const root = fileURLToPath(new URL('..', import.meta.url));
const out_dir = join(root, 'dist/docs');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// GitHub's anchor rule, so `file.md#heading` links written for github.com land here too.
const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.replace(/[^\p{L}\p{N}\s_-]/gu, '')
		.trim()
		.replace(/\s/g, '-');

// Links between published pages stay on the site (as absolute .md URLs in the markdown copies,
// which are read on their own); everything else in the repo goes to GitHub.
function rewrite(href: string, from: string, as: 'html' | 'md') {
	if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return href;
	const [path, hash = ''] = href.split('#');
	const anchor = hash ? `#${hash}` : '';
	const target = posix.normalize(posix.join(posix.dirname(from), path)).replace(/\/$/, '');
	const page = PAGES.find((p) => p.source === target);
	if (page) return as === 'html' ? `${page.name}.html${anchor}` : `${SITE}${page.name}.md${anchor}`;
	return `${REPO}/blob/main/${target}${anchor}`;
}

// Fenced code is left alone, since a `](` inside an example is not a link.
const markdown = (source: string) =>
	readFileSync(join(root, source), 'utf8')
		.split(/(^```[\s\S]*?^```)/m)
		.map((part, i) => (i % 2 ? part : part.replace(/\]\(([^)\s]+)\)/g, (_, href: string) => `](${rewrite(href, source, 'md')})`)))
		.join('');

function llms_txt() {
	const entry = (p: (typeof PAGES)[number]) => `- [${p.nav}](${SITE}${p.name}.md): ${p.about}`;
	return `# gpuix-svelte

> A Svelte custom renderer for GPUI, the GPU-accelerated UI framework behind the Zed editor: Svelte 5
> components rendered straight into a native desktop window on Node.js >= 24 or Bun >= 1.4.

Elements are GPUI's (\`div\`, \`text\`, \`img\`, \`input\`, \`textarea\`, \`virtual-list\`, ...), styling is CSS
text for a flexbox layout in logical pixels, events go to the element under the pointer (\`hitbox="self"\`
hands a clickable element the clicks on its children), and inputs report their value in event
payloads. Read the Styling page before writing CSS. The package bundles its own Svelte build, so
a project depends on \`gpuix-svelte\` alone and runs its entry through the \`gpuix-svelte\` bin.

## Docs

${PAGES.filter((p) => !p.optional).map(entry).join('\n')}

## Optional

${PAGES.filter((p) => p.optional).map(entry).join('\n')}
- [Everything in one file](${SITE}llms-full.txt): all of the pages above, concatenated
`;
}

function render(source: string) {
	const marked = new Marked({
		gfm: true,
		walkTokens(token) {
			if (token.type === 'link' || token.type === 'image') token.href = rewrite(token.href, source, 'html');
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
	return (
		html
			.replace(
				/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/g,
				(_, kind: string) => `<blockquote class="alert ${kind.toLowerCase()}"><p class="alert-title">${kind[0]}${kind.slice(1).toLowerCase()}</p><p>`
			)
			// A table written with an empty header row (`| | |`) is a list of pairs, and an empty row would only draw a blank band.
			.replace(/<thead>\s*<tr>\s*(?:<th[^>]*><\/th>\s*)+<\/tr>\s*<\/thead>\s*/g, '')
			.replace(/<table>/g, '<div class="table"><table>')
			.replace(/<\/table>/g, '</table></div>')
			.replace(/<pre>/g, '<div class="code"><pre>')
			.replace(/<\/pre>/g, '</pre></div>')
			// Short one-token code like `border-width` would otherwise split at its hyphen into two chips.
			.replace(/<code>([^<\s]{1,32})<\/code>/g, '<code class="nowrap">$1</code>')
	);
}

const CSS = `
@font-face { font-family: "Geist"; src: url("fonts/Geist-Variable.woff2") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap; }
@font-face { font-family: "Geist Mono"; src: url("fonts/GeistMono-Variable.woff2") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap; }
:root { color-scheme: dark; --sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; --mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; --bg: #000; --surface: #0a0a0a; --chip: #1a1a1a; --line: #242424; --line-strong: #404040; --fg: #ededed; --text: #d4d4d4; --muted: #a1a1a1; --faint: #8f8f8f; --link: #ededed; --accent: #ff3e00; --gut: 32px; --corner: 80px; --note: #52a8ff; --tip: #4cc38a; --important: #a78bfa; --warning: #f5a524; --caution: #ff6166; --t-comment: #8f8f8f; --t-punct: #a1a1a1; --t-keyword: #e9a5c7; --t-string: #abd09f; --t-fn: #c1b1f1; --t-tag: #97cdd8; --t-attr: #e1c398; --t-num: #94bff0; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-padding-top: 80px; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.7 var(--sans); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
::selection { background: color-mix(in srgb, var(--accent) 35%, transparent); }
a { color: var(--link); }
:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; border-radius: 4px; }
.skip { position: absolute; left: 16px; top: -64px; z-index: 10; padding: 8px 12px; border-radius: 6px; background: var(--fg); color: var(--bg); font-size: 14px; text-decoration: none; }
.skip:focus { top: 12px; }
.wrap { max-width: calc(1200px + var(--gut) * 2); margin: 0 auto; padding: 0 var(--gut); }
.top { position: sticky; top: 0; z-index: 5; background: var(--bg); border-bottom: 1px solid var(--line); }
.top-inner { height: 56px; display: flex; align-items: center; gap: 12px; }
.wordmark { color: var(--fg); font-size: 15px; font-weight: 600; letter-spacing: -0.02em; text-decoration: none; }
.version { color: var(--muted); font: 12px/20px var(--mono); padding: 0 8px; border: 1px solid var(--line); border-radius: 999px; text-decoration: none; }
.version:hover { color: var(--fg); border-color: var(--line-strong); }
.links { margin-left: auto; margin-right: max(0px, var(--corner) + 8px - var(--gut) - max(0px, (100vw - 1200px - var(--gut) * 2) / 2)); display: flex; gap: 24px; }
.links a { color: var(--muted); font-size: 14px; text-decoration: none; }
.links a:hover, .links a[aria-current] { color: var(--fg); }
.github-corner { position: absolute; top: 0; right: 0; z-index: 20; display: block; width: var(--corner); height: var(--corner); pointer-events: none; }
.github-corner svg { display: block; width: 100%; height: 100%; fill: #1c1c1c; color: #ededed; pointer-events: none; transition: fill 0.15s ease; }
.github-corner path { pointer-events: auto; }
.github-corner:hover svg { fill: #262626; }
.github-corner:focus-visible { outline: none; }
.github-corner:focus-visible svg { fill: #ededed; color: #000; }
.octo-arm { transform-origin: 130px 106px; }
@media (hover: hover) and (min-width: 500px) and (prefers-reduced-motion: no-preference) { .github-corner:hover .octo-arm { animation: octocat-wave 560ms ease-in-out; } }
@keyframes octocat-wave { 0%, 100% { transform: rotate(0); } 20%, 60% { transform: rotate(-25deg); } 40%, 80% { transform: rotate(10deg); } }
.foot { border-top: 1px solid var(--line); padding: 36px 0 52px; }
.foot-inner { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 16px 32px; }
.foot p { margin: 0; color: var(--muted); font-size: 14px; }
.foot p b { color: var(--fg); font-weight: 600; letter-spacing: -0.02em; }
.foot a { color: var(--muted); text-decoration: none; }
.foot p a { text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px; }
.foot a:hover { color: var(--fg); }
.foot ul { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 0; padding: 0; list-style: none; font-size: 14px; }
.foot .fine { flex-basis: 100%; color: var(--faint); font-size: 13px; }
.layout { display: grid; grid-template-columns: 220px minmax(0, 760px); gap: 96px; justify-content: start; }
.sidebar { position: sticky; top: 56px; align-self: start; padding: 48px 0; }
.sidebar ul { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--line); }
.sidebar a { display: block; margin-left: -1px; padding: 5px 0 5px 16px; border-left: 1px solid transparent; color: var(--muted); font-size: 14px; line-height: 1.5; text-decoration: none; }
.sidebar a:hover { color: var(--fg); }
.sidebar a[aria-current] { color: var(--fg); font-weight: 500; border-left-color: var(--accent); }
main { min-width: 0; padding: 48px 0 96px; }
.prose { overflow-wrap: break-word; }
.prose > :first-child { margin-top: 0; }
.prose :is(p, ul, ol, blockquote, .code, .table) { margin: 0 0 20px; }
.prose p { text-wrap: pretty; }
.prose :is(h1, h2, h3, h4) { position: relative; color: var(--fg); font-weight: 600; text-wrap: balance; }
.prose h1 { font-size: 40px; line-height: 1.1; letter-spacing: -0.045em; margin: 0 0 16px; }
.prose h2 { font-size: 24px; line-height: 1.3; letter-spacing: -0.03em; margin: 56px 0 12px; }
.prose h3 { font-size: 18px; line-height: 1.4; letter-spacing: -0.02em; margin: 36px 0 8px; }
.prose h4 { font-size: 16px; line-height: 1.5; letter-spacing: -0.01em; margin: 28px 0 8px; }
.prose h1 + p { font-size: 18px; line-height: 1.6; color: var(--fg); margin-bottom: 28px; }
.prose a.anchor { color: inherit; text-decoration: none; }
.prose :is(h2, h3, h4) a.anchor::before { content: "#"; position: absolute; left: -0.9em; color: var(--faint); font-weight: 400; opacity: 0; transition: opacity 0.15s; }
.prose :is(h2, h3, h4):hover a.anchor::before, .prose a.anchor:focus-visible::before { opacity: 1; }
.prose a:not(.anchor) { text-decoration-line: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: color-mix(in srgb, var(--link) 40%, transparent); }
.prose a:not(.anchor):hover { text-decoration-color: var(--accent); }
.prose strong { color: var(--fg); font-weight: 600; }
.prose :is(ul, ol) { padding-left: 1.4em; }
.prose li { margin: 6px 0; padding-left: 2px; }
.prose li::marker { color: var(--faint); }
.prose li > :is(ul, ol) { margin: 6px 0 0; }
.prose img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 12px; }
.prose hr { border: 0; border-top: 1px solid var(--line); margin: 40px 0; }
code { font-family: var(--mono); font-size: 0.875em; font-variant-ligatures: none; }
.prose :not(pre) > code { padding: 0.15em 0.35em; border-radius: 5px; background: var(--chip); color: var(--fg); -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.prose code.nowrap { white-space: nowrap; }
.prose a > code { color: inherit; }
.prose :is(h1, h2, h3, h4) code { padding: 0; border: 0; background: none; font-size: 0.9em; }
.code { position: relative; }
.code pre { margin: 0; padding: 16px 20px; overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; color: var(--fg); font: 13.5px/1.65 var(--mono); tab-size: 2; }
.code pre code { font-size: inherit; }
.copy { position: absolute; top: 9px; right: 9px; padding: 5px 9px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--muted); font: 500 12px/1.2 var(--sans); cursor: pointer; }
.copy:hover { color: var(--fg); border-color: var(--line-strong); }
@media (hover: hover) { .copy { opacity: 0; transition: opacity 0.15s; } .code:hover .copy, .copy:focus-visible { opacity: 1; } }
@media (hover: none) { .code:has(.copy) pre { padding-top: 44px; } }
.token.comment, .token.prolog, .token.doctype, .token.cdata { color: var(--t-comment); }
.token.punctuation, .token.operator { color: var(--t-punct); }
.token.keyword, .token.atrule, .token.important, .token.rule { color: var(--t-keyword); }
.token.string, .token.char, .token.attr-value, .token.regex, .token.url, .token.template-string { color: var(--t-string); }
.token.function, .token.class-name, .token.selector { color: var(--t-fn); }
.token.tag { color: var(--t-tag); }
.token.attr-name, .token.property, .token.parameter, .token.variable { color: var(--t-attr); }
.token.number, .token.boolean, .token.constant, .token.builtin, .token.symbol { color: var(--t-num); }
.token.attr-value .token.punctuation { color: var(--t-punct); }
.table { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; }
.table table { width: 100%; border-collapse: collapse; font-size: 14.5px; line-height: 1.55; }
.table :is(th, td) { padding: 10px 16px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
.table th { background: var(--surface); color: var(--fg); font-weight: 500; }
.table tr:last-child td { border-bottom: 0; }
.table td:first-child { white-space: nowrap; }
.prose blockquote:not(.alert) { padding-left: 16px; border-left: 2px solid var(--line); color: var(--muted); }
.alert { --accent: var(--note); padding: 14px 18px; border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line)); border-radius: 10px; background: color-mix(in srgb, var(--accent) 6%, var(--bg)); }
.alert.tip { --accent: var(--tip); }
.alert.important { --accent: var(--important); }
.alert.warning { --accent: var(--warning); }
.alert.caution { --accent: var(--caution); }
.alert .alert-title { margin: 0 0 4px; color: var(--accent); font-size: 14px; font-weight: 600; }
.alert > :last-child { margin-bottom: 0; }
.prose details { margin: 0 0 12px; padding: 0 18px; border: 1px solid var(--line); border-radius: 10px; }
.prose summary { position: relative; margin: 0 -18px; padding: 12px 18px 12px 42px; border-radius: 9px; color: var(--fg); font-weight: 500; list-style: none; cursor: pointer; }
.prose summary::-webkit-details-marker { display: none; }
.prose summary::before { content: ""; position: absolute; left: 20px; top: 50%; width: 6px; height: 6px; margin-top: -4px; border: solid var(--muted); border-width: 0 1.5px 1.5px 0; transform: rotate(-45deg); transition: transform 0.15s; }
.prose summary:hover { background: var(--surface); }
.prose details[open] > summary { margin-bottom: 16px; border-bottom: 1px solid var(--line); border-radius: 9px 9px 0 0; }
.prose details[open] > summary::before { transform: rotate(45deg); margin-top: -5px; }
.prose details > :last-child { margin-bottom: 16px; }
.page-end { margin-top: 72px; padding-top: 24px; border-top: 1px solid var(--line); }
.edit { color: var(--muted); font-size: 14px; text-decoration: none; }
.edit:hover { color: var(--fg); }
.pager { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px; }
.pager a { display: block; padding: 14px 18px; border: 1px solid var(--line); border-radius: 10px; color: var(--fg); font-weight: 500; line-height: 1.4; text-decoration: none; transition: border-color 0.15s; }
.pager a:hover { border-color: var(--line-strong); }
.pager span { display: block; margin-bottom: 2px; color: var(--muted); font-size: 13px; font-weight: 400; }
.pager .next { grid-column: 2; text-align: right; }
@media (max-width: 1180px) { .layout { grid-template-columns: 200px minmax(0, 760px); gap: 56px; } }
@media (max-width: 860px) {
  :root { --gut: 16px; --corner: 60px; }
  html { scroll-padding-top: 16px; }
  .top { position: static; }
  .top-inner { height: 52px; }
  .layout { display: block; }
  .sidebar { position: relative; top: auto; margin: 0 -16px; padding: 0; overflow-x: auto; scrollbar-width: none; box-shadow: inset 0 -1px 0 var(--line); -webkit-mask-image: linear-gradient(to right, transparent, #000 16px, #000 calc(100% - 48px), transparent); mask-image: linear-gradient(to right, transparent, #000 16px, #000 calc(100% - 48px), transparent); }
  .sidebar::-webkit-scrollbar { display: none; }
  .sidebar ul { display: flex; gap: 22px; width: max-content; min-width: 100%; padding: 0 48px 0 16px; border: 0; }
  .sidebar a { margin: 0; padding: 12px 0; border: 0; white-space: nowrap; }
  .sidebar a[aria-current] { box-shadow: inset 0 -2px 0 var(--accent); }
  main { padding: 32px 0 64px; }
  .prose h1 { font-size: 32px; }
  .prose h1 + p { font-size: 17px; }
  .prose h2 { font-size: 22px; margin-top: 44px; }
  .prose :is(h2, h3, h4) a.anchor::before { display: none; }
  .code pre { padding: 14px 16px; font-size: 13px; }
  .table table { font-size: 14px; }
  .table :is(th, td) { padding: 9px 12px; }
  .page-end { margin-top: 56px; }
}
@media (max-width: 400px) { .version { display: none; } }
`;

const SCRIPT = `{
if (navigator.clipboard) for (const pre of document.querySelectorAll('.code pre')) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'copy';
	button.textContent = 'Copy';
	button.addEventListener('click', () => navigator.clipboard.writeText(pre.textContent.replace(/\\n$/, '')).then(() => {
		button.textContent = 'Copied';
		setTimeout(() => (button.textContent = 'Copy'), 1500);
	}));
	pre.after(button);
}
const strip = document.querySelector('.sidebar');
const current = strip.querySelector('[aria-current]');
strip.scrollLeft += current.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - current.offsetWidth) / 2;
}`;

const ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#000"/><rect x="6" y="8" width="20" height="16" rx="3" fill="none" stroke="#ededed" stroke-width="2"/><path d="M6 13h20" stroke="#ededed" stroke-width="2"/></svg>')}`;
const CORNER = `<a href="${REPO}" class="github-corner" aria-label="View source on GitHub"><svg width="80" height="80" viewBox="0 0 250 250" aria-hidden="true"><path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z"></path><path d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2" fill="currentColor" class="octo-arm"></path><path d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z" fill="currentColor" class="octo-body"></path></svg></a>`;
const OG_IMAGE = `${SITE}og-docs.png`;
const OG_ALT = 'The Overview page of the gpuix-svelte docs: page list, opening paragraph and a screenshot of the Hacker News, tic-tac-toe and control center demos.';

// The Overview is where the docs start, so its description starts with what the package is.
const description = (p: Page) =>
	`${p.name === 'overview' ? 'A Svelte custom renderer for GPUI, the UI framework behind Zed. ' : ''}${p.about[0].toUpperCase()}${p.about.slice(1)}.`;

function page(current: Page, body: string) {
	const heading = body.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1].replace(/<[^>]+>/g, '') ?? 'gpuix-svelte';
	const title = escape(heading === 'gpuix-svelte' ? heading : `${heading} · gpuix-svelte`);
	const about = escape(description(current));
	const url = `${SITE}${current.name}.html`;
	const i = PAGES.indexOf(current);
	const [prev, next] = [PAGES[i - 1], PAGES[i + 1]];
	const nav = PAGES.map((p) => `<li><a href="${p.name}.html"${p === current ? ' aria-current="page"' : ''}>${p.nav}</a></li>`).join('\n');
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${about}">
<link rel="canonical" href="${url}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#000000">
<link rel="icon" href="${ICON}">
<link rel="preload" href="fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<meta property="og:type" content="website">
<meta property="og:site_name" content="gpuix-svelte">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${about}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${OG_ALT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${about}">
<meta name="twitter:image" content="${OG_IMAGE}">
<meta name="twitter:image:alt" content="${OG_ALT}">
<link rel="alternate" type="text/markdown" href="${current.name}.md">
<style>${CSS}</style>
<script src="prism.js" defer></script>
<script defer src="https://u.khromov.se/u.js" data-website-id="4acad772-f733-4a21-ba45-e25689155f2a"></script>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="top">
<div class="wrap top-inner">
<a class="wordmark" href="index.html">gpuix-svelte</a>
<a class="version" href="${REPO}/blob/main/CHANGELOG.md" title="Changelog">v${version}</a>
<nav class="links" aria-label="Site">
<a href="overview.html" aria-current="true">Docs</a>
<a href="index.html#examples">Examples</a>
</nav>
</div>
</header>
${CORNER}
<div class="wrap layout">
<nav class="sidebar" aria-label="Pages">
<ul>
${nav}
</ul>
</nav>
<main id="content">
<article class="prose">
${body}
</article>
<div class="page-end">
<a class="edit" href="${REPO}/edit/main/${current.source}">Edit this page on GitHub</a>
<nav class="pager" aria-label="Previous and next page">
${prev ? `<a class="prev" href="${prev.name}.html" rel="prev"><span>Previous</span>${prev.nav}</a>` : ''}
${next ? `<a class="next" href="${next.name}.html" rel="next"><span>Next</span>${next.nav}</a>` : ''}
</nav>
</div>
</main>
</div>
<footer class="foot">
<div class="wrap foot-inner">
<p><b>gpuix-svelte</b> · MIT license · <a href="https://stanislav.garden">Stanislav Khromov</a></p>
<ul>
<li><a href="index.html">Home</a></li>
<li><a href="${REPO}">GitHub</a></li>
<li><a href="${NPM}">npm</a></li>
<li><a href="${REPO}/blob/main/CHANGELOG.md">Changelog</a></li>
</ul>
<p class="fine">An independent project, not part of Svelte, Zed or GPUI.</p>
</div>
</footer>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

rmSync(out_dir, { recursive: true, force: true });
mkdirSync(out_dir, { recursive: true });
for (const p of PAGES) {
	writeFileSync(join(out_dir, `${p.name}.html`), page(p, render(p.source)));
	writeFileSync(join(out_dir, `${p.name}.md`), markdown(p.source));
}
writeFileSync(join(out_dir, 'llms.txt'), llms_txt());
writeFileSync(join(out_dir, 'llms-full.txt'), PAGES.map((p) => markdown(p.source).trim()).join('\n\n---\n\n') + '\n');
copyFileSync(join(root, 'docs/assets/prism.js'), join(out_dir, 'prism.js'));
copyFileSync(join(root, 'docs/assets/og-docs.png'), join(out_dir, 'og-docs.png'));
cpSync(join(root, 'docs/assets/fonts'), join(out_dir, 'fonts'), { recursive: true });
// A name the homepage shares with the docs output fails the build instead of silently replacing one of them.
for (const entry of readdirSync(join(root, 'homepage')).filter((e) => !e.startsWith('.'))) {
	if (existsSync(join(out_dir, entry))) throw new Error(`[docs] homepage/${entry} collides with the docs output`);
	cpSync(join(root, 'homepage', entry), join(out_dir, entry), { recursive: true, filter: (src) => !basename(src).startsWith('.') });
}
console.log(`[docs] ${PAGES.length} pages, their markdown and llms.txt, with homepage/ at the root → ${out_dir}`);

if (process.argv.includes('--serve')) serve();

function serve() {
	const types: Record<string, string> = {
		'.html': 'text/html; charset=utf-8',
		'.md': 'text/markdown; charset=utf-8',
		'.txt': 'text/plain; charset=utf-8',
		'.js': 'text/javascript',
		'.css': 'text/css',
		'.png': 'image/png',
		'.svg': 'image/svg+xml',
		'.woff2': 'font/woff2'
	};
	const server = createServer((req, res) => {
		const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
		const file = join(out_dir, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
		if (!file.startsWith(out_dir + sep) || !existsSync(file) || !statSync(file).isFile()) {
			res.writeHead(404).end('Not found');
			return;
		}
		res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
		createReadStream(file).pipe(res);
	});
	server.listen(Number(process.env.PORT || 4321), '127.0.0.1', () => {
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
		console.log(`[docs] ${url}`);
		// `start` is a cmd.exe builtin, and its first quoted argument is the window title.
		const [command, ...args] =
			process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : ['xdg-open', url];
		spawn(command, args, { stdio: 'ignore', detached: true })
			.on('error', () => {})
			.unref();
	});
}
