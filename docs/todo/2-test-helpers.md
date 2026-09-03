# 2. Test-harness helpers: hover, wheel, mouse, drag, selection, clock, `wait_for`

| | |
|---|---|
| Candidate | B in `docs/comparison-gpuix-solid.md` |
| Size | S: about 160 lines in `src/test.ts`, 200 of test, a fixture |
| Depends on | nothing |
| Unblocks | 6 (the headless automation backend delegates to these), 7 (hover tests), 9 (wheel and clock in benchmarks) |
| Line numbers | as of `e729a86` |

## Goal

Every input the native test renderer can simulate gets a one-call helper in
`gpuix-svelte/test`, with the same drain-and-settle discipline `click` already has, plus a
polling `wait_for`. Tests stop reaching for `native.simulate*` by hand.

## Background

gpuix-solid's [`TestRenderer`][solid-testing] wraps each native simulation as
`flush → simulate → dispatch drained events → flush`, and its [`Locator`][solid-locator] adds
`hover`, `wheel`, `dragTo`, `dragBy`, `fill`, `press`, `textContent` and a polling `waitFor`.
Its `App` has `mouse.drag` (interpolated moves with the button held) and
`clock.{pause,set,fastForward,resume}` over the native animation clock.

Our harness ([`src/test.ts`](../../src/test.ts)) has `mount_headless`, `settle`, `wait`,
`tree`, `find_*`, `element_of`, `bounds`, `drain`, `click`, `click_at`, `click_text`,
`click_test_id`, `press`, `type`, `focus`, `unfocus`, `painted`, `all_text`, `screenshot`,
`check`, `finish`. Gaps:

- `test/scroller.ts` calls `native.simulateScrollWheel`, `simulateMouseDown`,
  `simulateMouseMove`, `simulateMouseUp` directly, each followed by `drain(); settle();`
  ([lines 26-47 and 68-96](../../test/scroller.ts#L26-L96)).
- `test/window-keys.ts:36-38` calls `native.simulateKeyUp` by hand.
- `clockPause`, `clockSet`, `clockFastForward`, `clockResume`, `advanceTime`, `dragSelect`,
  `getSelectedText`, `clearSelection`, `getPaintedHighlights` and `getAutomationTree` exist on
  the native handle and are wrapped nowhere. Time is advanced with real `await wait(ms)`.
- There is no `wait_for`; tests re-query after a fixed `wait`.

Native facts, probed on `TestGpuixRenderer` 0.7.0:

- `clockPause()` returns the current ms; `clockSet(1000)` → 1000; `clockFastForward(500)` → 1500;
  `clockResume()` → 1500.
- `dragSelect(x1, y1, x2, y2)` then `getSelectedText()` works headlessly.
- `getPaintedHighlights()` returns `{ elementId, sub, text, start, end, active, rects }` entries.
- `simulateMouseMove` with no listener queues nothing; with an `onmouseenter` the event arrives
  on `drainEvents()`.
- `getAutomationTree()` returns `{ type, id, testId?, text?, bounds: { x, y, width, height },
  children? }`, with bounds as an object and **no** `style` or `events`. `getTreeJson()` has
  style and events and no bounds. Keep both: `tree()` stays on `getTreeJson()`.
- A clipped node still reports bounds outside the window. "Unhittable" is judged against
  `getWindowSize()`, as `click` does today at [`src/test.ts:167-172`](../../src/test.ts#L167-L172).

## Design

All synchronous, snake_case, in `src/test.ts`:

```ts
export interface Point { x: number; y: number }
export type PointTarget = Target | Point;             // a node/id (its centre) or window coordinates
export interface MouseOptions { button?: number; modifiers?: string }
export interface MoveOptions { pressed_button?: number; modifiers?: string }
export interface DragOptions extends MouseOptions { steps?: number }          // default 8
export interface WaitForOptions { timeout?: number; interval?: number; label?: string }  // 2000 / 16

export function center(target: Target): Point;        // bounds → centre + the viewport check lifted out of click()
export function point_of(target: PointTarget): Point; // a Point passes through, else center()
export function pump(): void;                         // drain(); settle(); repeated until drainEvents() is empty

export function hover(target: PointTarget, opts?: MoveOptions): void;       // simulateMouseMove, no button
export function mouse_move(target: PointTarget, opts?: MoveOptions): void;
export function mouse_down(target: PointTarget, opts?: MouseOptions): void;
export function mouse_up(target: PointTarget, opts?: MouseOptions): void;
export function wheel(target: PointTarget, delta_x: number, delta_y: number, opts?: { modifiers?: string }): void;
export function drag(from: PointTarget, to: PointTarget, opts?: DragOptions): void;
   // move to `from`, down, `steps` interpolated moves with pressed_button, up; pump() after each
export function drag_select(from: PointTarget, to: PointTarget): string | null;  // native.dragSelect + pump → selected_text()
export function selected_text(): string | null;
export function clear_selection(): void;
export function painted_highlights(): HighlightMatch[];                          // type from @gpuix/native
export function key_up(keystroke: string): void;

export function clock_pause(): number;
export function clock_set(now_ms: number): number;
export function clock_fast_forward(delta_ms: number): number;
export function clock_resume(): number;
export function advance_time(ms: number): void;        // native.advanceTime (GPUI's TestDispatcher timers), then pump()

export async function wait_for<T>(pred: () => T, opts?: WaitForOptions): Promise<NonNullable<T>>;
   // await a timer of `interval`, settle(), until pred() is truthy; rejects with
   // `[gpuix-svelte/test] wait_for(<label>) timed out after <n> ms`

export function automation_tree(): AutomationNode | null;   // parsed getAutomationTree(); type lives here until task 6 moves it
```

Notes:

- Every clock helper calls `native().flush()` afterwards so the frame repaints at the new time.
- `pump()` replaces the `drain(); settle();` pairs inside `click_at`, `press` and `type`
  ([`src/test.ts:178-208`](../../src/test.ts#L178-L208)). Events emitted during the paint (hover
  state changes) currently sit in the queue until the next call. `drain()` stays exported.
- `center()` keeps the existing viewport error message including the "(its height caps at
  538)" hint on macOS, so `click` behaviour is unchanged.
- `Target` already accepts `{ id }`, so an `AutomationNode` passes to `click`, `bounds` and the
  new helpers unchanged.

Refactors:

- `test/scroller.ts`: replace the raw calls with `wheel(column(), 0, -120)`, `mouse_down(thumb())`,
  `mouse_move({ x, y: y + 40 })`, `mouse_up(...)`. Keep the down/move/up split where the test
  asserts state between them.
- `test/window-keys.ts:36-38`: `key_up('b')`.

## Tests

New `test/helpers.ts` with fixture `test/Helpers.svelte`, script `test:helpers` plus the Bun
twin, chained into both `test` scripts. Fixture (about 60 lines): a `testid="hover"` box with
`onmouseenter`/`onmouseleave` writing state text; an `<input testid="field">` echoing its value
through `onchange`; two lines of text for `drag_select`; a text with `highlight={{ query }}`; a
`motion` box animating `left` 0 → 200 over 1 s; an `overflow: scroll` column; a text that flips
to "ready" on a 100 ms timer.

Checks, in the repo's phrasing:

- "hover fires mouseenter through the real hit test" and "moving away fires mouseleave".
- "wheel over the column scrolls it" (`getScrollOffset` changes).
- "a drag reports the pressed button on every move".
- "drag_select returns the text between the two points", "selected_text agrees",
  "clear_selection empties it".
- "painted_highlights reports the match and its rect".
- "clock_pause + clock_fast_forward lands the motion at its end" (bounds `x` ≈ 200). If `motion`
  turns out to ignore the clock, downgrade to asserting the clock values round-trip and note it.
- "wait_for resolves when the timer flips the text" and "rejects with the label after the
  timeout".
- "center() outside the viewport names the cap".
- The existing `test:scroller` and `test:window-keys` still pass after the refactor.

## Docs

- README, "Testing headlessly" (line 436): extend the helper list.
- CLAUDE.md, the "Headless tests go through `gpuix-svelte/test`" paragraph: list the new
  helpers and `pump()`; Commands block: the `test:helpers` line.

## Constraints

- No new dependencies; `node:*` only; strict tsc with `erasableSyntaxOnly`.
- Comments only for a why (the two-tree split, the flush after clock calls).
- Run headless tests with the Bash sandbox off.

## Acceptance

- [ ] All helpers exported from `gpuix-svelte/test` with the signatures above.
- [ ] `test/scroller.ts` and `test/window-keys.ts` use them; no `native.simulate*` left in
      `test/` except where a test deliberately exercises the raw call.
- [ ] `test:helpers` passes on Node and Bun; `npm test` and `npm run bun:test` green.
- [ ] README and CLAUDE.md list the helpers.

## Sources

[solid-testing]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/testing.ts#L159-L249
[solid-locator]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation.ts#L211-L326
