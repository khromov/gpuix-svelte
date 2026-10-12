# gpuix-svelte

Write desktop apps in Svelte and render them straight into a native, GPU-accelerated window.
gpuix-svelte is a Svelte custom renderer for [GPUI](https://www.gpui.rs/), the UI
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
(x64). The GPUI binary comes prebuilt from npm, so `npm install` is the whole setup. With Bun,
`bun create gpuix-svelte my-app` then `bun run start`. Building standalone executables
(`npm run build`) requires [Bun](https://bun.com), whichever runtime you develop on.

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
and scoped `<style>` blocks all work as usual. Underneath is GPUI's element tree, painted on the
GPU, with the whole of Node or Bun (files, processes, SQLite, native addons) in the same process
as the UI.

## Coming from Svelte on the web

The short list of what to know. Each links to the full story.

- **Elements are GPUI's**: `div`, `text`, `img`, `svg`, `input`, `textarea`, `code`, `markdown`,
  `virtual-list`, `anchored` and a few more. Other tags render as a `div`, with a warning.
  `<img src>` takes a file path, a `data:` URL or an http(s) URL.
- **Styling is CSS text for a flexbox layout in logical pixels.** Lengths are `px` or `rem` (16 px); sizes
  (`width`, `height`, `min-*`, `max-*`) also take `%` and `auto`. `<style>` blocks take class
  rules with `:hover` and `:active`. Values GPUI can't use are dropped with a warning.
  → [docs/styling.md](docs/styling.md)
- **Theming** is `var(--token)` in your styles plus one `set_css_vars({ token: '#fff' })` call.
  → [docs/styling.md#theming-with-css-variables](docs/styling.md#theming-with-css-variables)
- **Events go to the element under the pointer.** Put `hitbox="self"` on a clickable element and
  clicks on its decoration reach it. `onclick` is the primary button; right and middle clicks are
  `onauxclick`. → [docs/styling.md](docs/styling.md) (non-standard semantics)
- **Inputs report through events** whose payload carries the value:
  `<input value={text} onchange={(e) => (text = e.value)} />`. `{@attach}` hands you the element.
  → [docs/guide.md](docs/guide.md)
- **Keyboard shortcuts** go through `on_window_key('keydown', handler)`, which hears every key
  whatever has focus. → [docs/guide.md](docs/guide.md#keyboard-shortcuts-and-focus)
- **`Scroller` and `Portal` ship with the package**: a scroll column with a drawn scrollbar
  (virtualised on request), and a wrapper that paints modals, menus and toasts on top from
  anywhere in the tree. → [docs/components.md](docs/components.md)
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

`gpuix-svelte` brings its own Svelte, so it is the only dependency you add (see [About the Svelte
version](#about-the-svelte-version)). Then run your entry through the package's bin, typically from `package.json`:

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
your entry loads: the `custom-renderer` module condition, which selects Svelte's client build with
the renderer API; the `.svelte` loader; and, on Node, [tsx](https://tsx.is) for TypeScript. Flags
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
Svelte build nested inside the package and, for the editor and `svelte-check` to type markup as GPUI elements rather than DOM ones, the `gpuixHTML`
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

Clone the repository to run them (`bun install`, then the command):

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

Every command also runs on Bun under a `bun:` prefix (`npm run bun:demo:counter`).

## About the Svelte version

Custom renderers live on an open Svelte pull request that moves on its own schedule. So each release
of this package **bundles** the exact build of that pull request it was tested against, inside
`node_modules/gpuix-svelte/node_modules/svelte`, and its loaders resolve every `svelte` import —
yours, the compiled components', its own — to that copy.

In practice:

- `gpuix-svelte` is your one dependency; the Svelte you import is the one it brings.
- Upgrading `gpuix-svelte` may move the Svelte build underneath you, so read the changelog before
  a minor bump.
- `svelte-check` and editor plugins read types from the registry's Svelte, which is what checking
  needs.

## Good to know

- Scrollbars come from `Scroller`, and context menus are drawn by the app: a `<Portal>` placed at
  the `onauxclick` coordinates.
- `left`, `top`, `right` and `bottom` take pixels; a progress bar's fill sizes with `width: 50%`.
- `<svg>` takes its `color` from the nearest ancestor's style, copied over by the renderer; give
  hover tones to the `<svg>` itself.
- Headless tests run on macOS and Windows.
- Standalone binaries and web bundles are built with Bun, from a script modelled on the
  repository's — see [docs/shipping.md](docs/shipping.md).

## How it works

Svelte's custom renderer API hands the renderer DOM-shaped operations — create an element, insert
it before an anchor, set an attribute, add a comment node. GPUI's tree is flat, keyed by numeric id,
and holds elements and text. gpuix-svelte keeps a lightweight shadow tree in
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
