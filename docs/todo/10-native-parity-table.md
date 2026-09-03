# 10. A native-surface parity table

| | |
|---|---|
| Candidate | J in `docs/comparison-gpuix-solid.md` |
| Size | S: one doc of about 120 lines, an optional 60-line script |
| Depends on | nothing; refresh it after tasks 1 to 9 land |
| Unblocks | seeing at a glance what a native bump adds that the package does not expose yet |
| Line numbers | as of `e729a86` |

## Goal

`docs/native-parity.md`: one table per part of the `@gpuix/native` contract (renderer methods,
window options, event types, element props) with a column for how gpuix-svelte exposes it, so a
gap is a visible empty cell rather than something rediscovered by reading `index.d.ts`.

## Background

gpuix-solid keeps [`UPSTREAM.md`][solid-upstream] (the released native baseline, the upstream
`main` watchpoint, the contract assumptions, an adoption policy) and
[`docs/upstream-parity.md`][solid-parity] (a table of published React capabilities against
their status, plus an example parity table). Solid 1 has a
[`check-host-parity.ts`][solid-check] script run as its `test`.

Here the equivalent knowledge is spread across CLAUDE.md prose ("Hard constraints", the
`@gpuix/native` range, "Regenerating README's styling reference") and README's two styling
`<details>` lists. Nothing lists native methods against wrappers.

Known state at 0.7.0 (from the comparison; verify while writing):

| Native (index.d.ts) | gpuix-svelte |
|---|---|
| `init`, `applyBatch`, `tick`, `requiresTick`, `captureScreenshot` | `render.ts` / `renderer.ts` |
| `setWindowTitle`, `activateWindow`, `blur`, `focusElement` | `src/window.ts` |
| `setWindowKeyEvents` | `on_window_key` |
| `getWindowSize` | tests only (task 3 adds `window_size`) |
| `getWindowInsets` | nothing (task 3) |
| `setDebugFrameOverlay`, `cycleDebugFrameOverlay`, `getDebugFrameOverlay`, `resetDebugFrameOverlayStats`, `getDebugFrameOverlayStats` | Substrate's `frame-cost.ts` only (task 4) |
| `focusNext`, `focusPrevious` | nothing; Tab no longer moves focus since 0.7, so an app has to call these |
| `getSelectedText`, `clearSelection` | nothing (task 2 wraps them for tests) |
| `scrollTo`, `scrollToItem`, `getListScrollTop`, `getScrollOffset`, `getElementBounds` | `Scroller.svelte` and examples through `get_native()`; no public helper |
| `getAutomationTree` | nothing (task 6) |
| `getAllText`, `getPaintedText`, `getPaintedHighlights` | `all_text()`, `painted()`; highlights unwrapped (task 2) |
| `simulate*` (live renderer) | nothing (task 6) |
| `clock*` | nothing (task 2) |
| `TestGpuixRenderer`-only: `flush`, `drainEvents`, `getTreeJson`, `findByType`, `hasEventListener`, `getText`, `getRootId`, `dragSelect`, `advanceTime`, `getSyntaxCacheStats`, `getRetainedElementCount` | `src/test.ts` uses most; `dragSelect`, `advanceTime`, `getSyntaxCacheStats`, `findByType`, `getText` unwrapped |
| `WindowOptions` (15 fields) | all pass through `render()` |
| Event types: 20 in `GPUI_EVENTS`; native also emits `auxClick` | task 1 |
| Element props: `<input>`, `<textarea>`, `<code>`, `<diff>`, `<markdown>`, `<img>`, `<svg>`, `<virtual-list>`, `<anchored>`, `<canvas>` | forwarded verbatim; `<canvas>` documented nowhere, `<anchored>` used nowhere (task 7) |

## Design

### `docs/native-parity.md`

Sections, each a table with columns "native", "type or signature", "gpuix-svelte", "notes":

1. **Pins**: the `@gpuix/native` range and installed version, the date, and a pointer to the
   upstream tag URL pattern from CLAUDE.md ("Regenerating README's styling reference").
2. **Renderer methods**: every method of `GpuixRenderer` and `TestGpuixRenderer` from
   `node_modules/@gpuix/native/index.d.ts`, grouped as above.
3. **Window options**: the `WindowOptions` fields and that `RenderOptions` extends them, plus
   the package-owned fields (`props`, `rootStyle`, `onEvent`, `onKeyDown`, `onKeyUp`, and
   `debugFrameOverlay` after task 4).
4. **Events**: the native event strings emitted by `renderer.rs` (grep the tag's Rust for
   `emit_event_full(&callback, id, "…"`) against `GPUI_EVENTS`, plus the window-key channel.
5. **Element props**: per custom element, the props README or the tutorial document, with a
   "tested by" column naming the test that exercises them.
6. **Styles**: a pointer to README's two `<details>` lists rather than a copy.
7. **Adoption policy**: three lines, adapted from gpuix-solid's: read the native tag's
   changelog, d.ts and Rust before bumping the range; move tests first; update this table in the
   same change as the version.

### `scripts/native-parity.ts` (optional, `npm run parity`)

Keeps the method table honest: parse `index.d.ts` for method names on the two classes (a regex
over `^  name(` lines is enough), grep `src/` and `src/components/` for `.name(` or `.name?.(`,
and print the methods with no hit. Run it while writing the doc and before a native bump. Plain
`node --import tsx` script like `demo` and `vendor`; no Bun twin needed.

## Docs

- CLAUDE.md: link the doc from "Hard constraints" (the `@gpuix/native` bullet) and from
  "Regenerating README's styling reference"; Commands block for `parity` if the script is added.
- `docs/comparison-gpuix-solid.md`: replace its "Native surface neither renderer exposes"
  paragraph with a link once the table exists.

## Acceptance

- [ ] Every method in `index.d.ts` appears in the table with an accurate "gpuix-svelte" cell.
- [ ] The events section matches the strings in the 0.7.0 Rust, `auxClick` included.
- [ ] CLAUDE.md links the doc; the optional script agrees with the table.

## Sources

[solid-upstream]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/UPSTREAM.md
[solid-parity]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/docs/upstream-parity.md
[solid-check]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid1/scripts/check-host-parity.ts
