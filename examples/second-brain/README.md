# Substrate — a second brain on GPUI

A personal knowledge app rendered by Svelte into a native GPUI window. Pour anything in —
text, links, images, voice recordings — and all of it becomes searchable by meaning, by keyword
and by what is in the picture. An OpenAI-compatible model can then answer questions over it,
citing the items it used.

**Bun only.** It leans on `bun:sqlite`, `Bun.spawn` with IPC, `Bun.Image`, `HTMLRewriter` and
`bun:ffi`, none of which have Node twins, so this is the one example without a `node` script.

```bash
npm run brain:install   # once: the ML dependencies (transformers.js + onnxruntime + sharp, ~380 MB)
npm run brain:doctor    # optional: proves the models run under Bun, downloads them (~380 MB)
npm run brain           # opens Substrate; `bun run brain` is the same
npm run brain:compile   # dist/Substrate.app, models and all (macOS)
npm run brain:import-hn # pours today's Hacker News front page in
```

The first launch downloads three models into `examples/second-brain/.data/models` and shows
progress in the status pill; keyword search works while that happens. Without
`brain:install` the app still opens and keyword search still works — the Models panel says what
to run.

## What it does

- **Capture**: a note (Enter saves, Shift+Enter is a newline), a URL (scraped to readable text with
  its title and preview image), images via the macOS file chooser or straight from the clipboard,
  audio via the microphone or an imported WAV or MP3.
- **On-device models**, all through [transformers.js](https://huggingface.co/docs/transformers.js)
  in a child Bun process: `nomic-ai/nomic-embed-text-v1.5` for text embeddings (768-d, 8k-token
  context), `onnx-community/whisper-base` for transcription, `Xenova/clip-vit-base-patch32` so a
  text query finds images by their content.
- **Hybrid search**: semantic (cosine over the chunk embeddings), keyword (SQLite FTS5 with
  `bm25()`) and CLIP image hits, fused with reciprocal rank fusion. Each result shows which
  signals found it — an image the picture itself matched carries a "visual match" badge — with
  the query terms highlighted in a window around the first match. `kind:note`, `kind:link`,
  `kind:image` and `kind:audio` narrow a query or, alone, list a kind; the search box completes
  them as you type (arrows choose, Tab completes, Enter searches). A pasted URL finds its item.
  Every item also gets a "Related" list from its stored vectors.
- **Feeds**: subscribe to an RSS or Atom address (or a blog's homepage — the `<link rel="alternate">`
  it advertises is followed) and its entries are ingested like any link you save. Each feed has its
  own check interval — hourly, every 4 or 12 hours, or daily (croner under the hood) — a
  **full article** switch — off, only what the document
  itself carries is stored and no page is fetched per entry — and optional retention (keep the
  newest *n*, or *n* days; anything you have edited is never pruned). A missed poll is caught up
  shortly after launch. Because a feed brings in far more than you do, feed items are **kept out of
  search, Ask and Related** until *Include feeds* is ticked — the checkbox sits beside the kind
  filters on the search page, and in Settings; a single query overrides it with `feeds:on`. The
  timeline has its own *Include feeds* switch (on by default), so you can read a feed there while
  keeping it out of search. Both choices are remembered. An entry whose URL you had already saved is adopted rather
  than duplicated, and an entry you delete is never fetched again.
- **Ask**: retrieval-augmented chat over the corpus with any OpenAI-compatible endpoint (Ollama,
  LM Studio, OpenAI, OpenRouter). Answers stream in as markdown; `[n]` citations become chips that
  open the item. A vision model, when configured, describes images on import.
- **Right-click anything**: an item, a feed, a sidebar entry, an answer, a citation, or empty space.
  Each offers what applies to it — a failed link gets *Retry* and *Re-read page*, an audio item gets
  *Play*, empty space gets the capture actions — with the arrow keys and Enter working through it and
  a confirmation in front of anything destructive. On macOS ctrl+click opens the same menu on
  anything that was already clickable — GPUI routes it to `click`, not `auxClick`, so only a
  surface with a primary handler can see it.
- **Light and dark**, following the system or fixed, with the palette in `lib/theme.ts`.
- **Settings → Pipeline** shows what is being scraped, transcribed and embedded right now, with
  requeue and retry buttons; **Settings → On-device models** shows each model's state, download
  progress and the worker's memory.

## Where things live

```
examples/second-brain/
  main.ts                Bun guard → create_app() → render_hot(App.svelte, { props: { app } })
  standalone.ts          the compiled entry: static imports, render() instead of render_hot()
  App.svelte             root layout, window-level shortcuts, the palette → set_css_vars, route table
  RouteView.svelte       resolves the route and lazy-loads the page component
  routes/                Everything, Kind, Search, Item, Ask, Feeds, Settings, NotFound; Item renders a
                         page one <markdown> block per virtual row (lib/blocks.ts), since a native
                         markdown element lays out its whole document every frame
  components/            Sidebar, ItemCard, CaptureBox, Field, …; Modal is a <Portal> rendered from
                         whoever needs a dialog, ContextMenu one mounted once by App; scrolling
                         is the package's Scroller
  lib/                   the data layer (plain TS) and the UI state (.svelte.ts runes modules);
                         menus.ts is what each right click offers
  lib/feeds/             the poller (poll.ts, croner) over a source registry; rss.ts reads RSS 2.0,
                         RDF and Atom, and another kind is a module plus an entry in SOURCES
  ml/worker.ts           the child process that owns the models; ml/doctor.ts is the spike
  native/recorder-shim.m AVAudioRecorder over bun:ffi, compiled by clang on first use
  scripts/import-hn.ts   the Hacker News importer; frame-cost.ts prints GPUI draw times per route
                         (npm run brain:frames), against a copy of the data
  test/                  brain.ts (data + native, no models) and smoke.ts (headless UI)
  icon.svg / icon.png    the logo; the .app's icon is cut from the PNG
  .data/                 gitignored: substrate.sqlite, cache/, models/, tmp/
```

**`substrate.sqlite` is the whole brain.** Images, thumbnails and recordings are rows in a
`blobs` table, not files beside the database, so copying that one file moves everything —
which is also why `npm run brain:frames` can point a window at a `VACUUM INTO` copy and still
paint. GPUI's `<img src>`, `afplay` and the worker all want a real path, so `lib/blobs.ts`
writes a blob into `cache/` the first time one is asked for. That directory is disposable:
delete it and it fills in again. Blob rows are immutable — replacing an item's media inserts a
new row — so a cache file named after a blob id can never be stale.

The UI process is the only SQLite writer and holds the vector indexes in memory (`lib/vectors.ts`
is the seam to swap for PGlite + pgvector should a corpus ever outgrow a brute-force scan). The
worker is stateless: it gets texts or cache paths over IPC and returns `Float32Array`s — typed
arrays cross Bun IPC as-is. Every item goes `pending → processing → ready | error`; the steps
are derived from the row's state, so a restart resumes where it stopped instead of replaying an
hour of Whisper. Jobs another process left unfinished are requeued after ten minutes (or from
Settings at once).

### Memory

Three ONNX models are about 1 GB resident. What made a worker balloon past 6 GB on a 16 GB
machine was attention memory on very long chunks (a minified script is one "word") kept alive
by ONNX Runtime's arena. The safeguards: chunk size is capped by characters as well as words,
embedding batches are eight chunks, the arena is off, Whisper and CLIP unload after five idle
minutes, a worker whose parent died exits on its own, and Settings shows the worker's and the
app's resident size. Run one model-loading process at a time.

## The macOS app

`npm run brain:compile` runs `scripts/compile-brain.ts`: `Bun.build({ compile })` over
`standalone.ts` gives `dist/substrate`, then `dist/Substrate.app` is assembled around it.
transformers.js cannot be compiled into a Bun binary (onnxruntime's dylib and sharp's addon are
not embedded — [huggingface/transformers.js#1672](https://github.com/huggingface/transformers.js/issues/1672)),
and it never needs to be: the worker ships as source with its `node_modules` in
`Contents/Resources/ml`, and the app launches it on its **own embedded Bun** by setting
`BUN_BE_BUN=1`, which makes a compiled Bun executable behave as the plain `bun` CLI. The
recorder shim is compiled at build time into `Contents/Resources/native`. Data lives in
`~/Library/Application Support/Substrate`. `CODESIGN_IDENTITY` and `NOTARY_PROFILE` sign
(nested addons first, then the executable, then the bundle) and notarize, as for the
tic-tac-toe build. The bundle is ~450 MB, most of it onnxruntime and sharp prebuilds.

## Environment

All optional, all `GPUIX_BRAIN_*`:

| Variable | Effect |
|---|---|
| `DIR` | data directory (default `examples/second-brain/.data`, or the app data directory when compiled) |
| `STUB=1` | seeded fake data and a stub worker — no models; used for screenshots and tests |
| `START=/settings` | initial route |
| `THEME=light\|dark` | ignore the stored theme and the system setting |
| `ML=off` | disable the ML worker entirely |
| `OFFLINE=1` | never download models |
| `RECORDER=0` | don't compile or load the microphone shim |
| `FEEDS=0` | no scheduled feed polling (manual refresh still works); implied by `OFFLINE=1` |
| `LLM_URL`, `LLM_KEY`, `LLM_MODEL` | override Settings; the key never has to be stored |
| `RESOURCES=/path` | where a compiled app's worker and shim live (auto-detected inside a .app) |
| `DEBUG=1` | verbose logging |

`GPUIX_SCREENSHOT=/tmp/x.png` and `GPUIX_FPS=1` (GPUI's draw-time overlay) work as everywhere else. The API key lives in plain text in
`substrate.sqlite` when set through Settings; use `GPUIX_BRAIN_LLM_KEY` to keep it out.

## Things GPUI has no API for, and what stands in

| Need | Stand-in |
|---|---|
| microphone | `native/recorder-shim.m`: AVAudioRecorder writing 16 kHz mono WAV, loaded with `bun:ffi` (macOS; from a checkout the terminal you launch from is what gets the permission prompt, the .app asks in its own name) |
| file picker | `osascript … choose file` |
| clipboard | `pbpaste`/`pbcopy` for text, `Bun.Image.fromClipboard()` for images |
| audio playback | `afplay` |
| system dark mode | `defaults read -g AppleInterfaceStyle`, polled every 3 s |
| decoding audio | a hand-written WAV parser (`lib/wav.ts`) and mpg123 as WebAssembly for MP3 (`lib/mp3.ts`). WAV and MP3 are the two formats Substrate imports, and both are handled in-process — there is no ffmpeg to install |
| readable text from a page | one synchronous `HTMLRewriter` pass (`lib/scrape.ts`) that scores candidate containers. lol-html keeps one `onEndTag` callback per element and the element handle is dead inside it — `scrape.ts` shows the way around |
| AVIF / HEIC on screen | GPUI's image crate cannot decode them; `Bun.Image` (ImageIO) stores a WebP display copy beside the original |
| shrinking a recording | LAME as WebAssembly (`wasm-media-encoders`, `lib/mp3.ts`): once the transcript exists, a memo the app recorded itself is re-encoded from 16 kHz PCM to 32 kbps MP3 in place, about eight times smaller, and mpg123 decodes it back if it is ever re-transcribed. An imported file is the user's master and is never rewritten |
| search-hit highlighting | GPUI's native `highlight={{ ranges }}` prop, unlocked in the renderer for this app |
| reading a feed | a small XML scanner (`lib/feeds/xml.ts`) rather than `HTMLRewriter`, which is an HTML parser: it voids `<link/>`, lowercases and reshapes the tree, so Atom's `<link href>` and `<content type="html">` do not survive it. The HTML *inside* an entry does go through `extract()` |

## About client-side routers

Substrate hand-rolls its router (`lib/router.svelte.ts`, ~60 lines: a `$state` route, a back
stack, `:param` matching, lazy `import()`). Eight popular Svelte routers were evaluated first;
only **svelte-spa-router 5** compiles under the custom renderer and can run here, and only with
a fake `window`/`history` on `globalThis` plus `--conditions svelte` on the run script, since its
`exports` map has nothing but a `svelte` key. The others fail at compile time on `in:` transitions
(`svelte5-router`, `@dvcol/svelte-simple-router`), on Svelte 4 syntax (`svelte-routing`), or need
a browser-sized shim (`sv-router`, `@mateothegreat/svelte5-router`). If you want svelte-spa-router,
this shim, imported before the router, is all it takes:

```js
const listeners = new Map();
let href = 'app:///#/';
globalThis.history = {
	state: null, scrollRestoration: 'auto',
	pushState(s, _t, url) { this.state = s; if (url) href = url; },
	replaceState(s, _t, url) { this.state = s; if (url) href = url; },
	back() {}
};
globalThis.window = {
	history: globalThis.history, scrollX: 0, scrollY: 0, scrollTo() {},
	location: {
		get href() { return href; },
		get hash() { const i = href.indexOf('#'); return i === -1 ? '' : href.slice(i); },
		set hash(v) { href = 'app:///' + (v.startsWith('#') ? v : '#' + v); globalThis.window.dispatchEvent(new Event('hashchange')); }
	},
	addEventListener(type, fn) { (listeners.get(type) ?? listeners.set(type, []).get(type)).push(fn); },
	removeEventListener(type, fn) { const a = listeners.get(type); if (a) a.splice(a.indexOf(fn), 1); },
	dispatchEvent(ev) { for (const fn of listeners.get(ev.type) ?? []) fn(ev); return true; }
};
```

Substrate does not, because a desktop app wants a back stack rather than hash URLs, and a fake
`window` in a process whose whole point is "no DOM" is a trap for the next dependency that sniffs
for one.

## Tests

`npm run test:brain` (Bun; also part of `npm run bun:test`) runs `test/brain.ts` — the WAV codec,
the page extractor, the SSE parser, the chunker, the vector index, the store and pipeline with a
stub worker, the feed parser and poller against fixture documents, and the real IPC client against
a fake worker, including a forced crash — and `test/smoke.ts`, which mounts the app headlessly and
captures, opens, and deletes a note through GPUI's real hit testing. Neither needs a model or the
network.
