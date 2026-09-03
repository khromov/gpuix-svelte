- # gpuix-svelte and gpuix-solid, compared

Two renderers put a JavaScript UI framework on top of the same `@gpuix/native` package (GPUI,
Zed's GPU UI framework, exposed through napi). This one renders Svelte 5 through the
custom-renderer PR; [jhomra21/gpuix-solid](https://github.com/jhomra21/gpuix-solid) renders
Solid 2 (and Solid 1.9) through `@solidjs/universal`. This document records what the two share,
where they diverge, and which Solid-side features are worth bringing over.

|              |                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Date         | 2026-09-03                                                                                                                            |
| gpuix-solid  | `cd72e84` (`gpuix-solid@0.1.0-beta.4`, `@jhomra21/gpuix-solid1@0.1.0-beta.0`), pinned to `@gpuix/native ^0.6.0`                       |
| gpuix-svelte | `e729a86` (`0.1.0`), pinned to `@gpuix/native >=0.7.0 <=0.8.0`                                                                        |
| Method       | Both source trees read in full; native behaviour checked against the Rust of the `@gpuix/native@0.7.0` tag, not against either README |

Neither project forks the Rust side. Both are pure JavaScript renderers over the published
napi contract, so every difference below is a JavaScript design choice.

## At a glance

|                    | gpuix-svelte                                                                                                                                               | gpuix-solid                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework hook     | Svelte 5 custom-renderer API (unreleased PR stack, vendored and bundled build)                                                                             | `@solidjs/universal` `createRenderer` (Solid 2 rc) plus a separate Solid 1.9 package                                                                                                                          |
| Compile and run    | `.svelte` compiled at import time by a Node `module.registerHooks` loader or a `Bun.plugin`; TypeScript via tsx or Bun; no build step; hot reload built in | Vite `build --ssr` bundle per app, then `bun dist/.../index.js`; no HMR or hot reload anywhere in the repo                                                                                                    |
| Runtime            | Node ≥ 24 or Bun ≥ 1.4, no bundler                                                                                                                         | Bun 1.3.14 + Vite 8 + `@solidjs/vite-plugin`                                                                                                                                                                  |
| Package deps       | `@gpuix/native`, `acorn`, `tsx`                                                                                                                            | `@gpuix/native`, `@solidjs/universal`, `zod`, `eventsource-parser`                                                                                                                                            |
| Style input        | CSS text: inline `style=""`, scoped `<style>` class rules, `var(--x)` with `set_css_vars()`, shorthand expansion, value validation with warnings           | Structured style objects only; no class, no CSS text, no variables. Solid 1 adds a build-time manifest that compiles Tailwind v4 or CSS modules into native style objects keyed by class name                 |
| Shipped components | `Scroller` (drawn thumb, virtual mode), `Portal`                                                                                                           | Solid 2: `Select`, `Combobox`, `Tooltip`, `animate.div`. Solid 1: Kobalte-shaped Button, Dialog, DropdownMenu, ContextMenu, Menubar, TextField, Tooltip, Image, Separator. No Portal in Solid 2               |
| Testing            | `gpuix-svelte/test`: plain scripts with `check`/`finish`, real hit testing through `TestGpuixRenderer`                                                     | vitest unit tests, native parity tests, a Playwright-like `Locator`/`App` API, and live stdio automation of a launched window                                                                                 |
| Examples           | counter, tic-tac-toe, hacker-news, liquid-glass (plus an FFI variant), styling playground, 12-step tutorial, Substrate                                     | counter, native-text, blurred-window, todo, diff, timeline, chat, infinite-chat, dashboard, codeimage, tanstack kitchen-sink, kobalte, tailwind, DAW; chat and timeline perf workloads; a serialization bench |
| Distribution       | npm package with the Svelte build bundled (release-please, OIDC provenance); Bun single binary and `.app` with codesign and notarize                       | npm publish with provenance and release workflows; no binary path                                                                                                                                             |
| Consumer scaffold  | `starter/` template plus `npm run consume` tarball smoke                                                                                                   | None yet (README: "does not have a `gpuix new` scaffold"); exact-tarball smoke job in CI                                                                                                                      |
| Docs               | README, CLAUDE.md, tutorial content                                                                                                                        | README, ARCHITECTURE.md, UPSTREAM.md, docs/upstream-parity.md, docs/compatibility.md, ROADMAP.md, AGENTS.md, 15 custom oxlint rules                                                                           |

## What is the same

The two renderers converged on the same core without sharing code.

- **A JavaScript shadow tree, one `applyBatch` per flush.** Both keep a synchronous JS tree for
  the framework's structural queries and ship mutation tuples in a single JSON `applyBatch`,
  then use the returned destroyed ids to purge JS-side maps
  ([ours](../src/renderer.ts#L693-L732), [theirs][mutations-flush]).
- **Lazy native ids.** Both allocate an id only when a node reaches a root (`materialize()`
  here, [`adopt()`][adopt] there), so offscreen renders do not leak Rust nodes.
- **`setEventListener` only on the 0→1 and 1→0 edges.** Closures stay in JS; swapping a handler
  costs no FFI call.
- **Flush after every native event handler.** Here `dispatch → flushSync → commit`; there
  `root.dispatch` runs the handler inside `flushSolid` and flushes natively in `finally`.
- **The same frame loop.** A `setTimeout(8 ms)` loop (about 125 fps) calling `tick()`, exiting
  when it returns false, and no loop at all when `requiresTick()` is false
  ([ours](../src/render.ts#L77-L95), [theirs][frame-loop]).
- **The same prop allowlist for `div` and `text`**: `autoFocus`, `tabIndex`, `testId`,
  `motion`, `highlight`. Everything else is forwarded only for custom element types. The same
  twelve tags.
- **hover and active as native nested style objects**; no JS hover tracking.
- **Motion stays native.** Both just ship the `motion` prop; gpuix-solid wraps it as
  [`animate.div`][animate].
- Both ran into the same native facts: no pointer capture, no mouse event bubbling, `<svg>`
  inherits no colour, window size is poll-only.

## What differs

These are design choices rather than gaps.

| Topic              | gpuix-svelte                                                                                                                                                                  | gpuix-solid                                                                                                                                                                                                                                                       | Note                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Blank text         | Whitespace-only text never gets a native node                                                                                                                                 | Every text node is native                                                                                                                                                                                                                                         | Ours avoids phantom flex and gap slots                                                |
| Removal            | `remove()` parks a node in `pending_destroy`; `commit()` reaps whatever is still detached                                                                                     | `removeChild` plus `destroyElement` immediately; re-adopting recreates the node with the same id                                                                                                                                                                  | Svelte removes and reinserts the same node in consecutive statements                  |
| Ids and globals    | Module-global monotonic `next_id`, never reused, survives a remount                                                                                                           | Per-root allocator; ids reused on re-adopt; a written rule against module-global renderer, id or event state                                                                                                                                                      | Multi-root isolation is a Solid goal; native opens one window either way              |
| Failed batch       | Queue cleared before `applyBatch`; a throw loses that frame but the loop survives ([render.ts](../src/render.ts#L83-L87))                                                     | Queue [retained and the error rethrown][mutations-retain]; the microtask flush logs it                                                                                                                                                                            | We validate style values before they reach serde, which is where the throws come from |
| Bad style values   | Dropped with a one-time warning                                                                                                                                               | `TypeError` at enqueue                                                                                                                                                                                                                                            |                                                                                       |
| Units              | `px` and bare numbers; `rem`, `em`, `%` and `auto` dropped outside dimension keys. `overflow: auto` ships and is silently ignored (native matches only `scroll` and `hidden`) | `rem` → ×16, `em` → the element's own font size, `max-content`/`min-content`/`fit-content` → `auto`, `overflow: auto` → `scroll`                                                                                                                                  | See candidate H                                                                       |
| Unknown tag        | Degrades to `div` with a warning                                                                                                                                              | Solid 2: a type error. Solid 1: `span`/`p`/`h1`… → `text`, `button`/`ul`/`li`… → `div`, anything else throws                                                                                                                                                      |                                                                                       |
| Portals            | Renderer-level `portal` attribute: the shadow node stays where Svelte put it, only the native node hangs off the root, ordered by mount                                       | Solid 2: none. Solid 1: a [viewport-sized layer][portal] appended as the last child of the app's top-level element                                                                                                                                                | Ours survives `{#if}` teardown and Svelte's anchor walking                            |
| Hit testing        | `hitbox="self"` ships `pointer-events: none` to non-interactive descendants                                                                                                   | No equivalent; the compat layer forces `pointerEvents: none` on transparent positioners at pre-flush                                                                                                                                                              | Ours is a reusable primitive                                                          |
| Keyboard shortcuts | `on_window_key()` plus the `e.editing` flag; window-level, survives remount                                                                                                   | Not in the Solid 2 package. Solid 1 re-dispatches native key events as DOM events on `document` for Kobalte                                                                                                                                                       | Only we use the native `windowKeyDown`/`windowKeyUp` channel                          |
| SVG colour         | Copies the nearest ancestor's `color` onto `<svg>`                                                                                                                            | Solid 1 [serialises inline SVG JSX][svg] to `source`, injects inherited `fill`/`stroke`/`stroke-width`, sizes from `viewBox`                                                                                                                                      | Different inputs: a markup string versus JSX                                          |
| DOM compatibility  | None                                                                                                                                                                          | Solid 2 host nodes expose `focus()`, `getBoundingClientRect()`, `scrollTop`, `setPointerCapture`. Solid 1 fakes `document`, selectors, a [16 ms polling `MutationObserver`][mo], `getComputedStyle` and focus tracking, enough to run real `@kobalte/core` source | Not applicable: Svelte has no headless-UI library that would run on it                |
| Events             | Lowercase → camelCase map derived from `GPUI_EVENTS` (20 names)                                                                                                               | 30 prop aliases including `onPointer*`, `onInput`, `onAuxClick`, and a [synthesized `onContextMenu`][contextmenu]                                                                                                                                                 | We lack `auxClick`; see candidate A                                                   |
| Window options     | `WindowOptions` passthrough plus `onKeyDown`, `onKeyUp`, `onEvent`, `rootStyle`, `props`                                                                                      | Passthrough plus `onEvent` and `debugFrameOverlay`                                                                                                                                                                                                                |                                                                                       |
| CPU                | The 8 ms loop                                                                                                                                                                 | The same loop plus `applyMacCpuThrottleFromEnv()`, which re-execs the process under `taskpolicy -c`                                                                                                                                                               | Niche                                                                                 |
| CI                 | Two macOS jobs (Node and Bun); compile only on Linux and Windows                                                                                                              | macOS, Ubuntu (GPUI runtime deps installed) and Windows matrix, plus a tarball smoke job                                                                                                                                                                          | Their Linux native tests ran on 0.6; the 0.7 Linux prebuild has no test renderer      |

## Only in gpuix-svelte

Nothing to do here; these are worth stating because the Solid repo has no counterpart.

- Hot reload, with the `?v=N` cache-buster propagated to child `.svelte` specifiers via acorn.
- CSS text everywhere: inline `style`, scoped `<style>` class rules with specificity, `:hover`
  and `:active` folded into native pseudo-styles.
- `var()` theming: `set_css_vars()` restyles exactly the nodes that read a variable, in one batch.
- Shorthand expansion and value validation with warnings instead of lost frames.
- `hitbox="self"`, `Portal`, `Scroller` (virtual mode with a drawn thumb).
- `on_window_key` and the `editing` flag.
- Blank-text elision.
- No build step; TypeScript sources shipped as-is.
- Bun single binary, `.app` wrapper, codesign and notarize.
- The tutorial app, the liquid-glass FFI shim, and the Svelte sample-suite coverage test.

## Only in gpuix-solid, and worth porting

Ranked by value for effort. Sizes: XS under 30 lines, S under 100, M a few hundred, L more.

| #   | Feature                                                                                                                           | Why it matters here                                                         | Size   |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------ |
| A   | `auxClick` native event, plus a synthesized `contextmenu`                                                                         | Right and middle click are unreachable in gpuix-svelte today                | XS     |
| B   | Test helpers: hover, wheel, mouse down/up/move, drag, drag-select, painted highlights, selected text, animation clock, `wait_for` | `test/scroller.ts` hand-calls `native.simulate*`; every new test repeats it | S      |
| C   | `useWindowSize` and `useWindowInsets`                                                                                             | No native resize event exists; we expose nothing                            | S      |
| D   | `debugFrameOverlay` render option and stats wrappers                                                                              | Native has it on both renderers; never wired                                | XS     |
| E   | `useTextSearch` over native `highlight`                                                                                           | We forward `highlight` and `onhighlight` but offer no helper                | S      |
| F   | Live automation: locator API, stdio protocol, `launch()`                                                                          | An external process can drive a running window                              | M to L |
| G   | `Tooltip` and `Popover` on `<anchored>`                                                                                           | `<anchored>` is in our tag list but unused and untested                     | M      |
| H   | Style parity: `overflow: auto`, `rem`, intrinsic sizes                                                                            | `overflow: auto` is a silent no-op today                                    | XS     |
| I   | Perf workloads and a serialization bench                                                                                          | We have no numbers                                                          | M      |
| J   | A native-surface parity table                                                                                                     | Shows unwrapped natives at a glance                                         | S      |

### A. `auxClick` and `contextmenu`

In native 0.7.0 the `click` listener is primary-button only, like the DOM. Right and middle
clicks go to `auxClick`, and `mouseDown` sees every button
([renderer.rs][native-click]). The `auxClick` payload carries `isRightClick`, `x`, `y`,
`modifiers` and `clickCount` but not `button`. Our `GPUI_EVENTS` list
([events.ts](../src/events.ts#L6-L31)) has no `auxClick`, so a right-click handler cannot be
written today except by pairing `mouseDown` and `mouseUp` on button 2.

gpuix-solid registers `onAuxClick` and also synthesizes `onContextMenu` from a native `mouseUp`
with `button === 2` ([events.ts][contextmenu]). For Svelte the smaller shape is one native
`auxClick` listener with a `contextmenu` alias filtered on `isRightClick`. Adding `'auxClick'` to
the list makes `onauxclick` work on its own; the alias needs a handler wrapper in
`addEventListener`/`removeEventListener` so `materialize`, `hitbox="self"` shielding and
`dispatch` stay untouched.

### B. Test helpers

gpuix-solid's [`TestRenderer`][testing] wraps every native simulation in
`flush → simulate → drain → flush`, and its [`Locator`][locator] adds `hover`, `wheel`,
`dragTo`, `dragBy`, `fill`, `press`, `textContent` and a polling `waitFor`. Its `App` exposes
`mouse.drag` (interpolated moves with the button held) and `clock.{pause,set,fastForward,resume}`
over the native animation clock.

Our harness has `click`, `press`, `type`, `find_*`, `bounds`, `settle`, `wait` and `screenshot`.
The scroller test reaches for `native.simulateScrollWheel`, `simulateMouseDown`,
`simulateMouseMove` and `simulateMouseUp` directly, followed by `drain(); settle();` by hand.
`clockPause`, `clockSet`, `clockFastForward`, `clockResume`, `advanceTime`, `dragSelect`,
`getSelectedText` and `getPaintedHighlights` exist on our native handle and are wrapped nowhere.
Wrapping them as `hover`, `wheel`, `mouse_down`, `mouse_up`, `mouse_move`, `drag`, `drag_select`,
`selected_text`, `painted_highlights`, `clock_*` and `wait_for` is the same code the scroller test
already contains, moved into `src/test.ts`.

### C. Window size and insets

No native resize event exists in 0.7.0. gpuix-solid's [`useWindowSize`][window-size] and
`useWindowInsets` poll `getWindowSize()` and `getWindowInsets()` every 100 ms while a component
reads them, compare structurally so an unchanged size does not retrigger, and derive
`keyboardVisible` and `visibleHeight` from the IME and effective insets. We call
`getWindowSize()` only in tests and never call `getWindowInsets()`; the liquid-glass example
hand-passes a `padTop` prop for its transparent titlebar, and Substrate cannot react to a resize.

The Svelte shape is a `createSubscriber` from `svelte/reactivity` (exported by the vendored
build): a poll that starts on the first tracking read and stops after the last effect dies,
exposed as getter objects `window_size` and `window_insets` from `src/window.ts`. Reads outside an
effect stay synchronous FFI reads. Headlessly `getWindowInsets` does not exist, so insets degrade
to zeros like the other `window.ts` helpers.

### D. Debug frame overlay

Native exposes `setDebugFrameOverlay('hidden' | 'minimal' | 'full')`,
`cycleDebugFrameOverlay()` and `getDebugFrameOverlayStats()` on both renderers. gpuix-solid takes
`debugFrameOverlay` as a [`render()` option][render-opts]. We wire none of it. A
`debugFrameOverlay` field on `RenderOptions`, a `GPUIX_DEBUG_OVERLAY` environment variable beside
`GPUIX_SCREENSHOT`, and three wrappers in `src/window.ts` cover it.

### E. Text search

gpuix-solid's [`useTextSearch`][text-search] builds the native `highlight` spec
(`query`, `activeIndex`, `caseSensitive`, `wholeWord`, `color`, `activeColor`, `radius`) from a
query, reads `matchCount` from the `highlight` event, and exposes `total`, `active`, `next()`,
`previous()` and `goTo()`. Highlighting itself is native. It also ships `findRanges`, a JS
reimplementation of the native matcher with a UTF-16 case-fold index map.

We forward `highlight` on `div` and `text` and fire `onhighlight` with `e.matchCount`, but every
app writes the spec by hand; Substrate computes its own ranges in `lib/rank.ts` and uses the
`{ ranges, color, radius }` form. A small runes class (`query`, `total`, `active`, `spec`,
`on_highlight`, `next`, `prev`, `go_to`) spread as `highlight={search.spec}
onhighlight={search.on_highlight}` gives the same ergonomics. `findRanges` is not worth porting:
native matches, `getPaintedHighlights()` exposes the result to tests, and Substrate's multi-term
ranking is a different algorithm.

### F. Live automation

This is the largest gap and the most interesting one. gpuix-solid's [`gpuix-solid/automation`][automation]
has three layers:

- A `Locator` and `App` API: `getByTestId`, `getByText`, `getByType` (chained locators scope to
  descendants), `click`, `hover`, `wheel`, `dragTo`, `dragBy`, `fill`, `press`, `textContent`,
  `waitFor`; `app.mouse.*`, `app.clock.*`, `app.screenshot()`.
- An `AutomationBackend` interface with an in-process implementation over the test renderer and a
  [live implementation][live-backend] over the production `GpuixRenderer` that calls `tick()`
  after every input so the effect is painted before the reply.
- A stdio transport: SSE-framed JSON requests with numeric ids, validated with zod, fourteen
  methods (`initialize`, `getTree`, `getBounds`, `click`, `mouseMove`, `mouseDown`, `mouseUp`,
  `scrollWheel`, `keystrokes`, `screenshot`, four clock calls). The app
  [auto-serves it][auto-serve] when `process.stdin.isTTY` is false, and
  [`launch({ command })`][launch] spawns the app and returns an `App` bound to its pipes.

Their roadmap still lists live `fill()` and `press()` as blocked on the production renderer
exposing keystroke simulation ([ROADMAP.md][roadmap-35]). That was true on 0.6. On 0.7.0 the
live `GpuixRenderer` has `simulateClick`, `simulateMouseDown`, `simulateMouseUp`,
`simulateMouseMove`, `simulateScrollWheel`, `simulateKeystrokes`, `getAutomationTree()` (a JSON
tree with last-paint bounds), `getElementBounds`, `getPaintedText`, `getSelectedText`,
`captureScreenshot` and the clock, so the whole design works against our pin.

Why it matters for us: an external process can click, type, scroll, screenshot and read the
tree of a running window. That covers CI against a real window, and it lets a coding agent drive
the app instead of reading a `GPUIX_SCREENSHOT` PNG. Our only equivalent today is that PNG.

The Svelte port differs in three places. No zod and no `eventsource-parser` (the package allows no
new dependencies), so the wire is newline-delimited JSON with a hand-rolled per-method validator.
Enabling is an explicit `GPUIX_AUTOMATION=1` rather than TTY sniffing: stdin is not a TTY under
CI, `nohup`, an agent's shell, or `scripts/demo-all.ts` fanning four children out on one inherited
stdin, and in that mode stdout becomes the wire and `console.log` moves to stderr. And a live input
waits two frames before replying, because the native event callback lands on a later event-loop
turn and the second `tick()` paints the committed batch. The headless backend delegates to the
existing `src/test.ts` helpers so there is one hit-test path.

### G. Tooltip and Popover on `<anchored>`

gpuix-solid's Tooltip, Select and Combobox share a [`FloatingLayer`][floating]: a native
`<anchored side align gap offset fit="snap" snapMargin deferred priority occlude>` wrapping a
`div`, with a Radix-like vocabulary (`sideOffset` → `gap`, `alignOffset` → `offset`,
`collisionPadding` → `snapMargin`). [`Tooltip`][tooltip] adds `delayDuration`, a skip-delay
window and an 80 ms close grace so the pointer can travel onto the tip.

We list `anchored` in `GPUI_TAGS` and document its props in the README, but nothing in the repo
uses it. Substrate positions its search popover by measuring the input with `getElementBounds`
and rendering into a `Portal`. Two native facts, verified in `anchored.rs`, shape a port:

- An `<anchored>` with no `position` prop hangs off its parent's box
  ([`wrap_at_trigger`][anchored-wrap]); `position={{ x, y }}` switches to window coordinates.
- Native paints an opaque `#1a1a1a` surface behind an `<anchored>` whose own style has no
  non-transparent background ([`has_fill`][anchored-fill]). gpuix-solid works around it by giving
  the element `#00000001` ([anchored-surface-compat.ts][anchored-compat]); a class rule on the
  `<anchored>` itself does the same here.

A `Tooltip.svelte` (wrapper with `hitbox="self"`, `onmouseenter`/`onmouseleave`, the hover
handlers handed to the trigger snippet) and a controlled `Popover.svelte` (`open`, `onclose`,
`onmousedownoutside` on the panel, Escape through `on_window_key`) are the natural shapes. A
headless probe that asserts the anchored child's bounds against its trigger should come first,
since none of this has run through our pipeline yet.

### H. Style parity

gpuix-solid's [`normalizeStyleMutation`][normalize] rewrites `overflow: auto` to `scroll`,
converts `rem` at ×16 (GPUI's rem size is fixed at 16 px and gpuix never changes it), resolves
`em` against the element's own font size, and collapses `max-content`, `min-content` and
`fit-content` to `auto`. Native matches only `scroll` and `hidden` for `overflow`, so our
`overflow: auto` currently passes validation and is ignored. `rem` and the intrinsic keywords are
dropped with a warning. Adopting the `overflow`, `rem` and intrinsic-size rewrites is a few lines
in `src/style.ts`; `em` is not worth it, since CSS `em` means the inherited size, which the
renderer cannot see. The README, CLAUDE.md, the tutorial's styling quiz and the styling
playground all state that `rem` is unsupported and would change together.

### I and J. Benchmarks and a parity table

gpuix-solid ports the upstream chat (1,000 turns) and timeline (24 tracks) workloads and adds a
serialization benchmark that measures JSON encoding and UTF-8 conversion of the real mutation
tuples. We have no numbers at all. Its `UPSTREAM.md` and `docs/upstream-parity.md` also keep a
table of native capability versus exposed API. For us that table would list the natives nobody
wraps yet: `getWindowInsets`, `focusNext`, `focusPrevious`, `getSelectedText`, `clearSelection`,
`scrollTo` (used inside `Scroller`, not public), `getAutomationTree`, the clock and the debug
overlay.

## Not worth porting

- **The Solid 1 DOM-compatibility layer.** It exists so Kobalte's real source runs unchanged. No
  Svelte headless-UI library is DOM-free enough to benefit, and the layer is most of that package.
- **The Tailwind and CSS-module manifest compilers.** They exist because the Solid renderer has no
  CSS text path. Our `<style>` blocks already compile to class rules; a Tailwind-to-`define_styles`
  compiler could be a later idea, not a port.
- **`applyMacCpuThrottleFromEnv`.** A macOS-only `taskpolicy` re-exec for benchmarks.
- **zod and SSE framing.** Both violate the package's no-dependency rule and neither is needed for a
  line-delimited local pipe.
- **Per-root id allocators and the no-globals rule.** Native supports one window, and our
  monotonic ids are what make hot remounts safe.

## Native surface neither renderer exposes

For completeness, what the 0.7.0 napi surface offers that both projects leave alone:
`focusNext()` and `focusPrevious()` (Tab no longer moves focus since 0.7, so an app has to call
these itself), `clearSelection()`, and the application menu (fixed Quit, Hide and Services items
in `app_menu.rs`, not configurable from JS). Clipboard and cursor APIs do not exist natively;
Substrate shells out to `pbcopy` and `pbpaste`.

## Sources

gpuix-solid at `cd72e84`:

[mutations-flush]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/host/mutations.ts#L121-L164
[mutations-retain]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/host/mutations.ts#L159-L163
[adopt]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/host/nodes.ts#L456-L496
[contextmenu]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/host/events.ts#L287-L289
[frame-loop]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/frame-loop.ts#L12-L41
[animate]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/components/animate.ts#L36-L47
[floating]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/components/floating.ts#L293-L310
[tooltip]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/components/tooltip.ts#L92-L162
[window-size]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/hooks/use-window-size.ts#L40-L74
[text-search]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/hooks/use-text-search.ts#L25-L88
[render-opts]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/runtime.ts#L46-L50
[testing]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/testing.ts#L159-L249
[locator]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation.ts#L211-L326
[automation]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation/index.ts
[live-backend]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation/server.ts#L48-L121
[auto-serve]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/runtime.ts#L29-L36
[launch]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation/stdio.ts#L259-L289
[roadmap-35]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/ROADMAP.md#L81
[normalize]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/host/mutations.ts#L219-L276
[portal]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid1/src/native-portal.ts#L76-L97
[svg]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid1/src/svg-layout-compat.ts#L49-L109
[mo]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid1/src/dom-environment.ts#L604-L644
[anchored-compat]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid1/src/anchored-surface-compat.ts#L23-L29

`@gpuix/native` at the `@gpuix/native@0.7.0` tag:

[native-click]: https://github.com/remorses/gpuix/blob/@gpuix/native@0.7.0/packages/native/src/renderer.rs#L4354-L4404
[anchored-wrap]: https://github.com/remorses/gpuix/blob/@gpuix/native@0.7.0/packages/native/src/custom_elements/anchored.rs#L179
[anchored-fill]: https://github.com/remorses/gpuix/blob/@gpuix/native@0.7.0/packages/native/src/custom_elements/anchored.rs#L309-L316
