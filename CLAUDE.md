# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Svelte custom renderer that targets GPUI (Zed's GPU-accelerated UI framework) through
`@gpuix/native`. Svelte components render into a real native desktop window — no DOM, no
webview, no browser. Built on Svelte's unreleased custom renderer API
([sveltejs/svelte#18511](https://github.com/sveltejs/svelte/pull/18511)).

## Commands

Everything goes through the package scripts, and those go through `bin/gpuix-svelte.js`
(`node bin/gpuix-svelte.js [--bun] [runtime flags] <entry> [args]`, published as the `gpuix-svelte`
bin). It runs `node --conditions custom-renderer --conditions development --import ./src/register.js
<entry>` — the conditions are **mandatory**, without them `svelte` resolves to its server build and
`mount()` does not exist, and `--import` installs the `.svelte` loader — or, under `--bun` / when
invoked by Bun, `bun` with the same conditions and `--preload ./src/plugin.js`. Flags before the
entry are forwarded to the runtime (`demo:glass-ffi` passes `--experimental-ffi` that way).

```bash
npm install                # entire setup; @gpuix/native ships prebuilt, no Rust toolchain
npm run demo               # all four demos at once (via scripts/demo-all.js —
                           # cmd.exe has no `&` ... `wait`)
npm run demo:counter       # counter (hot-reloads on save)
npm run demo:tictactoe
npm run demo:hn            # Hacker News reader — live network data, scrolling
npm run demo:glass         # transparent window, macOS vibrancy (GPUI window blur)
npm run demo:glass-ffi     # same app on real Liquid Glass (NSGlassEffectView, macOS 26+)
                           # via a clang-compiled ObjC shim + FFI (node:ffi/bun:ffi) in
                           # examples/liquid-glass-ffi/glass.js; GPUIX_GLASS=0 forces the
                           # window-blur fallback; NOT part of `npm run demo`
npm run demo:styling       # styling playground: three columns of style strings next to what GPUI
                           # made of them (reads like CSS / looks like CSS but is not / GPUI-only);
                           # NOT part of `npm run demo`
npm run tutorial           # interactive onboarding guide (examples/tutorial): 12 steps, each an
                           # explanation + diagram on the left and highlighted source + the same
                           # component running live on the right, with a quiz. Prose is
                           # examples/tutorial/content/*.md, the registry is steps.js, samples/
                           # hot-reload; GPUIX_TUTORIAL_STEP=7 starts at step 7. The only user
                           # of GPUI's <code>/<markdown> elements. `bun run tutorial` runs it on
                           # Bun: the bin picks the runtime from --bun or npm_config_user_agent
                           # (Bun's script runner executes `node ...` on real Node otherwise).
                           # NOT part of `npm run demo`
npm run brain              # Substrate, the "second brain" example (examples/second-brain): notes, links
                           # (scraped with HTMLRewriter), images, voice memos; hybrid search
                           # (nomic embeddings + FTS5 + CLIP, fused with RRF); RAG chat over any
                           # OpenAI-compatible endpoint; light/dark. BUN ONLY (bun:sqlite,
                           # Bun.spawn IPC, Bun.Image, bun:ffi), so no node twin — `bun run brain`
                           # is the same script. Models run in a child process (ml/worker.js).
                           # Env: GPUIX_BRAIN_DIR, _STUB=1 (fake data, no models — screenshots),
                           # _START=/settings, _THEME=light|dark, _ML=wasm|off, _OFFLINE=1,
                           # _RECORDER=0, _FFMPEG, _LLM_URL/_LLM_KEY/_LLM_MODEL. See its README.
npm run brain:install      # once: `npm install --prefix examples/second-brain/ml` — the ML deps
                           # (transformers.js → onnxruntime-node, sharp; ~380 MB of prebuilds) live
                           # in that nested package so the root and CI stay lean
npm run brain:doctor       # feasibility spike: loads all three models under Bun and runs one
                           # inference each; first run downloads ~380 MB into .data/models
npm run brain:compile      # dist/substrate + dist/Substrate.app via scripts/compile-brain.js (macOS
                           # only). transformers.js can't be compiled into a Bun binary
                           # (huggingface/transformers.js#1672), so the worker ships as source with
                           # its node_modules in Contents/Resources and the app runs it on its own
                           # embedded Bun (BUN_BE_BUN=1). Data goes to ~/Library/Application
                           # Support/Substrate. CODESIGN_IDENTITY / NOTARY_PROFILE as for compile.
npm run brain:import-hn    # pours the Hacker News front page into the real brain (scrape smoke test)

npm test                   # test:reorder, test:smoke, test:autocommit, test:style,
                           # test:teardown, test:lifecycle, test:compile, test:css, test:module
npm run test:reorder       # single test — keyed {#each} reordering
npm run test:smoke         # single test — mount + click Counter headlessly
npm run test:autocommit    # single test — the microtask drain used where there is no frame loop
npm run test:style         # single test — CSS shorthand expansion, and what must never reach serde
npm run test:teardown      # single test — removal marks dirty, blank text demotes, listeners survive
npm run test:lifecycle     # single test — throws don't kill the frame loop; remount is one batch
npm run test:compile       # single test — the ?v=N cache-buster reaches every child specifier
npm run test:css           # single test — <style> class rules: specificity, inline wins, :hover, class: toggles
npm run test:module        # single test — a .svelte.js runes module compiles and is one shared instance
npm run test:brain         # Bun-only, chained into bun:test not test — examples/second-brain/test/brain.js
                           # (WAV codec, page extractor, SSE parser, chunker, vector index, store +
                           # pipeline with a stub worker, real IPC client vs a fake worker incl. a crash)
                           # and test/smoke.js (headless mount; capture, open, Esc, delete via real hit
                           # testing). No models, no network.
npm run test:coverage      # optional; needs SVELTE_SAMPLES_DIR (see below)
npm run vendor             # re-vendor svelte: downloads pkg.svelte.dev's build of the PR
                           # head; see "Hard constraints". Not a runtime script, so no bun twin
npm run compile            # tic-tac-toe → dist/tictactoe (.exe on Windows) via Bun.build({ compile });
                           # Bun-only, so no twin — it refuses to run under Node
npm run compile:app        # same, plus a dist/Tic-tac-toe.app wrapper with its icon (macOS only)
```

Every command has a `bun:`-prefixed twin (`npm run bun:test`, `npm run bun:demo:counter`, ...)
running the same entry point through Bun (`node bin/gpuix-svelte.js --bun ...`), which takes the
loader as a `--preload` rather than an `--import`; `bunfig.toml` carries the same preload for
ad-hoc `bun file.js` runs. Deps come from `npm install` either way. Adding a script means adding
both halves — except the Bun-only ones (`compile`, `brain:*` other than `brain`), whose `bun:`
twin is an alias.

Headless tests go through `gpuix-svelte/test` (`src/test.js`): `mount_headless(Component, { props,
width, height })`, `settle()` / `await wait(ms)`, `find_text` / `find_test_id` / `element_of` /
`tree()` over `getTreeJson()` (nodes carry `testId` and `events`), and `click_text` /
`click_test_id` / `click(node)` / `press(keystroke)` / `type(keystrokes)`, which run GPUI's real hit
testing and input pipeline (`simulateClick` → `drainEvents()` → `dispatch()`; `drain()` alone is the
last two). Prefer those over calling `dispatch()` directly, which injects an event at an element
and *bypasses* hit testing, so it can pass while the real window fails — the renderer's own tests
do it only where the batching itself is under test. The headless viewport width follows
`mount_headless`'s `width`/`height`, but its height caps at 538 logical px — elements laid out below
that can't be hit (`click` throws; shift the layout up inside an absolute wrapper to reach them).
`src/window.js` (`set_window_title`, `activate_window`, `blur`, `focus_element`) no-ops on the test
renderer, which lacks those methods, so app code never needs `get_native()?.x?.()` guards.

Tests are plain scripts: `check(label, actual, expected)` and `finish(name)` from the same module,
exit 1 on any failure — no test runner. Adding one means adding a `test:*` script and chaining it
into `test`. CI (`.github/workflows/test.yml`) runs `npm test` and `npm run bun:test` as two macOS
jobs.

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

### Standalone binary

`scripts/compile.js` is `Bun.build({ compile })` over `examples/tic-tac-toe/standalone.js`, a
static-`render()` entry — `render_hot` re-imports from disk and can't live in a binary, so `main.js`
stays the dev entry. The `.svelte` plugin has to be passed explicitly: `Bun.build` never sees the
`Bun.plugin` registration from `bunfig.toml`, and without one a `.svelte` import silently becomes a
file asset while the build still succeeds — hence `src/plugin.js` exports its load hook and the
script counts the components that went through it. `custom-renderer` is a build-time condition
there, and `production` only takes effect together with the `process.env.NODE_ENV` define, because
Bun implies `development` otherwise and esm-env lists it first. `@gpuix/native`'s loader bundles
as-is and Bun embeds the host's `.node` prebuild on its own, which is why a binary is built on the OS
it targets (npm only installs the host prebuild). `GPUIX_SVELTE_RENDERER` is a build-time variable on
this path. CI compiles on all three prebuild platforms but never launches the result. The `.app`'s
icon is `examples/tic-tac-toe/icon.png`, rasterized at 1024 px from the `icon.svg` beside it; `--app`
cuts it into an `.icns` with `sips` + `iconutil`, which ship with macOS. Signing is opt-in through
env vars so CI stays unsigned: `CODESIGN_IDENTITY` signs with the hardened runtime and the JIT
entitlements Bun needs (inline in the script), and `NOTARY_PROFILE` then notarizes and staples the
`.app` through `notarytool` — a few minutes, and it needs `xcrun notarytool store-credentials
<profile>` done once. Gatekeeper rejects a signed-but-unnotarized app, so both are needed to ship.

## Hard constraints

- **No build step, no TypeScript emit.** Plain ESM JS with JSDoc types; `exports` points straight
  at `src/*.js`. Keep it that way.
- **Node >= 26.1** (the glass-ffi demo loads its ObjC shim with the experimental `node:ffi`;
  everything else only needs 24's `module.registerHooks`) or **Bun >= 1.4.0**. Both are tested in
  CI; keep runtime-specific code confined to `register.js` / `plugin.js`.
- **Never `bun --hot`.** `render_hot` implements its own in-process reload; `--hot` re-evaluates
  Svelte's runtime, so the old component belongs to a module instance the new one can't see and
  `unmount()` fails.
- **`svelte` is vendored**: `devDependencies.svelte` is `file:vendor/svelte-<version>-<sha7>.tgz`,
  a build of sveltejs/svelte at that commit of the custom-renderer PR stack (#18042 → #18405 →
  #18461 → #18511, whose `custom-condition` branch is the tip). It can't be a URL: upstream
  replaced pkg.pr.new with pkg.svelte.dev on 2026-07-24 (#18253), and pkg.svelte.dev drops a build
  once a force-push removes its commit from the branch — and this PR is rebased on every update —
  so a `https://pkg.svelte.dev/svelte/c/<sha>` pin 404s as soon as the PR is pushed again
  (pkg.pr.new's `svelte@18511` still resolves, but is frozen at the July build, 5.56.7). `npm run vendor` moves the pin: it looks up the PR head on GitHub, downloads that
  commit's tarball from pkg.svelte.dev (`/svelte/c/<sha>`; it errors if the build isn't up yet),
  swaps the tarball, repoints `package.json` and runs `npm install`. Then run `npm test` and
  `npm run bun:test`. For a commit pkg.svelte.dev no longer has, `pnpm build && pnpm pack` in a
  svelte checkout's `packages/svelte` and drop the tarball in by hand under the same name. `.gitignore` un-ignores
  `vendor/*.tgz` for this; `files` keeps it out of the npm package.
- **`@gpuix/native` range is `>=0.7.0 <=0.8.0`** (installs 0.7.0) and the renderer speaks its
  mutation contract: applyBatch only — no `removeChild` op (reinserts reparent implicitly; nodes
  that leave the live tree are destroyed at commit and re-materialize if shown again),
  `setCustomProp` not `setCustomPropValue`, and `commitMutations?.()` only where it exists.
  Prebuilds exist for darwin-arm64 / linux-x64 / win32-x64 only. On Linux `TestGpuixRenderer` is
  a constructor that throws (`hasTestGpuixRenderer()` says so) — gpuix builds it with
  `--no-default-features` until wgpu grows image readback — so CI there can only check that the
  binding loads.

## Architecture

Three layers, `src/`:

```
render.js    window lifecycle + frame loop  ─┐
renderer.js  shadow tree → GPUI projection   ├─ style.js / events.js are its translation helpers
compile.js   .svelte → JS, runtime-agnostic  ─┘
  register.js  Node loader (module.registerHooks)   ─ the default
  plugin.js    Bun loader (Bun.plugin)              ─ the `bun:*` scripts, scripts/compile.js
  test.js      headless harness over TestGpuixRenderer  ─ `gpuix-svelte/test`
  window.js    title / activate / blur / focus helpers  ─ no-ops headlessly
```

**`compile.js`** compiles `.svelte` with `experimental: { customRenderer }`, which makes the
compiler emit `import $renderer from 'gpuix-svelte/renderer'` into every component.
`GPUIX_SVELTE_RENDERER` overrides that baked specifier — needed for components outside this
workspace, since it must resolve from the `.svelte` file's own location.

It is also where `<style>` blocks go. The compiler refuses `css: 'injected'` under a custom
renderer and hands the scoped CSS back instead, so `compile_svelte` walks the block's AST
(`modernAst: true`) and appends a `define_styles(scope, rules)` call to the component: one rule
per compound selector, keyed by the `svelte-<hash>` scope class the compiler already stamps on
every matched element (`cssHash` captures it). Only classes, one optional tag, and
`:hover`/`:active` are accepted — combinators, `:global`, attribute selectors, at-rules and
nesting are refused with a warning naming the file — and declarations go through
`parse_css_text` at compile time, so the value checks below apply to them too. Rules are
emitted weakest first (tags under classes, then source order), and the renderer's
`class_rules()` picks the ones whose classes the element carries on every `class` change, so
`class:` directives and dynamic class strings restyle for free. `build_style` then lays the
inline `style` on top; `:hover` rules become GPUI's native `hover` object with the `hover=`
attribute winning. A block that reads a `var(--name[, fallback])` is emitted as `css` text
instead of a parsed `style`, because the map it resolves against lives at runtime: `style.js`
substitutes on every `parse_css_text` (inline `style=` included), memoises each such rule per
`set_css_vars()` generation, and the renderer flags nodes whose style read a variable so
`set_css_vars(vars)` (exported from the package) restyles exactly those, in one batch. An
undefined variable without a fallback drops that declaration with a one-time warning. Merging
also honours shorthands: a later `padding: 20px` clears the longhands an earlier
`padding: 12px 24px` expanded to, since GPUI reads longhands over the shorthand.

The two loaders exist because there is no shared API: Bun has no `module.registerHooks`, and its
`module.register()` is a silent no-op. Both are ~20 lines around `compile_svelte()`, and both must
be installed before the entry module resolves — Node via `--import ./src/register.js`, Bun via
`--preload ./src/plugin.js` (or `bunfig.toml`'s `preload`), both supplied by `bin/gpuix-svelte.js`.
Tests rely on that registration rather than importing a loader themselves. Both also compile `.svelte.js` runes modules through
`compile_module()` (`compileModule` from `svelte/compiler`, no renderer option). Those are
deliberately **not** cache-busted: a module is one instance per process, so state kept in one
survives a hot remount (that is how Substrate keeps its route and theme), and editing one needs a
restart.

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
`setImmediate` burns ~73% CPU at idle. Since native 0.7.0 `requiresTick()` is true on every
platform — on Windows/Linux, where GPUI owns a blocking UI thread, `tick()` only reports whether
that thread is still alive — and it returns false once the last window closes, which ends the
loop and the process. Where it is false, `set_auto_commit(true)` makes the renderer schedule its
own commit on a microtask instead — otherwise a mutation with no native event behind it (a
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

### Regenerating README's styling reference

The two `<details>` lists under README's "Styling" heading are transcribed from the native side,
so redo them whenever `@gpuix/native` moves. The npm package ships no Rust; read the release tag on
upstream (`https://raw.githubusercontent.com/remorses/gpuix/@gpuix/native@<version>/packages/native/src/<file>`,
tags exist for every release; the sibling `../gpuix` checkout lags and is not a source of truth):

- `style.rs`, `struct StyleDesc` — every key and its type. `Option<f64>` keys are pixel-only,
  `DimensionValue` takes `%`/`auto`, `String` keys are keyword-matched, and anything that is a
  struct (`BoxShadowValue`, `BackgroundValue::Gradient`) is unreachable from CSS text. Its
  `parse_cursor` is the cursor keyword list.
- `renderer.rs`, `fn apply_styles` — the keywords each `String` key actually matches; a key that is
  in `StyleDesc` but not here is accepted and ignored (`visibility`, `display: none`).
  `sed -n '/fn apply_styles/,/^}/p' renderer.rs | grep -n 'Some("'` lists them all. `parse_font_weight`
  is the weight names; `overflow: scroll` is handled separately in `build_host_container`.
- `color.rs` — colour syntax (`csscolorparser` since 0.7.0, so names and `hsl()` work).

Then mirror any new pixel-only or dimension key into `NUMBER_ONLY` / `DIMENSION` in `src/style.js`,
add a card to `examples/styling-playground`, and confirm what actually reached GPUI headlessly:
mount with `TestGpuixRenderer` and read `getTreeJson()` — each node's `style` is the deserialized
`StyleDesc`, with unknown keys already dropped, which is exactly what README claims.

**`events.js`** — Svelte lowercases event names at compile time (`onmouseenter` → `mouseenter`);
GPUI keys listeners camelCase (`mouseEnter`). The map is derived by lowercasing GPUI's own list so
the two stay in sync. Unknown events are dropped silently.

## Writing components for this renderer

- Style with inline `style="..."` (and `style:` directives). Box shorthands like
  `padding: 12px 24px` work; `rem`/`em`/`vh` units do not — GPUI lengths are logical pixels — and
  neither do `%` or `auto` outside `width`/`height`/`min*`/`max*`, so the `auto` halves of
  `margin: 0 auto`, and all of `border-radius: 50%`, are dropped with a warning.
- `<style>` blocks work for class rules: `.btn { }`, `.btn.primary { }`, `.a, .b { }`, a tag
  (`div { }`), and `.btn:hover` / `.btn:active`, scoped per component like Svelte's DOM output.
  Specificity is class count then source order, inline `style` always wins. Descendant
  selectors, `:global`, attribute selectors, media queries and nesting are refused at compile
  time with a warning. `flex: 1`, `border: 1px solid ...`, unitless `line-height` and
  `display: none` have the same problems in a class rule as inline (see the styling playground).
- Only GPUI tags exist (`div`, `text`, `img`, `input`, `textarea`, `code`, `diff`, `markdown`,
  `virtual-list`, ...); anything else degrades to `div` with a one-time warning. `<img src>` is a
  filesystem path or a `data:` URL, never http. `<svg source>` inherits **no** `color` from its
  parent — set one on the element (Substrate's `Icon.svelte` does it with tone classes) or it
  paints a default grey.
- Prefer `<style>` blocks to inline `style="..."`: shape and colour as class rules, colours as
  `var(--token)` with the palette handed to `set_css_vars({ token: '#fff' })` once from the root
  (Substrate does it in an `$effect` over its `LIGHT`/`DARK` objects — a theme switch is one
  call), `style:` only for measured values. Shared reactive state goes in `.svelte.js` modules
  (see above).
- Only the events in `GPUI_EVENTS` fire. `keyDown`/`keyUp` require focus (`tabIndex` or `autofocus`);
  since native 0.7.0 Tab reaches `keyDown` as an ordinary key and no longer moves focus.
- **No mouse event bubbling, and a painted child occludes its parent's hitbox.** (Key events are
  the exception: a `keyDown` reaches the focused element *and* every focusable ancestor that
  listens, so a root shortcut handler also hears what is typed into an `<input>` below it.) A child with a
  `background-color` (or `position: absolute`) swallows clicks meant for a clickable ancestor —
  give decorative children `pointer-events: none`. GPUI also doesn't capture the pointer on
  mousedown: for drags, put `mousemove`/`mouseup` on the surfaces the cursor may cross (or show a
  window-sized `position: absolute` overlay for the drag's duration, as the styling playground's
  scrollbar does) and treat a move with `pressedButton == null` as the release (see the sliders in
  `examples/liquid-glass/LiquidGlass.svelte`). A left mousedown also starts a text selection that
  every later move extends across whatever text lies in between, unless the element under the
  pointer (or an ancestor) has `user-select: none` — put it on every drag handle.
- `motion={{ initial, animate, transition }}` animates `left`/`top`/`width`/`height`/`opacity`/
  `borderRadius` natively (durations in seconds) — used for the toggle knobs in the liquid-glass
  example.
- `div`/`text` accept only `autoFocus`, `tabIndex`, `testId`, `motion`, `highlight` as props;
  other attributes are dropped for built-ins and forwarded for custom element types.
  `highlight={{ query } | { ranges: [[start, end], …], color, radius }}` paints GPUI's native
  search highlight behind the matching text (character offsets into the element's text) and
  fires `onhighlight` with `e.matchCount`; Substrate's search results use it.
- `bind:` is refused by the compiler under `customRenderer`. To get hold of an element use
  `{@attach (node) => ...}` (or `use:`); the node is the renderer's shadow node, and `node.nativeId`
  is what `get_native()`'s handle wants for `getScrollOffset()` / `getElementBounds()` (`[x, y, w, h]`,
  a clipped child still reports its full size). GPUI paints no scrollbars; the styling playground
  draws its own thumb this way, refreshed from the column's `onscroll` a frame later, since the
  offset moves after the wheel event returns.
- Examples import the package by name (`import { render_hot } from 'gpuix-svelte'`) via the
  self-reference in `exports`.

## Runtime

Node, via `npm`: `npm install`, `npm run <script>`, `npx`. Keep the source runtime-agnostic —
`node:*` builtins only, no `Bun.*` calls and no `bun` imports outside `src/plugin.js` and
`scripts/compile.js` (Bun is the compiler there).

## Comments

Use code comments sparingly, this is important.

- Comment the **why**, never the **what** — the code already says what it does, and a comment that restates it just rots. Prefer no comment to an obvious one.
- **One sentence.** Allow a second only when the why is genuinely incomprehensible without it (a non-obvious constraint, a bug being worked around, an ordering dependency between two calls); never a third. A comment that keeps growing usually means the code needs a better name or a smaller function, not more prose.
- Do not add comment signatures for new functions unless you need to explain WHY the function is needed.
- Do not add comments for CSS - ever!
- Do not add comments to simple functions.
