# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Svelte custom renderer that targets GPUI (Zed's GPU-accelerated UI framework) through
`@gpuix/native`. Svelte components render into a real native desktop window — no DOM, no
webview, no browser. Built on Svelte's unreleased custom renderer API
([sveltejs/svelte#18511](https://github.com/sveltejs/svelte/pull/18511)).

## Commands

Everything goes through the package scripts. They embed
`bun --conditions custom-renderer --conditions development`, which is **mandatory** — without
those flags `svelte` resolves to its server build and `mount()` does not exist.

```bash
bun install                # entire setup; @gpuix/native ships prebuilt, no Rust toolchain
bun run demo               # counter (hot-reloads on save)
bun run demo:tictactoe
bun run demo:hn            # Hacker News reader — live network data, scrolling
bun run demo:glass         # transparent window, macOS vibrancy

bun run test               # test:reorder then test:smoke
bun run test:reorder       # single test — keyed {#each} reordering
bun run test:smoke         # single test — mount + click Counter headlessly
bun run test:coverage      # optional; needs SVELTE_SAMPLES_DIR (see below)
```

Tests are plain scripts that assert and `process.exit(1)` — **not** `bun test` / `bun:test`.
Adding one means adding a `test:*` script and chaining it into `test`. CI (`.github/workflows/test.yml`)
runs `bun run test` on macOS only.

`test:coverage` mounts every sample from Svelte's own custom-renderer suite; point
`SVELTE_SAMPLES_DIR` at a svelte checkout's `packages/svelte/tests/custom-renderers/samples`
(it skips silently otherwise). It copies them into `test/.samples-tmp` first, because importing
in place would mix two Svelte runtimes.

### Seeing what a demo renders

A window can't be inspected from a terminal, but a PNG can:

```bash
GPUIX_SCREENSHOT=/tmp/x.png bun run demo    # writes a PNG after every mount/remount
```

Then open the PNG with the Read tool (Preview.app also reloads on write). Headless code calls
`TestGpuixRenderer.captureScreenshot(path)` — real Metal pipeline, no window; see `test/smoke.js`.

## Hard constraints

- **No build step, no TypeScript emit.** Plain ESM JS with JSDoc types; `exports` points straight
  at `src/*.js`. Keep it that way.
- **Never `bun --hot`.** `render_hot` implements its own in-process reload; `--hot` re-evaluates
  Svelte's runtime, so the old component belongs to a module instance the new one can't see and
  `unmount()` fails.
- **`svelte` is pinned to `https://pkg.pr.new/svelte@18511`** (CI preview of the custom-renderer
  branch). The committed `bun.lock` keeps installs working if that URL dies; only
  `bun update svelte` needs it live.
- **`@gpuix/native` is pinned to `^0.4.0` on purpose.** 0.5+/0.6 changed the native mutation
  contract (dropped `commitMutations()`); the renderer has not been ported.

## Architecture

Three layers, `src/`:

```
render.js    window lifecycle + frame loop  ─┐
renderer.js  shadow tree → GPUI projection   ├─ style.js / events.js are its translation helpers
plugin.js    Bun loader for .svelte          ─┘
```

**`plugin.js`** compiles `.svelte` on import with `experimental: { customRenderer }`, which makes
the compiler emit `import $renderer from 'gpuix-svelte/renderer'` into every component. Registered
via `bunfig.toml`'s `preload` for demos; tests `import '../src/plugin.js'` directly (same module
path, so no double registration). `GPUIX_SVELTE_RENDERER` overrides the baked import specifier —
needed for components outside this workspace, since it must resolve from the `.svelte` file's own
location.

**`renderer.js`** is where the real work is. Svelte's renderer contract is DOM-shaped (fragments,
comments, sibling walking); GPUI's tree is flat, id-based and knows only `div`/`text` plus a few
custom element types. So the renderer keeps a JS shadow tree and *projects* it:

- Elements and non-blank text get a `nativeId`; comments, blank text and fragments never do —
  they are ordering-only.
- Ids are allocated lazily, when a node first becomes reachable from the root (`live`). Svelte
  renders offscreen constantly, and eager creation would leak a Rust node per abandoned render.
- Because virtual nodes are always leaves, "the next native node" is a flat scan of following
  siblings (`first_native_after`) — nothing to descend into.
- `remove()` never destroys: Svelte removes and re-inserts the same node in consecutive statements,
  so nodes go to `pending_destroy` and are reaped in `commit()`.
- `next_id` is monotonic across remounts, so a stale tree's ids can't collide with the new one's.
- Mutations queue as tuples and ship as **one** `applyBatch(json)` per commit, then
  `commitMutations()`. `applyBatch` returns the ids Rust destroyed (whole subtrees), which is how
  the id map and listener registry learn what to purge.

**`render.js`** owns the `GpuixRenderer`, a `globalThis` symbol slot for the window (so remounts
reuse it), and a ~125fps `setTimeout` loop calling `native.tick()` — paced deliberately, since
`setImmediate` burns ~73% CPU at idle. On `requiresTick() === false` (Windows/Linux) GPUI owns a
blocking UI thread and there is no frame loop. Native events run `dispatch` → `flushSync()` →
`commit()` so the effects' mutations land in the same frame. `render_hot` watches the entry's
directory and re-imports with a `?v=N` cache-buster; `plugin.js` propagates that query to child
`.svelte` imports, or a reload would re-instantiate the root against stale children.

**`style.js`** — Svelte hands over the `style` attribute as CSS *text*; GPUI wants a camelCase
object with bare-number lengths. `12px` → `12`, while `50%`, `auto` and `#1e1e2e` stay strings. The
raw string is kept on the shadow node because Svelte read-modify-writes it for `style:` directives.
`hover`/`active` are GPUI's native pseudo-styles — nested objects CSS text can't express, so they
arrive as their own attributes and get folded back in. No allowlist is needed; serde drops unknown
keys on the Rust side.

**`events.js`** — Svelte lowercases event names at compile time (`onmouseenter` → `mouseenter`);
GPUI keys listeners camelCase (`mouseEnter`). The map is derived by lowercasing GPUI's own list so
the two stay in sync. Unknown events are dropped silently.

## Writing components for this renderer

- Style with inline `style="..."` (and `style:` directives). `class` is ignored, so `<style>`
  blocks and CSS classes do nothing.
- Only GPUI tags exist (`div`, `text`, `img`, `input`, `textarea`, `code`, `diff`, `markdown`,
  `virtual-list`, ...); anything else degrades to `div` with a one-time warning.
- Only the events in `GPUI_EVENTS` fire. `keyDown`/`keyUp` require focus (`tabIndex` or `autofocus`).
- `div`/`text` accept only `autoFocus`, `tabIndex`, `testId`, `motion` as props; other attributes
  are dropped for built-ins and forwarded for custom element types.
- Examples import the package by name (`import { render_hot } from 'gpuix-svelte'`) via the
  self-reference in `exports`.

## Bun

Use Bun, not Node: `bun <file>`, `bun install`, `bun run <script>`, `bunx`. Bun loads `.env`
automatically — no `dotenv`. Prefer `Bun.file` over `node:fs` read/write and `Bun.$` over execa.
Bun API docs live in `node_modules/bun-types/docs/**.mdx`.

## Comments

Use code comments sparingly, this is important.

- Comment the **why**, never the **what** — the code already says what it does, and a comment that restates it just rots. Prefer no comment to an obvious one.
- **One sentence.** Allow a second only when the why is genuinely incomprehensible without it (a non-obvious constraint, a bug being worked around, an ordering dependency between two calls); never a third. A comment that keeps growing usually means the code needs a better name or a smaller function, not more prose.
- Do not add comment signatures for new functions unless you need to explain WHY the function is needed.
- Do not add comments for CSS - ever!
- Do not add comments to simple functions.
