# Improvements suggested by building Substrate

Notes from building `examples/second-brain` (Substrate, ~30 components, a data layer, a worker
process and a macOS bundle) in one sitting. The renderer held up: hot reload with a shared
`props` object, `<style>` class rules, `<markdown>`, and the headless renderer with real hit
testing were the reasons it came together. The friction was almost all "the same fifteen
lines again in every component". Ranked by how much each would have saved.

## 1. Runtime CSS variables in `<style>` rules

**Pain.** Theming forced a `.card.light { … }` / `.card.dark { … }` pair, plus `:hover`
variants, in every one of ~25 components, because class rules are compiled and cannot read
tokens at runtime. The palette lives in `lib/theme.js` and is duplicated as hex literals in
every `<style>` block.

**Proposal.** Let `class_rules()` substitute `var(--surface)` from a global map when a rule is
applied, and add `set_css_vars({ surface: '#fbf7ef', … })` that restyles every element
carrying classes. A theme becomes one object and a component carries one rule:

```css
.card { background-color: var(--surface); border-color: var(--border); }
.card:hover { background-color: var(--raised); }
```

The single biggest win.

## 2. A shipped `Scroller` component, or native scrollbars

**Pain.** The tutorial, the styling playground and Substrate each carry a copy of the same
80-line scroller that measures bounds, draws a thumb and handles the drag overlay.

**Proposal.** Export it from the package (`gpuix-svelte/components/Scroller.svelte`), with
the `follow` mode Substrate added for streaming content and a `pad`/`gap` API. Better still,
have `@gpuix/native` paint a scrollbar for `overflow: scroll` so no component is needed.

## 3. Hit-testing defaults

**Pain.** Every icon, badge, label and thumbnail inside a clickable card needs
`pointer-events: none`, or it swallows the click meant for the card. This is the most common
bug class, and it is invisible until a click does nothing.

**Proposal.** An opt-in attribute on the clickable element, say `hitbox="self"`, that the
renderer applies as `pointerEvents: none` to every descendant without listeners of its own.

Same family: `<svg>` inherits no `color`, so every icon needs an explicit colour or it paints
a default grey. The renderer could resolve the nearest ancestor's `color` when the svg has none
(the shadow tree knows its parents), or the native side could inherit it.

## 4. A test helper module

**Pain.** Each headless test re-implements `settle()` (flushSync → commit → flush),
`find_text()` over `getTreeJson()`, `click_text()` (bounds → `simulateClick` → `drainEvents`
→ `dispatch`), and painted-text assertions. `getTreeJson()` does not expose `testId`, so tests
locate elements by their text.

**Proposal.** A `gpuix-svelte/test` export with `mount_headless(Component, props)`, `settle()`,
`find_text()`, `click_text()`, `press(key, modifiers)`, `painted()`; `testId` in the tree JSON;
and no-op `setWindowTitle`, `activateWindow` and friends on `TestGpuixRenderer` so app code
does not need `get_native()?.setWindowTitle?.()` guards.

## 5. Window-level keyboard and focus helpers

**Pain.** ⌘K-style shortcuts mean an `autofocus tabindex="0"` root `div` with `onkeydown`,
and refocusing that root after every action, because `<input>` and `<textarea>` steal focus
and never give it back.

**Proposal.** `setWindowKeyEvents` exists natively but is not wired; a `render({ onKeyDown })`
option (or `on_window_key()` from the package) plus a `focus_root()` helper would replace the
dance. A documented way to blur an input back to the app would round it out.

## 6. A `Portal` for overlays

**Pain.** Paint order is document order, so modals and toasts must be the last children of the
root. That pushes a `<Modal />` slot into `App.svelte` and a `ui.confirm()` promise store into
a module, instead of the component that needs a dialog just rendering one.

**Proposal.** A `<Portal>` component that reparents its children to the end of the root, or a
documented wrapper over the native `anchored deferred` element, whose props
(`position side align anchor gap offset fit snapMargin deferred priority occlude`) are not
described anywhere yet.

## 7. A runner that bakes in the flags

**Pain.** Every script repeats
`--conditions custom-renderer --conditions development --import ./src/register.js`, and the
`bun:` twins repeat it again. External projects have to learn this before anything renders.

**Proposal.** A `gpuix-svelte` bin (`gpuix-svelte main.js`, `--bun`), essentially
`scripts/run-example.js` published. Related: `render_hot` only watches `.svelte`; a change to a
`.svelte.js` state module or a plain `.js` file should at least log "restart needed", since
those are deliberately not cache-busted.

## Smaller notes

- `left: 0%` (any `%` on a pixel-only key) is silently dropped with a one-time warning; the
  warning saved a debugging round, but a `%`-capable `left`/`top` would be natural for progress
  bars and sliders.
- `bind:` being refused is fine once `value={x} onchange={(e) => (x = e.value)}` and `e.value`
  are known; the tutorial says it, the README should too.
- `.svelte.js` runes modules now compile (added during this build) and are loaded once per
  process, which makes them the natural place for state that survives a hot remount. Worth a
  section in the README.
- lol-html's `onEndTag` keeps one callback per element, and the element handle is dead inside
  it — a Bun `HTMLRewriter` gotcha, not a renderer one, but the page extractor in
  `examples/second-brain/lib/scrape.js` is the reference for working around it.
