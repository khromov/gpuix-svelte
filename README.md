# gpuix-svelte

Write desktop apps in Svelte and render them into a native, GPU-accelerated window — no webview, no
DOM, no Electron. gpuix-svelte is a Svelte custom renderer for [GPUI](https://www.gpui.rs/), the UI
framework behind the Zed editor, via [`@gpuix/native`](https://www.npmjs.com/package/@gpuix/native).

![Four gpuix-svelte demos running as native macOS windows](https://raw.githubusercontent.com/khromov/gpuix-svelte/main/.github/resources/demos.png)

> [!WARNING]
> **Experimental.** This is built on Svelte's unreleased
> [custom renderer API](https://github.com/sveltejs/svelte/pull/18511), so every release of this
> package ships the exact Svelte build it was tested against (see [About the Svelte
> version](#about-the-svelte-version)). Expect breaking changes between minor versions.

## Quick start

```bash
npm create gpuix-svelte@latest my-app
cd my-app
npm install
npm start
```

A counter opens in its own window. Edit `App.svelte` and save — the window hot-reloads.

Requirements: **Node.js >= 24** or **Bun >= 1.4**, on macOS (Apple Silicon), Windows (x64) or Linux
(x64). The GPUI binary comes prebuilt from npm; there is no Rust toolchain to install. With Bun,
`bun create gpuix-svelte my-app` then `bun run start`.

## What it looks like

```svelte
<!-- App.svelte -->
<script lang="ts">
  let count = $state(0);
</script>

<div class="app">
  <text class="count">{count}</text>
  <div class="btn" onclick={() => count++}>Add one</div>
</div>

<style>
  .app { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 32px;
         width: 100%; height: 100%; background-color: #1e1e2e; }
  .count { font-size: 48px; color: #cdd6f4; }
  .btn { padding: 12px 24px; border-radius: 8px; background-color: #313244; color: #cdd6f4; }
  .btn:hover { background-color: #45475a; }
</style>
```

```ts
// app.ts
import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./App.svelte', import.meta.url), { title: 'My app', width: 640, height: 480 });
```

```bash
npx gpuix-svelte app.ts          # Node
npx gpuix-svelte --bun app.ts    # Bun
```

Runes, snippets, `{#each}`, `{#if}`, `{#await}`, `<svelte:boundary>`, `.svelte.ts` state modules
and scoped `<style>` blocks all work as usual. What is different is the platform underneath: there
is no browser, so there is no DOM, no CSS engine and no web APIs beyond what Node or Bun provide —
and in exchange you get the whole of Node or Bun (files, processes, SQLite, native addons) in the
same process as the UI.

## Coming from Svelte on the web

The short list of what works differently. Each links to the full story.

- **Elements are GPUI's**, not HTML: `div`, `text`, `img`, `svg`, `input`, `textarea`, `code`,
  `markdown`, `virtual-list`, `anchored` and a few more. Anything else renders as a `div` with a
  warning. `<img src>` takes a file path, a `data:` URL or an http(s) URL.
- **Styling is a subset of CSS**, flexbox in logical pixels. `px` only — no `rem`, `em` or `vh` —
  and `%`/`auto` only for sizes. Class rules in `<style>` work, including `:hover` and `:active`;
  descendant selectors and media queries do not. Unsupported values are dropped with a warning.
  → [docs/styling.md](docs/styling.md)
- **Theming** is `var(--token)` in your styles plus one `set_css_vars({ token: '#fff' })` call.
  → [docs/styling.md#theming-with-css-variables](docs/styling.md#theming-with-css-variables)
- **Events do not bubble**, and a child with a background swallows clicks meant for its parent.
  Put `hitbox="self"` on the clickable element. `onclick` is the primary button; right and middle
  clicks are `onauxclick`. → [docs/styling.md](docs/styling.md) (non-standard semantics)
- **No `bind:`.** Inputs report through events whose payload carries the value:
  `<input value={text} onchange={(e) => (text = e.value)} />`. To reach an element, use
  `{@attach}`. → [docs/guide.md](docs/guide.md)
- **Keyboard shortcuts** go through `on_window_key('keydown', handler)` rather than a listener on a
  root element. → [docs/guide.md](docs/guide.md#keyboard-shortcuts-and-focus)
- **No scrollbars are painted** by GPUI, and anything that must sit on top has to come last in the
  tree. The package ships `Scroller` and `Portal` for exactly that. →
  [docs/components.md](docs/components.md)
- **Window and desktop APIs** — title, fullscreen, file picker, file drops, images from raw pixels,
  focus, accessibility attributes. → [docs/guide.md](docs/guide.md#window-and-desktop-helpers)

## Documentation

| | |
|---|---|
| [Styling](docs/styling.md) | Every CSS property and value GPUI understands, what is dropped, theming with variables |
| [Components](docs/components.md) | `Scroller` (incl. virtualised lists), `Portal`, and the native `<anchored>` popover |
| [Guide](docs/guide.md) | Forms, keyboard and focus, window and desktop helpers, state that survives hot reload |
| [Testing](docs/testing.md) | Headless tests that click through GPUI's real hit testing, and screenshots |
| [Shipping](docs/shipping.md) | Standalone binaries, signed macOS apps, and running in a browser via WebGPU |

The [examples](examples) are the best reference for real code — see [Examples](#examples).

## Adding it to an existing project

```bash
npm install gpuix-svelte
```

Do **not** add `svelte` to your dependencies; see [About the Svelte version](#about-the-svelte-version).
Then run your entry through the package's bin, typically from `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "start": "gpuix-svelte app.ts",
    "test": "gpuix-svelte test.ts"
  }
}
```

The bin starts Node (or Bun, with `--bun` or under `bun run`) with three things in place before
your entry loads: the `custom-renderer` module condition, without which `svelte` resolves to its
server build; the `.svelte` loader; and, on Node, [tsx](https://tsx.is) for TypeScript. Flags
before the entry go to the runtime (`gpuix-svelte --experimental-ffi app.ts`), arguments after it
to your script. Spelled out, it runs

```bash
node --conditions custom-renderer --conditions development --import tsx --import gpuix-svelte/register app.ts
bun  --conditions custom-renderer --conditions development --preload gpuix-svelte/plugin app.ts
```

On Bun, `preload = ["gpuix-svelte/plugin"]` in a `bunfig.toml` replaces the `--preload` for ad-hoc
`bun file.ts` runs.

### TypeScript

The package ships type declarations. Your `tsconfig.json` needs a `paths` entry pointing at the
Svelte build nested inside the package — `tsc` does not look there on its own — and, for the
editor and `svelte-check` to type markup as GPUI elements rather than DOM ones, the `gpuixHTML`
namespace:

```jsonc
{
  "compilerOptions": {
    "module": "nodenext",
    "strict": true,
    "noEmit": true,
    "customConditions": ["custom-renderer", "development"],
    "types": ["node", "gpuix-svelte/html"],
    "skipLibCheck": true,
    "paths": {
      "svelte": ["./node_modules/gpuix-svelte/node_modules/svelte"],
      "svelte/*": ["./node_modules/gpuix-svelte/node_modules/svelte/*"]
    }
  },
  "svelteOptions": { "namespace": "gpuixHTML" }
}
```

plus a `*.svelte` module declaration and a `svelte.config.js` that turns off Svelte's DOM
accessibility advice. [`starter/`](starter) has all three, ready to copy.

Event handlers take a `GpuixEvent` and `{@attach}` gets a `ShadowNode`, both exported as types:

```svelte
<script lang="ts">
  import type { GpuixEvent, ShadowNode } from 'gpuix-svelte';
</script>
```

## Examples

Clone the repository to run them (`npm install`, then the command):

| | |
|---|---|
| `npm run demo:counter` | The counter, hot-reloading on save |
| `npm run demo:tictactoe` | Tic-tac-toe with score tracking |
| `npm run demo:hn` | Hacker News reader: live network data in a scrolling list |
| `npm run demo:glass` | A translucent control center over macOS vibrancy (`demo:glass-ffi`: real Liquid Glass via FFI, macOS 26+) |
| `npm run demo:styling` | Which CSS reaches GPUI and which is dropped, side by side |
| `npm run demo:desktop` | Window controls, file picker and drops, live image pixels, selection, focus, accessibility |
| `npm run demo:web` | Tic-tac-toe in a browser on GPUI's WebAssembly build (Bun) |
| `npm run tutorial` | A 12-step interactive guide to the renderer, itself a gpuix-svelte app |
| `npm run brain` | [Substrate](examples/second-brain), a complete "second brain" app: notes, links, voice memos, semantic search, chat (Bun) |

Every command also runs on Bun under a `bun:` prefix (`npm run bun:demo:counter`).

## About the Svelte version

Custom renderers are not in a released Svelte yet. They live on an open pull request that changes
without notice and has no version numbers of its own, so this package does not depend on Svelte
from the registry at all: each release **bundles** the exact build of that pull request it was
tested against, inside `node_modules/gpuix-svelte/node_modules/svelte`, and its loaders resolve
every `svelte` import — yours, the compiled components', its own — to that copy.

In practice:

- Don't install `svelte` yourself. The registry's `svelte` has a similar version number and none
  of the renderer API, and it would be ignored anyway.
- Upgrading `gpuix-svelte` may move the Svelte build underneath you, so read the changelog before
  a minor bump.
- Tooling that loads Svelte on its own (`svelte-check`, editor plugins) uses the registry's Svelte
  for type information. That is fine for checking, but not for running.

## Known limitations

- GPUI paints no scrollbar, hence `Scroller`; and no right-click menu, so context menus are drawn
  by the app (a `<Portal>` at the `onauxclick` coordinates).
- `left`, `top`, `right` and `bottom` are pixel-only, so `left: 50%` is dropped; size a progress
  bar's fill with `width: 50%` instead.
- `<svg>` inherits no `color` natively. The renderer copies the nearest ancestor's onto it, but a
  parent's `:hover` colour does not reach it.
- Headless tests run on macOS and Windows only; Linux has no headless renderer yet.
- Building a standalone binary or a web bundle needs Bun and a build script of your own, modelled
  on the repository's — see [docs/shipping.md](docs/shipping.md).

## How it works

Svelte's custom renderer API hands the renderer DOM-shaped operations — create an element, insert
it before an anchor, set an attribute, add a comment node. GPUI's tree is flat, keyed by numeric id
and knows nothing about fragments or comments. gpuix-svelte keeps a lightweight shadow tree in
JavaScript and projects it onto GPUI: only elements and non-empty text get native nodes, created
lazily once they are attached to the window, and every change in a frame is queued and shipped as
one batch, applied by Rust before the next paint.

Around that sit a `.svelte` loader for Node (`module.registerHooks`) and for Bun (`Bun.plugin`),
which compile components with the renderer baked in and turn `<style>` blocks into class rules; a
CSS-text-to-GPUI-style translator that expands shorthands and drops what GPUI would reject; a
~125 fps frame loop; and in-process hot reload. The full design notes are in
[CLAUDE.md](CLAUDE.md).

## Contributing

See [docs/contributing.md](docs/contributing.md) for running the demos and tests, moving the
vendored Svelte build, and how releases are cut.

## License

MIT
