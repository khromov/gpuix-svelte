# Handoff: gpuix-svelte homepage, docs restyle and Pages deploy

Written 2026-10-16 by Claude Code (session `625087b4-4529-4289-ba0d-feb4439029f0`), for the next
agent picking up this work. Read this whole file, then `CLAUDE.md`.

## Where things stand

Everything the author asked for is built and verified. What is left is committing and pushing,
plus the open items at the end of this file.

**Second session (2026-10-16), uncommitted:** five homepage changes the author asked for.
1. "Experimental" is gone from the top bar, both on the homepage and in `scripts/docs.ts`. The
   footer's status block still says it.
2. The install command now sits under the hero paragraph, in one row with the two buttons.
3. The outline labels now say "Native GPUI `div` element", with a second line of real builder
   calls (see "Mechanics").
4. The "41 operations" figcaption under the How-it-works diagram is removed.
5. The sponsor line is now a card with a "Sponsor" button.

`homepage/og.png` and `docs/assets/og-docs.png` were retaken.

| Area | Files | State |
|---|---|---|
| Homepage | `homepage/index.html`, `homepage/og.png`, `homepage/assets/` | Done. Committed in `3a21f74` and `2903b83`; the relative docs links (below) are uncommitted |
| Docs restyle | `scripts/docs.ts`, `docs/assets/fonts/`, `docs/assets/og-docs.png` | Done. The first restyle is committed; the "fit the root site" pass and the new `og-docs.png` are uncommitted |
| Pages deploy | `scripts/docs.ts`, `.github/workflows/docs.yml` | Done locally, uncommitted. Nothing is deployed until it's pushed to `main` |
| Docs about the build | `CLAUDE.md` (the `npm run docs` line), `docs/contributing.md` ("Docs site") | One clause each, uncommitted |

Uncommitted at handoff time (`git status`): `.github/workflows/docs.yml`, `CLAUDE.md`,
`docs/assets/og-docs.png`, `docs/contributing.md`, `homepage/index.html`, `scripts/docs.ts`,
plus this file. Never commit unless the author asks; they commit themselves (`chore: …`).

Checks at handoff:
- `npm run lint`: clean.
- `npm run typecheck`: 0 errors, 0 warnings.
- `npm run docs`: builds.
- Relative links: all 264 relative links and `#anchors` across `dist/docs/*.html` resolve.
- Rendering: the site renders with no console errors, broken images or horizontal overflow at
  320, 390, 1024, 1440 and 1920 px. The same holds under a `/gpuix-svelte/` subpath, the way
  GitHub Pages serves it.

## The author, and how to work with them

- Stanislav Khromov (`khromov` on GitHub). Personal site https://stanislav.garden, sponsor page
  https://github.com/sponsors/khromov (from `.github/FUNDING.yml`).
- **Voice.** No fluff, no buzzwords, no AI smell; write like a human.
  - **No em dashes.** They removed nearly all of them from README.md and docs by hand, and most
    "rather than" constructions too.
  - Write sentence-case headings, short declarative sentences and concrete facts and numbers.
  - Contractions are fine.
  - Never use "seamless", "powerful", "blazing", "unlock", "the power of" and the like.
  - Admit limits plainly (experimental, an unmerged Svelte PR, a CSS subset).
- **Look.**
  - Dark, Vercel-inspired, suave.
  - Pure black, hairlines, Geist and Geist Mono, one accent (`#ff3e00`, Svelte orange) used
    sparingly.
- **Working style.**
  - They work in the same checkout at the same time (README, docs/*.md, src/, examples/), so
    don't touch files outside your task.
  - They answer in short messages and get impatient with process. When they ask how to do
    something, give the exact command first.
  - Follow `CLAUDE.md`: Edit/Write for file changes, no CSS comments, one-sentence "why"
    comments only.
- **Questions never answered.** Don't act on these without asking:
  1. The examples' window titles contain em dashes (`GPUIX + Svelte — Hacker News` in
     `examples/*/main.ts`). Should they change? The homepage avoids showing them, so the
     mini frames have no titles.
  2. Should README.md and docs/*.md get the same copy pass as the homepage? So far only the docs
     *template* was restyled, never their text.

## Conversation history (condensed, with the author's words)

1. **Goal (verbatim):** "We're creating a project homepage for gpuix-svelte. The styling is dark
   background, stylish, Vercel-inspired, suave. Use Mobbin MCP. Generate five concepts (static
   HTML). Concepts should include visualizations, screenshots and similar to showcase what
   gpuix-svelte offers. No fluff or buzzwords, no extraneous wording, be VERY purposeful and
   careful with every word you put down, we don't want to have an AI smell to the page. Write like
   a human. Ask me for any clarifications if necessary. At the end we will choose to refine one of
   the five concepts."
2. **Added mid-way:**
   - "We should also create og: and twitter tags for this page including an OG image. The OG
     image can be a screenshot of the site itself."
   - "can we also refine the docs pages a little bit in the same style?" This was read as the
     docs *template* (scripts/docs.ts), not the markdown.
3. **Five concepts** were built, reviewed adversarially and audited:
   1. Source and window.
   2. The desktop.
   3. Field notes.
   4. Five commands.
   5. Under the hood.

   Mobbin was used for references throughout.
4. **The author picked 1** and asked for a list of changes: the headline "Build native desktop
   apps with Svelte", the three OSes in the sub-text, an OS-chrome switcher on the starter
   window, a how-it-works line with the custom-renderer PR link, a DOM-vs-gpuix diagram, three
   compact columns, three file-manager windows for shipping, an examples screenshot grid,
   status shrunk to the very end, a footer link to stanislav.garden, a GitHub corner, a sponsor
   line, a showcase with "Your app here", and deleting the other four. Also: "Icon can be black
   square with gpuix-svelte in the middle."
5. **Then:**
   - update the OG image (it was already current; re-verified byte-identical);
   - this handoff;
   - "modify some workflow … so the new site lands on the root of the github pages and so we
     still have the docs pages available";
   - "adapt the styling of the docs to fit with the new root site … quickly (no workflows)".
   All done.

## Site layout (what `npm run docs` builds into `dist/docs`, deployed as-is)

| URL (under https://khromov.github.io/gpuix-svelte/) | Source |
|---|---|
| `/` (`index.html`), `og.png`, `assets/…` | `homepage/` copied verbatim |
| `overview.html`, `overview.md` | `README.md` (was `index.html`/`index.md` before this change) |
| `styling.html`, `components.html`, `guide.html`, `testing.html`, `shipping.html`, `contributing.html` (+ `.md`) | `docs/*.md`, URLs unchanged |
| `llms.txt`, `llms-full.txt` | generated; they now point at `overview.md` |
| `fonts/`, `prism.js`, `og-docs.png` | `docs/assets/` |

- `scripts/docs.ts` copies each top-level entry of `homepage/` into `dist/docs`, skipping
  dotfiles. If a name collides with the docs output, the build throws. Node 26's
  `cpSync(..., { errorOnExist })` rejects an existing destination folder, hence the per-entry
  loop.
- `.github/workflows/docs.yml` deploys `dist/docs` on pushes to `main` that touch `README.md`,
  `docs/**`, `homepage/**`, `scripts/docs.ts` or the workflow itself.
- The old `/index.md` URL is gone, since it's now `/overview.md`. Old deep links to
  `/#readme-anchor` land on the homepage.
- **Local preview:** run `npm run docs && python3 -m http.server 4321 -d dist/docs` from the
  repo root, then open http://localhost:4321/ and http://localhost:4321/overview.html.
  Serving `homepage/` alone works for the homepage but has no docs pages. Opening the HTML file
  directly breaks the fonts, because Chrome blocks `@font-face` over `file://`.

## The homepage (`homepage/index.html`)

One static file: inline CSS, one inline script, no external requests, self-hosted Geist (OFL,
`assets/fonts/OFL.txt`).

**Sections, top to bottom:**
1. GitHub corner and nav: wordmark, `v0.2.0`, Docs (→ `overview.html`), Examples.
2. Hero:
   - `<h1>Build native desktop apps with Svelte</h1>` and a sub-text naming macOS, Windows and
     Linux;
   - under it, one row (`.act`, flex-wrap): the install command with Copy, "Read the docs" and
     "View on GitHub";
     - at 1280 px and wider, `.stage{margin-top:-39px}` (-37 in the short-viewport block) centres
       the OS switch on this row;
     - that wins back the height the row added, so the starter window still fits on laptop
       screens. Below 1280 the switch would hit the buttons;
     - at 729 px and narrower, the install box and the two buttons each take a full row;
   - the code card (`starter/App.svelte` lines 1–14) overlapping the starter window, with the
     OS switcher;
   - the how-it-works line, linking https://github.com/sveltejs/svelte/pull/18511.
3. Quick start.
4. How it works: the diagram, with the gpuix path orange and the web DOM path grey and dashed. No
   caption.
5. Three columns: Hot reload, Styling and Testing.
6. Shipping: Finder, File Explorer and GNOME Files windows showing `app` with the black
   `gpuix-svelte` icon. `app` because the starter's `npm run build` writes `dist/app`
   (`dist/app.exe` on Windows).
7. Examples: an 8-card grid of framed screenshots linking to `examples/<name>` on GitHub, with
   the flavor text "Eight examples to get you started on your first native app with Svelte."
8. Coming from Svelte on the web.
9. Showcase: the "Your app here" button links to a pre-filled issue:
   `https://github.com/khromov/gpuix-svelte/issues/new?title=Showcase%3A%20&body=…`.
10. Sponsor card (`.sponsor`): the sponsor sentence, set larger, and a white "Sponsor" button with
    an orange heart.
11. A tiny Status and requirements block, then the footer.

**Mechanics to know before editing:**
- **Class prefixes:**
  - `osw-` is the OS window. The switch is radio inputs `name="osw-os"`, values
    `mac`/`win`/`linux`, driven by CSS `:has()`, so it works without JS. JS only preselects the
    visitor's OS.
  - `shp-` is the file-manager windows.
  - `hiw-` is the diagram.
  - The hero's code-to-window outline uses `.stage[data-active]`, `.ln[data-t]` and the
    `.box .b-*` spans inside `.osw-body`. Their percentage coordinates were measured from
    `assets/shots/hot-before.png`.
  - Each box's `.tag` reads "Native GPUI `div` element", with a `.tag-c` line of builder calls.
    These were checked against the `@gpuix/native` 0.10.0 source and a headless mount:
    - Every starter element, text nodes included, is `gpui::div().id(n)`
      (`build_host_container`).
    - A click is `.on_mouse_up(Left, ..)`, not `.on_click()`.
    - `.hover(..)` comes from the `:hover` class rules.
    - Re-check all of this after a native bump.
  - Placement is driven by a container query on `.osw-body`:
    - At 580 px and wider: `.r` puts the label to the right, `.ue` above and right-aligned
      (minus), `.b` below (hint), and `.in` inside (app).
    - Narrower: labels are centred above (count) or below the box.
    - On desktop the code card covers the window's left 56 to 80 px, so a label must never go
      there.
    - Re-measure after any change: `measure.js`, an `--eval` script for `shoot.mjs`, reports
      each label's clipping and overlaps per target.
- **OG image:** `og.png` is a 1200×630 screenshot of `index.html#og`. The `#og` fragment
  (`:root:has(#og:target)`) hides the nav links, GitHub corner, Copy buttons, hint, buttons and OS
  switch for a cleaner card, which keeps the whole starter window in frame. Regenerate it after changing the hero:
  `node shoot.mjs --root homepage --path '/#og' --out homepage/og.png --og` (Appendix A).
  Keep `og:image:alt` and `twitter:image:alt` in step.
- **Absolute URLs** stay only where they must: canonical, `og:url`, `og:image`,
  `twitter:image` (all `https://khromov.github.io/gpuix-svelte/…`). Links to docs pages are
  relative (`overview.html`, `styling.html#…`), so they work both deployed and in a local
  `dist/docs` preview.
- **Shared chrome:** the docs template duplicates the homepage's top bar (wordmark, version,
  Docs and Examples links, GitHub corner) and its footer, in `scripts/docs.ts`'s
  `CSS`, `CORNER` and `page()`. Keep them in sync by hand.

**Screenshots (`homepage/assets/shots/`, all real):**
- **Taken with `gpuix-svelte/automation`** (`launch()` → clicks → `app.screenshot()`, script in
  Appendix C), all at 2x:
  - `counter.png`: three clicks on +, "3 clicks — the {#if} branch is live".
  - `tictactoe.png`: X wins.
  - `hn.png`: live top stories from 2026-10-15.
  - `styling.png`, `desktop.png`.
  - `tutorial-3.png`: retaken 2026-10-16 after the author edited the tutorial text.
  - `hot-before.png`: the starter after two clicks, with + hovered so it shows its `:hover` teal.
- `glass.png` is a crop of the README's real macOS screenshot (`.github/resources/demos.png`),
  because macOS composites the blur, so GPUI's own capture comes out grey.
- `web-tictactoe.png` is the WebAssembly build in headless Chrome, at 1x. At 2x GPUI's wasm
  build double-applies the emulated device pixel ratio.

**Measured facts used on the page** (2026-10-15, MacBook Pro M5 Pro, macOS 27; don't invent others):
- No longer on the page, kept for reference: mounting the starter app ships **one `applyBatch` of
  41 operations** (12 `createElement`,
  11 `appendChild`, 8 `setStyle`, 4 `setText`, 3 `setCustomProp`, 2 `setEventListener`,
  1 `setRoot`). One click on + ships **one operation**: `["setText",5,"1"]`.
- Scrolling the Hacker News example in a 760×820 window, two runs of 370 frames: GPUI draw
  time **5.2–5.4 ms p90, 5.6–5.9 ms p99**, 6.6 ms max. A 120 Hz frame is 8.3 ms.
- `npm run build` of the starter: one executable, **90.3 MB** on macOS arm64 (94,722,290
  bytes, Bun and the GPUI addon inside), about 40 MB gzipped. The wasm is a 19.9 MB download.
- Real CLI output used on the page: the scaffolder's "Created my-app. Next: …" block, the
  `[gpuix-svelte] created native window` / `mount complete` / `remount complete` log lines,
  and `ok   the buttons reached the counter` / `starter ok` from `npm test`.

## The docs template (`scripts/docs.ts`)

- Dark only, matching the homepage: `#000`, Geist, links in `#ededed` with an orange
  (`--accent: #ff3e00`) hover underline, and an orange current-page marker in the sidebar.
- The content column, top bar and footer mirror the homepage. The wrap is 1200 px plus gutters,
  so the wordmark doesn't jump between pages.
- It has Copy buttons on code blocks, previous/next and "Edit this page on GitHub" links, and an
  inline SVG favicon.
- Every page carries full OG and Twitter tags pointing at `og-docs.png`.
- The README page is `overview`. Its description gets a "what the package is" prefix.
- `docs/assets/og-docs.png` is a screenshot of `dist/docs/overview.html`. Retake it when the
  top of the README or the docs chrome changes:
  `npm run docs && node shoot.mjs --root dist/docs --path overview.html --out docs/assets/og-docs.png --og && npm run docs`.

## Open items and ideas

1. **Push to deploy:** the author commits and pushes. After the first deploy, check
   https://khromov.github.io/gpuix-svelte/ and `/overview.html`. GitHub Pages "Source" must be
   "GitHub Actions" (it already is for the docs).
2. **Inconsistent binary sizes** in the repo: `docs/shipping.md:84` says "around 80 MB" and
   `starter/AGENTS.md` says "about 95 MB". Measured is 90.3 MB on macOS (Apple Silicon). Tell
   the author; don't edit their docs unasked.
3. **The two unanswered questions** above (window-title em dashes, docs copy pass).
4. **Page weight:** `homepage/` is about 2.9 MB, mostly 2x PNG screenshots. Converting to AVIF
   or WebP with `<picture>` would cut that a lot. Not requested.
5. **Live headlines:** `hn.png` shows Hacker News headlines from 2026-10-15. Retake it if they
   ever look odd on the page (`shots.ts hn`, Appendix C).

## Tools

These lived in the session scratchpad
(`/private/tmp/claude-501/-Users-k-Documents-GitHub-gpuix-svelte/625087b4-4529-4289-ba0d-feb4439029f0/scratchpad/`,
which may be gone). Their full sources are in the appendices: copy one to `$TMPDIR` and run it
with `node`.

- **Sandbox:** Chrome, windows and `sips` crash or fail inside Claude Code's Bash sandbox, so run
  those commands with the sandbox disabled.
- **No `timeout`:** macOS has no `timeout` command, so `shoot.mjs` has its own 120 s watchdog.
- **npm cache:** `~/.npm` has root-owned files, so `npm pack` fails. Use `curl` against the
  registry or `--cache <dir>`.

**Verification checklist** for any page change:
1. **Widths:** `shoot.mjs --tiles` at 1440×900, 390×844 `--dpr 2`, 1920×1080, 1024×768 and
   320×640 `--dpr 2`. Read the PNGs.
2. **States:** `--click 'input[value=win]'` and `--click 'input[value=linux]'` for the
   switcher, then `--nojs` and `--reduced-motion`.
3. **Report:** the JSON must show `errors: []`, `horizontalOverflow: false` and
   `brokenImages: []`.
4. **Copy:** `node copylint.mjs homepage/index.html --text`. Expect zero em dashes in written
   copy; quoted screenshot text and code are fine. The "triplet" flags on "macOS, Windows and
   Linux" are intended.
5. **Repo checks:** `npm run docs`, `npm run lint`, `npm run typecheck`.

## Appendix A: `shoot.mjs` (headless Chrome over CDP)

Usage examples:

```bash
node shoot.mjs --root homepage --path / --out /tmp/home.png --tiles --w 1440 --h 900
node shoot.mjs --root homepage --path '/#og' --out homepage/og.png --og
node shoot.mjs --root dist/docs --path overview.html --out /tmp/docs.png --w 390 --h 844 --dpr 2
```

```js
// Screenshot a page with headless Chrome over CDP.
//
//   node shoot.mjs --root <dir> --path <page.html> --out <file.png> [options]
//   node shoot.mjs --url <url> --out <file.png> [options]
//
// --root serves <dir> over a throwaway HTTP server (same as GitHub Pages would), so relative
// asset paths and fonts behave like production. Options:
//   --w 1440 --h 900   viewport in CSS px          --dpr 1     device pixel ratio
//   --full             whole page in one PNG       --tiles     whole page as viewport-tall PNGs (out-01.png, ...)
//   --og               1200x630 viewport at dpr 2, downscaled to 1200x630 (an og:image)
//   --wait 700         ms to wait after load       --scroll-y N   scroll before a viewport shot
//   --isolate          COOP/COEP headers (only for the wasm web build)
//   --scheme dark      prefers-color-scheme to emulate (dark | light)
//   --click <selector> click the first match after load (repeatable, in order) before capture
//   --nojs             disable JavaScript    --reduced-motion   emulate prefers-reduced-motion: reduce
// Prints a JSON report: title, page size, horizontal overflow, console errors, files written.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values: o } = parseArgs({
	options: {
		root: { type: 'string' },
		path: { type: 'string', default: '' },
		url: { type: 'string' },
		out: { type: 'string' },
		w: { type: 'string', default: '1440' },
		h: { type: 'string', default: '900' },
		dpr: { type: 'string', default: '1' },
		full: { type: 'boolean', default: false },
		tiles: { type: 'boolean', default: false },
		og: { type: 'boolean', default: false },
		wait: { type: 'string', default: '700' },
		'scroll-y': { type: 'string', default: '0' },
		maxh: { type: 'string', default: '24000' },
		isolate: { type: 'boolean', default: false },
		scheme: { type: 'string', default: 'dark' },
		click: { type: 'string', multiple: true, default: [] },
		nojs: { type: 'boolean', default: false },
		'reduced-motion': { type: 'boolean', default: false }
	}
});
if (!o.out || (!o.root && !o.url)) {
	console.error('usage: node shoot.mjs (--root <dir> --path <page> | --url <url>) --out <file.png> [--full|--tiles|--og]');
	process.exit(2);
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = {
	'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
	'.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
	'.avif': 'image/avif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm',
	'.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm'
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (o.og) Object.assign(o, { w: '1200', h: '630', dpr: '2' });
const W = Number(o.w), H = Number(o.h), DPR = Number(o.dpr);

let server;
let url = o.url;
if (o.root) {
	const root = resolve(o.root);
	server = createServer((req, res) => {
		let p = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
		if (!p.startsWith(root)) return res.writeHead(403).end();
		if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
		if (!existsSync(p)) return res.writeHead(404).end('not found');
		const headers = { 'Content-Type': MIME[extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' };
		if (o.isolate) Object.assign(headers, { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
		res.writeHead(200, headers).end(readFileSync(p));
	});
	await new Promise((r) => server.listen(0, '127.0.0.1', r));
	url = `http://127.0.0.1:${server.address().port}/${o.path.replace(/^\//, '')}`;
}

const profile = mkdtempSync(join(tmpdir(), 'shoot-'));
const chrome = spawn(CHROME, [
	'--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
	'--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--enable-unsafe-swiftshader',
	'--enable-unsafe-webgpu', 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });

const report = { url, files: [], errors: [] };
const cleanup = () => {
	try { chrome.kill('SIGKILL'); } catch {}
	server?.close();
	try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
setTimeout(() => {
	report.errors.push('shoot timed out after 120 s');
	cleanup();
	console.log(JSON.stringify(report, null, 1));
	process.exit(1);
}, 120000).unref();

try {
	const port = await new Promise((res, rej) => {
		let buf = '';
		const t = setTimeout(() => rej(new Error('Chrome did not start')), 20000);
		chrome.stderr.on('data', (d) => {
			buf += d;
			const m = buf.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
			if (m) { clearTimeout(t); res(m[1]); }
		});
		chrome.on('exit', (c) => rej(new Error(`Chrome exited (${c}): ${buf.slice(-400)}`)));
	});
	const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
	const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
	await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

	let seq = 0;
	const pending = new Map();
	const listeners = [];
	ws.onmessage = (ev) => {
		const m = JSON.parse(ev.data);
		if (m.id && pending.has(m.id)) {
			const { res, rej } = pending.get(m.id);
			pending.delete(m.id);
			m.error ? rej(new Error(m.error.message)) : res(m.result);
		} else if (m.method) for (const l of listeners) l(m);
	};
	const send = (method, params = {}) => new Promise((res, rej) => {
		const id = ++seq;
		pending.set(id, { res, rej });
		ws.send(JSON.stringify({ id, method, params }));
	});
	// With scripts disabled a promise never settles, so every page evaluation is skipped or bounded.
	const evaluate = async (expression) => {
		if (o.nojs) return undefined;
		try {
			const call = send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
			const r = await Promise.race([call, sleep(8000).then(() => null)]);
			return r?.result?.value;
		} catch {
			return undefined;
		}
	};

	listeners.push((m) => {
		if (m.method === 'Runtime.exceptionThrown') {
			const d = m.params.exceptionDetails;
			report.errors.push(`exception: ${d.exception?.description ?? d.text}`);
		}
		if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type))
			report.errors.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
		if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
			report.errors.push(`log: ${m.params.entry.text}${m.params.entry.url ? ` (${m.params.entry.url})` : ''}`);
	});
	await send('Page.enable');
	await send('Runtime.enable');
	await send('Log.enable');
	await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: W < 600 });
	await send('Emulation.setEmulatedMedia', {
		features: [
			{ name: 'prefers-color-scheme', value: o.scheme },
			{ name: 'prefers-reduced-motion', value: o['reduced-motion'] ? 'reduce' : 'no-preference' }
		]
	});
	if (o.nojs) await send('Emulation.setScriptExecutionDisabled', { value: true });

	const loaded = new Promise((r) => listeners.push((m) => m.method === 'Page.loadEventFired' && r()));
	await send('Page.navigate', { url });
	await Promise.race([loaded, sleep(20000)]);
	await evaluate('document.fonts.ready.then(() => true)');

	// Walk the page once so lazy images and scroll-triggered reveals have fired before capture.
	await evaluate(`(async () => {
		const h = document.documentElement.scrollHeight;
		for (let y = 0; y < h; y += ${Math.max(200, Math.floor(H * 0.8))}) { scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
		scrollTo(0, ${Number(o['scroll-y'])}); return true; })()`);
	// Script execution may be disabled for the page, so clicks go through CDP input events at the element's centre.
	for (const selector of o.click) {
		const { root } = await send('DOM.getDocument', { depth: 0 });
		const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
		if (!nodeId) { report.errors.push(`click: no element matches ${selector}`); continue; }
		await send('DOM.scrollIntoViewIfNeeded', { nodeId });
		const { model } = await send('DOM.getBoxModel', { nodeId });
		const [x1, y1, , , x3, y3] = model.border;
		const x = (x1 + x3) / 2, y = (y1 + y3) / 2;
		for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
			await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
		await sleep(250);
	}
	if (o.click.length) await evaluate(`scrollTo(0, ${Number(o['scroll-y'])}) || true`);
	await sleep(Number(o.wait));

	let info = await evaluate(`({
		title: document.title,
		scrollHeight: document.documentElement.scrollHeight,
		scrollWidth: document.documentElement.scrollWidth,
		clientWidth: document.documentElement.clientWidth,
		brokenImages: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src')),
		widest: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
			.slice(0, 5).map(e => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : ''))
	})`);
	if (!info) {
		const m = await send('Page.getLayoutMetrics');
		const size = m.cssContentSize ?? m.contentSize;
		info = { title: '(scripts disabled)', scrollHeight: Math.ceil(size.height), scrollWidth: Math.ceil(size.width), clientWidth: W, brokenImages: [], widest: [] };
	}
	Object.assign(report, info, { horizontalOverflow: info.scrollWidth > info.clientWidth });

	const capture = async (file, clip) => {
		const params = { format: 'png', captureBeyondViewport: Boolean(clip) };
		if (clip) params.clip = { ...clip, scale: 1 };
		const { data } = await send('Page.captureScreenshot', params);
		writeFileSync(file, Buffer.from(data, 'base64'));
		report.files.push(file);
	};

	const total = Math.min(info.scrollHeight, Number(o.maxh));
	if (o.full) {
		await evaluate('scrollTo(0, 0) || true');
		await capture(o.out, { x: 0, y: 0, width: W, height: total });
	} else if (o.tiles) {
		await evaluate('scrollTo(0, 0) || true');
		let n = 0;
		for (let y = 0; y < total; y += H) {
			n++;
			await capture(o.out.replace(/\.png$/, `-${String(n).padStart(2, '0')}.png`), { x: 0, y, width: W, height: Math.min(H, total - y) });
		}
	} else {
		await capture(o.out);
	}
	if (o.og) execFileSync('sips', ['-z', '630', '1200', o.out], { stdio: 'ignore' });
	ws.close();
} catch (err) {
	report.errors.push(`shoot failed: ${err.message}`);
	process.exitCode = 1;
} finally {
	cleanup();
}
console.log(JSON.stringify(report, null, 1));
process.exit();
```

## Appendix B: `copylint.mjs` (mechanical voice checks)

Run `node copylint.mjs <page.html> [--text]`. It extracts every visible string, plus the title,
meta, OG and alt text, and flags em dashes, banned words, Title Case headings, questions, long
paragraphs and missing OG tags. Its findings are a floor, not a verdict: judge each one.

```js
// Lints the visible copy of an HTML page against brief/voice.md.
//   node copylint.mjs <page.html> [--text]
// Prints JSON: counts, findings (rule, where, excerpt). --text also dumps the extracted copy.

import { readFileSync } from 'node:fs';

const file = process.argv[2];
const dump = process.argv.includes('--text');
let html = readFileSync(file, 'utf8');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→', larr: '←', times: '×', middot: '·', mdash: '—', ndash: '–', hellip: '…', copy: '©', thinsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = (s) => s
	.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
	.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
	.replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

const meta = [];
const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
meta.push({ where: 'title', text: decode(title.trim()) });
for (const m of html.matchAll(/<meta\s+[^>]*?(?:name|property)="([^"]+)"[^>]*?content="([^"]*)"[^>]*>/gi)) {
	if (/description|title|alt/.test(m[1])) meta.push({ where: `meta ${m[1]}`, text: decode(m[2]) });
}

html = html.replace(/<head>[\s\S]*?<\/head>/i, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');

const attrs = [];
for (const m of html.matchAll(/\s(alt|aria-label|title|placeholder)="([^"]*)"/gi)) if (m[2].trim()) attrs.push({ where: `@${m[1]}`, text: decode(m[2]) });

let codeChars = 0;
html = html.replace(/<pre[\s\S]*?<\/pre>/gi, (m) => { codeChars += m.length; return '\n\n'; });
html = html.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => `⟦${decode(inner.replace(/<[^>]+>/g, ''))}⟧`);

const blocks = [];
html
	.replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, inner) => `\n\n[${tag.toUpperCase()}] ${inner}\n\n`)
	.replace(/<\/?(p|li|dt|dd|figcaption|caption|td|th|blockquote|button|label|summary|nav|footer|header|section|article|aside|div|br|tr|table|ul|ol|dl|figure|main)\b[^>]*>/gi, '\n\n')
	.replace(/<\/?a\b[^>]*>/gi, ' ')
	.replace(/<[^>]+>/g, '')
	.split(/\n\s*\n/)
	.map((b) => decode(b).replace(/\s+/g, ' ').replace(/\s+([.,;:)])/g, '$1').trim())
	.filter(Boolean)
	.forEach((b) => blocks.push(b));

const BANNED = [
	'blazing', 'lightning', 'seamless', 'seamlessly', 'effortless', 'effortlessly', 'powerful', 'robust', 'cutting-edge', 'state-of-the-art',
	'next-gen', 'next-generation', 'revolutionary', 'game-changer', 'game changer', 'supercharge', 'turbocharge', 'unleash', 'unlock', 'elevate',
	'empower', 'leverage', 'harness', 'delve', 'dive in', 'deep dive', 'journey', 'world-class', 'best-in-class', 'first-class', 'out of the box',
	'batteries included', 'zero-config', 'zero config', 'magic', 'magical', 'delightful', 'beautiful', 'beautifully', 'stunning', 'gorgeous', 'sleek',
	'elegant', 'crafted', 'handcrafted', 'reimagined', 'reimagine', 'redefine', 'the future of', 'at scale', 'developer experience', 'DX',
	'ship faster', 'build faster', 'in seconds', 'in minutes', 'simply', 'truly', 'incredibly', 'ultimate', 'perfect', 'finally',
	'say goodbye', 'introducing', 'experience the', 'discover', 'imagine', 'ready to', 'get started for free', 'loved by', 'trusted by',
	'join thousands', 'everything you need', "nothing you don't", 'and more', 'and so much more', 'all-in-one', 'one-stop', 'lightweight',
	'native-like', 'buttery', 'a breeze', 'rather than', 'whether you', "it's not just", 'not just', 'not only', 'meet ', 'super ', 'really ',
	'blazingly', 'fast', 'faster', 'speedy', 'snappy', 'modern'
];
const findings = [];
const add = (rule, where, text) => findings.push({ rule, where, excerpt: text.length > 160 ? text.slice(0, 157) + '…' : text });

const all = [...meta, ...attrs.map((a) => a), ...blocks.map((b) => ({ where: b.startsWith('[H') ? b.slice(1, 3) : 'body', text: b.replace(/^\[H\d\] /, '') }))];
let emDashes = 0;
for (const { where, text } of all) {
	const prose = text.replace(/⟦[^⟧]*⟧/g, ' ');
	const dashes = (prose.match(/—/g) || []).length;
	if (dashes) { emDashes += dashes; add('em dash', where, text); }
	if (/\s–\s/.test(prose)) add('spaced en dash used as a dash', where, text);
	if (/!(\s|$)/.test(prose)) add('exclamation mark', where, text);
	for (const w of BANNED) {
		const re = new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ $/, '\\s')}(?=$|[^\\p{L}])`, 'iu');
		if (re.test(prose)) add(`banned: ${w.trim()}`, where, text);
	}
	if (/\bNo [^.]{1,40}\. No [^.]{1,40}\./.test(prose)) add('"No X. No Y." pattern', where, text);
	if (/^(From|Whether)\b/i.test(prose) && /^H\d|title|meta/.test(where)) add('"From/Whether" opener', where, text);
	if (/\b[\p{L}-]+, [\p{L}-]+,? and [\p{L}-]+\b/u.test(prose) && /^H\d|title|meta/.test(where)) add('triplet in a heading/meta', where, text);
	if (/^H\d/.test(where)) {
		const words = prose.split(/\s+/).filter((w) => /^\p{L}/u.test(w));
		const small = /^(a|an|and|as|at|but|by|for|in|of|on|or|the|to|vs|via|with|from|into)$/i;
		const caps = words.filter((w, i) => i > 0 && !small.test(w) && /^\p{Lu}/u.test(w) && !/^(GPUI|Zed|Svelte|Node|Bun|Metal|DirectX|Vulkan|WebGPU|WebAssembly|macOS|Windows|Linux|Rust|JavaScript|TypeScript|Chrome|Hacker|News|VoiceOver|Apple|Silicon|JSON|CSS|HTML|DOM|API|OS|MIT|npm|GitHub|Liquid|Glass|Catppuccin|Playwright|Retina|Stanislav|Khromov)$/.test(w));
		if (words.length >= 3 && caps.length >= Math.max(2, Math.ceil((words.length - 1) * 0.5))) add('title case heading?', where, text);
		if (/\?$/.test(prose.trim())) add('question as heading', where, text);
	}
	if (where === 'body') {
		const sentences = prose.split(/(?<=[.?!])\s+(?=[A-Z⟦"`(])/).filter((s) => s.trim().length > 1);
		if (sentences.length > 3) add(`paragraph of ${sentences.length} sentences`, where, text);
		for (const s of sentences) if (s.split(/\s+/).length > 32) add(`long sentence (${s.split(/\s+/).length} words)`, where, s);
	}
}
for (const m of meta) {
	if (m.where === 'title' && m.text.length > 60) add(`title is ${m.text.length} chars (>60)`, 'title', m.text);
	if (/description/.test(m.where) && m.text.length > 160) add(`${m.where} is ${m.text.length} chars (>160)`, m.where, m.text);
}
const required = ['og:title', 'og:description', 'og:image', 'og:image:alt', 'og:url', 'og:type', 'og:image:width', 'og:image:height', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt', 'description'];
const raw = readFileSync(file, 'utf8');
for (const r of required) if (!new RegExp(`(name|property)="${r}"`).test(raw)) add('missing meta', 'head', r);

const words = blocks.join(' ').replace(/⟦[^⟧]*⟧/g, ' x ').split(/\s+/).filter(Boolean).length;
console.log(JSON.stringify({ file, visibleWords: words, emDashes, findings }, null, 1));
if (dump) console.log('\n--- extracted copy ---\n' + all.map((a) => `[${a.where}] ${a.text}`).join('\n'));
```

## Appendix C: retaking demo screenshots with `gpuix-svelte/automation`

The driver must run through the package's bin, from a folder whose `node_modules` reaches the
repo. Set it up once (opens real windows, so the Bash sandbox must be off):

```bash
D=$TMPDIR/capture && mkdir -p $D/node_modules/@gpuix && cd $D
R=/Users/k/Documents/GitHub/gpuix-svelte
ln -sfn $R node_modules/gpuix-svelte
ln -sfn $R/node_modules/svelte node_modules/svelte
ln -sfn $R/node_modules/@gpuix/native node_modules/@gpuix/native
echo '{"type":"module"}' > package.json
# save shots.ts below, then: node $R/bin/gpuix-svelte.js shots.ts <out-dir> [name ...]
# e.g. `... shots.ts /tmp/shots hn tutorial-3` retakes just those two (2x PNGs)
```

Then copy the PNG over the one in `homepage/assets/shots/`, keeping the same pixel size or
adjusting the `width`/`height` attributes in the page.
- **Tic-tac-toe** cells have no test IDs. They were clicked at window coordinates
  `{ x: 152 + col * 88, y: 232 + row * 88 }`, with the X-wins sequence being cells
  4, 1, 0, 3, 8.
- **Hot reload** (`hot-before.png`): scaffold with
  `node packages/create-gpuix-svelte/index.js my-app`, symlink its `node_modules` the same way,
  then `launch({ entry: 'app.ts', cwd: <my-app> })` and click `plus` twice.

```ts
import { launch } from 'gpuix-svelte/automation';

const REPO = '/Users/k/Documents/GitHub/gpuix-svelte';
const OUT = process.argv[2];
const only = new Set(process.argv.slice(3));

type App = Awaited<ReturnType<typeof launch>>;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shot(name: string, entry: string, drive: (app: App) => Promise<void>, env: Record<string, string> = {}) {
	if (only.size && !only.has(name)) return;
	const app = await launch({ entry, cwd: REPO, env });
	try {
		await pause(900);
		await drive(app);
		const path = await app.screenshot({ path: `${OUT}/${name}.png` });
		console.error(`[shots] ${name} -> ${path}`);
	} catch (err) {
		console.error(`[shots] ${name} failed:`, err);
	} finally {
		await app.close();
	}
}

await shot('counter', 'examples/counter/main.ts', async (app) => {
	for (let i = 0; i < 3; i++) await app.getByTestId('plus').click();
	await app.getByText('3 clicks').waitFor();
});

await shot('hn', 'examples/hacker-news/main.ts', async (app) => {
	await app.getByText('points').waitFor({ timeoutMs: 20000 }).catch(() => {});
	await pause(2500);
});

await shot('styling', 'examples/styling-playground/main.ts', async () => {
	await pause(600);
});

await shot('desktop', 'examples/desktop-apis/main.ts', async () => {
	await pause(1500);
});

await shot('tutorial-3', 'examples/tutorial/main.ts', async () => {
	await pause(800);
}, { GPUIX_TUTORIAL_STEP: '3' });
```

To re-measure the batch numbers, wrap `TestGpuixRenderer.prototype.applyBatch` (from
`@gpuix/native`) to record its JSON argument, then `mount_headless(App)` and
`click_test_id('plus')` from `gpuix-svelte/test`. For draw times, call
`render(HackerNews, { width: 760, height: 820 })`, wait for the data, then on
`get_native()` call `resetDebugFrameOverlayStats()`, drive it with
`simulateScrollWheel(380, 400, 0, ±40)` every 16 ms, and read
`getDebugFrameOverlayStats()`.

## Appendix D: measuring the outline labels

`shoot.mjs` gained an `--eval '<expression>'` option in the second session. To add it to the
Appendix A source:
- add `eval: { type: 'string' }` to `parseArgs`;
- after the `Object.assign(report, info, …)` line, add
  `if (o.eval) report.evalResult = await evaluate(o.eval);`.

It runs before capture, so it can also switch the active label first:

```bash
--eval "new Promise(r=>{document.querySelector('.stage').dataset.active='minus';setTimeout(()=>r(1),450)})"
```

The script below is `measure.js`. Run it with `--eval "$(cat measure.js)"` at each width. For
every target it prints the label's size and position in `.osw-body` coordinates. It also prints
whether the label is clipped, whether it slides under the code card, and which other targets it
covers.

```js
(() => {
  const stage = document.querySelector('.stage');
  const win = document.querySelector('.osw-win').getBoundingClientRect();
  const body = document.querySelector('.osw-body').getBoundingClientRect();
  const ed = document.querySelector('.stage .editor').getBoundingClientRect();
  const r = (el) => el.getBoundingClientRect();
  const hit = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const out = { W: Math.round(body.width), rows: [] };
  for (const t of ['app', 'card', 'count', 'row', 'minus', 'plus', 'hint']) {
    stage.dataset.active = t;
    const tag = r(document.querySelector(`.box[data-t=${t}] .tag`));
    const covers = ['count', 'minus', 'plus', 'hint'].filter((o) => o !== t && !(t === 'row' && (o === 'minus' || o === 'plus')) && hit(tag, r(document.querySelector(`.box[data-t=${o}]`))) > 0);
    out.rows.push(`${t}: ${Math.round(tag.width)}x${Math.round(tag.height)} @${Math.round(tag.left - body.left)},${Math.round(tag.top - body.top)} clip=${tag.left < win.left || tag.right > win.right || tag.top < win.top + (body.top - win.top) || tag.bottom > win.bottom} underEditor=${hit(tag, ed) > 0} covers=[${covers}]`);
  }
  stage.dataset.active = 'count';
  return out;
})()
```
