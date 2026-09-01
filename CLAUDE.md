# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Svelte custom renderer that targets GPUI (Zed's GPU-accelerated UI framework) through
`@gpuix/native`. Svelte components render into a real native desktop window — no DOM, no
webview, no browser. Built on Svelte's unreleased custom renderer API
([sveltejs/svelte#18511](https://github.com/sveltejs/svelte/pull/18511)).

## Commands

Everything goes through the package scripts. They embed
`node --conditions custom-renderer --conditions development --import ./src/register.js`. The
conditions are **mandatory** — without them `svelte` resolves to its server build and `mount()`
does not exist — and `--import` installs the `.svelte` loader.

```bash
npm install                # entire setup; @gpuix/native ships prebuilt, no Rust toolchain
npm run demo               # all four demos at once (via scripts/demo-all.js —
                           # cmd.exe has no `&` ... `wait`)
npm run demo:counter       # counter (hot-reloads on save)
npm run demo:tictactoe
npm run demo:hn            # Hacker News reader — live network data, scrolling
npm run demo:glass         # transparent window, macOS vibrancy (GPUI window blur)
npm run demo:glass-ffi     # same app on real Liquid Glass (NSGlassEffectView, macOS 26+)
                           # via a clang-compiled ObjC shim + FFI (koffi/bun:ffi) in
                           # examples/liquid-glass-ffi/glass.js; GPUIX_GLASS=0 forces the
                           # window-blur fallback; NOT part of `npm run demo`

npm test                   # test:reorder, test:smoke, test:autocommit, test:style,
                           # test:teardown, test:lifecycle, test:compile
npm run test:reorder       # single test — keyed {#each} reordering
npm run test:smoke         # single test — mount + click Counter headlessly
npm run test:autocommit    # single test — the microtask drain used where there is no frame loop
npm run test:style         # single test — CSS shorthand expansion, and what must never reach serde
npm run test:teardown      # single test — removal marks dirty, blank text demotes, listeners survive
npm run test:lifecycle     # single test — throws don't kill the frame loop; remount is one batch
npm run test:compile       # single test — the ?v=N cache-buster reaches every child specifier
npm run test:coverage      # optional; needs SVELTE_SAMPLES_DIR (see below)
npm run vendor             # re-vendor svelte from the PR head (or a given ref / full sha):
                           # downloads pkg.svelte.dev's build, or --build compiles it; see
                           # "Hard constraints". Not a runtime script, so no bun twin
```

Every command has a `bun:`-prefixed twin (`npm run bun:test`, `npm run bun:demo:counter`, ...)
running the same entry point through Bun, which takes the loader from `bunfig.toml` rather than
`--import`. Deps come from `npm install` either way. Adding a script means adding both halves.

To verify interactions, prefer `TestGpuixRenderer.simulateClick/simulateMouseDown/...` — they run
GPUI's real hit testing (occlusion included) and queue results for `drainEvents()`, which you feed
through `dispatch()`. Calling `dispatch()` directly injects events at an element and *bypasses* hit
testing, so it can pass while the real window fails. The headless viewport width follows
`new TestGpuixRenderer(width, height)`, but its height caps at 538 logical px — elements laid
out below that can't be hit (shift the layout up inside an absolute wrapper to reach them).

Tests are plain scripts that assert and `process.exit(1)` — no test runner.
Adding one means adding a `test:*` script and chaining it into `test`. CI (`.github/workflows/test.yml`)
runs `npm test` and `npm run bun:test` as two macOS jobs.

`test:coverage` mounts every sample from Svelte's own custom-renderer suite; point
`SVELTE_SAMPLES_DIR` at a svelte checkout's `packages/svelte/tests/custom-renderers/samples`
(it skips silently otherwise). It copies them into `test/.samples-tmp` first, because importing
in place would mix two Svelte runtimes.

### Seeing what a demo renders

A window can't be inspected from a terminal, but a PNG can:

```bash
GPUIX_SCREENSHOT=/tmp/x.png npm run demo:counter    # writes a PNG after every mount/remount
                                                    # (single demo — all four share the path)
```

Then open the PNG with the Read tool (Preview.app also reloads on write). Headless code calls
`TestGpuixRenderer.captureScreenshot(path)` — real Metal pipeline, no window; see `test/smoke.js`.

## Hard constraints

- **No build step, no TypeScript emit.** Plain ESM JS with JSDoc types; `exports` points straight
  at `src/*.js`. Keep it that way.
- **Node >= 24** (for `module.registerHooks`) or **Bun >= 1.4.0**. Both are tested in CI; keep
  runtime-specific code confined to `register.js` / `plugin.js`.
- **Never `bun --hot`.** `render_hot` implements its own in-process reload; `--hot` re-evaluates
  Svelte's runtime, so the old component belongs to a module instance the new one can't see and
  `unmount()` fails.
- **`svelte` is vendored**: `devDependencies.svelte` is `file:vendor/svelte-<version>-<sha7>.tgz`,
  a build of sveltejs/svelte at that commit of the custom-renderer PR stack (#18042 → #18405 →
  #18461 → #18511, whose `custom-condition` branch is the tip). It can't be a URL: upstream
  replaced pkg.pr.new with pkg.svelte.dev on 2026-07-24 (#18253), and pkg.svelte.dev drops a build
  once a force-push removes its commit from the branch — and this PR is rebased on every update —
  so a `https://pkg.svelte.dev/svelte/c/<sha>` pin 404s as soon as the PR is pushed again
  (pkg.pr.new's `svelte@18511` still resolves, but is frozen at the July build, 5.56.7). `npm run vendor [ref|full-sha] [--build] [--force]` moves the pin: it resolves
  `refs/pull/18511/head`, downloads that commit's tarball from pkg.svelte.dev — or, with `--build`
  or when there is none, shallow-fetches the commit into `$TMPDIR/gpuix-svelte-vendor` and
  `pnpm build && pnpm pack`s it — swaps the tarball, repoints `package.json` and runs
  `npm install`. Then run `npm test` and `npm run bun:test`. `.gitignore` un-ignores
  `vendor/*.tgz` for this; `files` keeps it out of the npm package.
- **`@gpuix/native` range is `>=0.5.0 <0.7.0`** (installs 0.6.0) and the renderer speaks the
  0.6.0 mutation contract, which 0.5.x also accepts: applyBatch only — no `removeChild` op
  (reinserts reparent implicitly; nodes that leave the live tree are destroyed at commit and
  re-materialize if shown again), `setCustomProp` not `setCustomPropValue`, and
  `commitMutations?.()` only where it exists. 0.6.0 dropped the darwin-x64 / linux-arm64 /
  win32-arm64 prebuilds — pin 0.5.x on those platforms. `TestGpuixRenderer` does not exist on Linux at all —
  gpuix gates `mod test_renderer` on macOS/Windows and builds Linux with `--no-default-features`
  until wgpu grows image readback — so CI there can only check that the binding loads.

## Architecture

Three layers, `src/`:

```
render.js    window lifecycle + frame loop  ─┐
renderer.js  shadow tree → GPUI projection   ├─ style.js / events.js are its translation helpers
compile.js   .svelte → JS, runtime-agnostic  ─┘
  register.js  Node loader (module.registerHooks)   ─ the default
  plugin.js    Bun loader (Bun.plugin)              ─ the `bun:*` scripts
```

**`compile.js`** compiles `.svelte` with `experimental: { customRenderer }`, which makes the
compiler emit `import $renderer from 'gpuix-svelte/renderer'` into every component.
`GPUIX_SVELTE_RENDERER` overrides that baked specifier — needed for components outside this
workspace, since it must resolve from the `.svelte` file's own location.

The two loaders exist because there is no shared API: Bun has no `module.registerHooks`, and its
`module.register()` is a silent no-op. Both are ~20 lines around `compile_svelte()`, and both must
be installed before the entry module resolves — Node via `--import ./src/register.js` in every
`node` script, Bun via `bunfig.toml`'s `preload`. Tests rely on that registration rather than
importing a loader themselves.

**`renderer.js`** is where the real work is. Svelte's renderer contract is DOM-shaped (fragments,
comments, sibling walking); GPUI's tree is flat, id-based and knows only `div`/`text` plus a few
custom element types. So the renderer keeps a JS shadow tree and *projects* it:

- Elements and non-blank text get a `nativeId`; comments, blank text and fragments never do —
  they are ordering-only. That holds in both directions: text set to `''` at runtime gives its id
  back, or it would keep a slot in GPUI's flex/gap layout.
- Ids are allocated lazily, when a node first becomes reachable from the root (`live`). Svelte
  renders offscreen constantly, and eager creation would leak a Rust node per abandoned render.
- Because virtual nodes are always leaves, "the next native node" is a flat scan of following
  siblings (`first_native_after`) — nothing to descend into.
- `remove()` never destroys: Svelte removes and re-inserts the same node in consecutive statements,
  so nodes go to `pending_destroy` and are reaped in `commit()`. It still has to `mark_dirty()`,
  though — a frame that only removes nodes queues no mutation, so nothing else would tell the frame
  loop (or the auto-commit microtask) that there is anything to ship.
- `next_id` is monotonic across remounts, so a stale tree's ids can't collide with the new one's.
- Mutations queue as tuples and ship as **one** `applyBatch(json)` per commit, then
  `commitMutations()`. `applyBatch` returns the ids Rust destroyed (whole subtrees), which is how
  the id map learns what to purge. The node's `listeners` map survives that purge, like `attrs`
  does, so `materialize()` can re-emit `setEventListener` if the node ever becomes live again.

**`render.js`** owns the `GpuixRenderer`, a `globalThis` symbol slot for the window (so remounts
reuse it), and a ~125fps `setTimeout` loop calling `native.tick()` — paced deliberately, since
`setImmediate` burns ~73% CPU at idle. On `requiresTick() === false` (Windows/Linux) GPUI owns a
blocking UI thread and there is no frame loop, so `set_auto_commit(true)` makes the renderer
schedule its own commit on a microtask — otherwise a mutation with no native event behind it (a
resolved `fetch`, a timer) would sit in the queue until the next click. Native events run
`dispatch` → `flushSync()` → `commit()` so the effects' mutations land in the same frame. `render_hot` watches the entry's
directory and re-imports with a `?v=N` cache-buster; `compile.js` propagates that query to child
`.svelte` specifiers — static, side-effect and dynamic `import()` alike — or a reload would
re-instantiate the root against stale children. It finds them by parsing the emitted JS with
`acorn` (Svelte's own parser, and this package's only dependency besides `@gpuix/native`) and
splicing the query in at each specifier's offset, so a `.svelte` string inside ordinary code or a
comment is left alone and the rest of the output stays byte-identical. The re-import goes through a `file://` URL, since
a bare Windows path parses as a URL scheme.

**`style.js`** — Svelte hands over the `style` attribute as CSS *text*; GPUI wants a camelCase
object with bare-number lengths. `12px` → `12`, while `50%`, `auto` and `#1e1e2e` stay strings. The
raw string is kept on the shadow node because Svelte read-modify-writes it for `style:` directives.
`hover`/`active` are GPUI's native pseudo-styles — nested objects CSS text can't express, so they
arrive as their own attributes and get folded back in.

Unknown *keys* need no allowlist — serde drops them. Unknown **values** are the opposite: a key
GPUI does know, handed a string it can't parse, throws out of `applyBatch`, and that throw loses
the whole frame. So multi-value box shorthands (`padding`, `margin`, `border-width`,
`border-radius`, `gap`, `inset`) expand to the longhands GPUI actually has, and each value is then
checked against the key's Rust type: `NUMBER_ONLY` keys (all the spacing, border and font metrics)
are `f64`, so `1rem`, `50%` and `auto` are all fatal there; only `width`/`height`/`min*`/`max*` are
`DimensionValue` and take `%` or `auto`; `boxShadow` is a struct CSS text can never build. Anything
that fails is dropped with a one-time warning per property rather than shipped. `inset` expands
even when it holds a single value, because GPUI has `top`/`right`/`bottom`/`left` but no `inset`.

**`events.js`** — Svelte lowercases event names at compile time (`onmouseenter` → `mouseenter`);
GPUI keys listeners camelCase (`mouseEnter`). The map is derived by lowercasing GPUI's own list so
the two stay in sync. Unknown events are dropped silently.

## Writing components for this renderer

- Style with inline `style="..."` (and `style:` directives). Box shorthands like
  `padding: 12px 24px` work; `rem`/`em`/`vh` units do not — GPUI lengths are logical pixels — and
  neither do `%` or `auto` outside `width`/`height`/`min*`/`max*`, so the `auto` halves of
  `margin: 0 auto`, and all of `border-radius: 50%`, are dropped with a warning. `class` is ignored, so `<style>` blocks and CSS
  classes do nothing.
- Only GPUI tags exist (`div`, `text`, `img`, `input`, `textarea`, `code`, `diff`, `markdown`,
  `virtual-list`, ...); anything else degrades to `div` with a one-time warning.
- Only the events in `GPUI_EVENTS` fire. `keyDown`/`keyUp` require focus (`tabIndex` or `autofocus`).
- **No event bubbling, and a painted child occludes its parent's hitbox.** A child with a
  `background-color` (or `position: absolute`) swallows clicks meant for a clickable ancestor —
  give decorative children `pointer-events: none`. GPUI also doesn't capture the pointer on
  mousedown: for drags, put `mousemove`/`mouseup` on the surfaces the cursor may cross and treat a
  move with `pressedButton == null` as the release (see the sliders in
  `examples/liquid-glass/LiquidGlass.svelte`).
- `motion={{ initial, animate, transition }}` animates `left`/`top`/`width`/`height`/`opacity`/
  `borderRadius` natively (durations in seconds) — used for the toggle knobs in the liquid-glass
  example.
- `div`/`text` accept only `autoFocus`, `tabIndex`, `testId`, `motion` as props; other attributes
  are dropped for built-ins and forwarded for custom element types.
- Examples import the package by name (`import { render_hot } from 'gpuix-svelte'`) via the
  self-reference in `exports`.

## Runtime

Node, via `npm`: `npm install`, `npm run <script>`, `npx`. Keep the source runtime-agnostic —
`node:*` builtins only, no `Bun.*` calls and no `bun` imports outside `src/plugin.js`.

## Comments

Use code comments sparingly, this is important.

- Comment the **why**, never the **what** — the code already says what it does, and a comment that restates it just rots. Prefer no comment to an obvious one.
- **One sentence.** Allow a second only when the why is genuinely incomprehensible without it (a non-obvious constraint, a bug being worked around, an ordering dependency between two calls); never a third. A comment that keeps growing usually means the code needs a better name or a smaller function, not more prose.
- Do not add comment signatures for new functions unless you need to explain WHY the function is needed.
- Do not add comments for CSS - ever!
- Do not add comments to simple functions.
