# 7. `Tooltip.svelte` and `Popover.svelte` on `<anchored>`

| | |
|---|---|
| Candidate | G in `docs/comparison-gpuix-solid.md` |
| Size | M: two components of about 45 lines each, an 80-line test, a probe first |
| Depends on | nothing; task 2's `hover()` shortens the test, task 1 lets a popover close on right-click |
| Unblocks | Substrate's `SearchSuggest` moving off hand-measured bounds; tutorial coverage of `<anchored>` |
| Line numbers | as of `e729a86` |

## Goal

Two shipped components under `gpuix-svelte/components/`: a hover `Tooltip` and a controlled
`Popover`, both positioned by GPUI's native `<anchored>` element beside their trigger. This is
also the first use of `<anchored>` in the repo, so the task starts with a probe test.

## Background

gpuix-solid's Tooltip, Select and Combobox share a [`FloatingLayer`][solid-floating]: a native
`<anchored>` wrapping a `div`, with a Radix-like vocabulary mapped onto the native props
(`side` → `side`, `align` → `align`, `sideOffset` → `gap`, `alignOffset` → `offset`,
`collisionPadding` → `snapMargin` default 8) and constants `fit: "snap"`, `deferred: true`,
`priority: 1`, `occlude: true`. [`Tooltip`][solid-tooltip] adds `delayDuration` (default 0), a
`skipDelayDuration` window (300 ms) after a close during which the next open is immediate, and an
80 ms close grace so the pointer can travel onto the tip. Its trigger composes
`mouseEnter → scheduleOpen`, `mouseLeave → scheduleClose`, `mouseDown`/`click → close`,
`focus → openImmediately`, `blur → close`, `keyDown escape → close`.

Verified in native 0.7.0 `custom_elements/anchored.rs`:

- An `<anchored>` with no `position` prop wraps its layer in an absolutely positioned element
  pinned to a corner or edge of **its parent** ([`wrap_at_trigger`][anchored-wrap]); it is
  zero-sized and out of flow. `position={{ x, y }}` switches to window coordinates.
- Defaults: `side` bottom, `align` start, `gap` 0, `fit` snap, `snapMargin` 8, `deferred` and
  `occlude` true, `priority` 1.
- When the `<anchored>` element's **own** style has no non-transparent background, native
  forces `bg(0x1A1A1A)` behind the content ([`has_fill`][anchored-fill]), because deferred
  overlays paint over the window blur. gpuix-solid works around it with `rgba(0, 0, 0, 0.001)`
  or `#00000001` on the element ([anchored-surface-compat.ts][solid-anchored-compat]).

Here: `anchored` is in `GPUI_TAGS` and `INTERACTIVE_TAGS`
([`src/renderer.ts:25-54`](../../src/renderer.ts#L25-L54)) and README's "Components" section
documents its props (around lines 352-362), but nothing in `src/`, `examples/` or `test/` uses
it. Substrate's `SearchBar.svelte` measures its input with `getElementBounds` and renders
`SearchSuggest` into a `Portal` at those coordinates. Mouse events do not bubble, a painted child
occludes its parent's hitbox, and GPUI does not capture the pointer (CLAUDE.md, "Writing
components for this renderer").

## Design

### Positioning rule

Each component is a wrapper `position: relative; display: flex; align-items: start` (mirrors
`floatingRootStyle`) containing the trigger and, when open, the `<anchored>` as its sibling.
The wrapper sizes to the trigger, so the trigger's box is the anchor. `position` stays available
as a prop for window-coordinate placement.

### Fallback fill

A class rule on the `<anchored>` element itself: `.layer { background-color: #00000001; }`.
`style.ts` ships it untouched (`accepts()` passes non-numeric strings on an untyped key; the
native colour parser reads 8-digit hex).

### Trigger wiring

The wrapper carries `onmouseenter`/`onmouseleave` and `hitbox="self"`
([`renderer.ts:257-262`](../../src/renderer.ts#L257-L262)), so decorative triggers (an icon,
text, a badge) pass hover through. A trigger with its own listener keeps its hitbox and would
occlude the wrapper, so the `children` snippet receives the hover handlers to spread:

```svelte
<Tooltip content="Save (⌘S)">
	{#snippet children(hover)}
		<div class="btn" {...hover} onclick={save}>Save</div>
	{/snippet}
</Tooltip>
```

Both paths may fire for the same pointer; the timer handlers are idempotent. `<anchored>` is in
`INTERACTIVE_TAGS`, so shielding leaves it alone; the tip content (no listeners) gets
`pointer-events: none`, which is what a tooltip wants. Pass `occlude={false}` so the tip does not
block clicks beneath it.

### `src/components/Tooltip.svelte`

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	type Hover = { onmouseenter: () => void; onmouseleave: () => void };
	let {
		children, content, side = 'top', align = 'center', gap = 6, delay = 300, open = null, testid = null
	}: {
		children: Snippet<[Hover]>;
		content: string | Snippet;
		side?: 'top' | 'right' | 'bottom' | 'left';
		align?: 'start' | 'center' | 'end';
		gap?: number;
		delay?: number;
		open?: boolean | null;
		testid?: string | null;
	} = $props();

	let shown = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	// 80 ms grace on leave so moving onto the tip does not close it.
	const hover: Hover = {
		onmouseenter: () => { clearTimeout(timer); timer = setTimeout(() => (shown = true), delay); },
		onmouseleave: () => { clearTimeout(timer); timer = setTimeout(() => (shown = false), 80); }
	};
	$effect(() => () => clearTimeout(timer));
</script>

<div class="wrap" hitbox="self" {...hover} testId={testid}>
	{@render children(hover)}
	{#if open ?? shown}
		<anchored {side} {align} {gap} occlude={false} class="layer" onmouseenter={hover.onmouseenter} onmouseleave={hover.onmouseleave}>
			<div class="tip" testId={testid && `${testid}-tip`}>
				{#if typeof content === 'string'}{content}{:else}{@render content()}{/if}
			</div>
		</anchored>
	{/if}
</div>

<style>
	.wrap { position: relative; display: flex; align-items: start; }
	.layer { background-color: #00000001; }
	.tip {
		padding: 4px 8px; border-radius: 6px; font-size: 12px; line-height: 16px;
		white-space: nowrap; user-select: none;
		background-color: var(--tooltip-surface, #313244); color: var(--tooltip-ink, #cdd6f4);
	}
</style>
```

Colours follow `Scroller`'s `var(--scroller-thumb, …)` convention so a palette sets them.

### `src/components/Popover.svelte` (controlled, about 45 lines)

Props: `open: boolean`, `onclose: () => void`, `children: Snippet` (the trigger; the consumer
wires its own click, as Substrate's `Modal` does with `{#if confirming}`), `content: Snippet`,
`side = 'bottom'`, `align = 'start'`, `gap = 4`, `testid`.

Markup: the wrapper **without** `hitbox="self"` (popover content must keep its hitboxes), with
`{@attach (n) => (wrap = n)}`; then
`{#if open}<anchored … class="layer"><div class="panel" onmousedownoutside={outside}>{@render content()}</div></anchored>{/if}`.
`outside(e)` ignores a press inside `get_native()?.getElementBounds(wrap.nativeId)` (the
trigger's own click toggles; otherwise close-then-reopen races, which gpuix-solid works around
with a `dismissedByOutsidePress` latch) and calls `onclose()` otherwise.
`$effect(() => open && on_window_key('keydown', (e) => e.key === 'escape' && onclose()))`
(the `examples/second-brain/components/Modal.svelte:29` pattern). `mouseDownOutside` is a
per-element native listener, hence on `.panel`.

## Tests

`test/tooltip.ts` with fixture `test/Floating.svelte`, script `test:tooltip` plus the Bun twin,
chained into both `test` scripts. **Probe first**, because three native behaviours are
unverified on our pipeline:

1. **Anchoring.** Mount a plain trigger plus an always-open
   `<anchored side="top" align="center" gap={6}>` with a `testId` on the child. Assert with
   `bounds()`: `tip.y + tip.h + 6 ≈ trigger.y` and the tip is centred on the trigger's x. If
   `getElementBounds` returns `null` for the deferred layer, fall back to
   `native.getAutomationTree()` (last-paint bounds) or `painted()`.
2. **Hover.** `Tooltip` with `delay={50}`: `native.simulateMouseMove(cx, cy)` → `native.flush()`
   (GPUI's `on_hover` fires during the paint after the move) → `drain()`; `await wait(80)`; the
   tip is present. Move to `(2, 2)`, flush, drain, `await wait(120)`; gone. If
   `simulateMouseMove` does not produce `mouseEnter` headlessly, use `dispatch({ elementId,
   eventType: 'mouseEnter' })` for the timing checks only and keep the bounds probe real.
3. **Spread handlers.** A second instance whose trigger is a button with `{...hover}` and its own
   `onclick` proves that spread `on*` in a snippet parameter reaches `addEventListener`, and the
   click still fires.
4. **Popover**: `click_test_id('trigger')` opens; `click_at()` outside → `onclose` fired; reopen,
   `press('escape')` → closed; a click on the trigger while open closes without reopening.
5. **Fallback fill**: screenshot the open tooltip over a light background and confirm no dark
   slab (manual, or assert the `<anchored>` node's `style.backgroundColor` in `tree()`).

## Docs

- README, "Components" (line 318): "Two `.svelte` files" becomes four; a paragraph each; the
  `<anchored>` table gains "it hangs off its parent; give `<anchored>` itself a background or
  GPUI paints an opaque `#1a1a1a` behind it".
- CLAUDE.md: the Architecture tree (`components/`), the Portal/anchored bullet under "Writing
  components for this renderer", Commands block.
- `examples/tutorial/content/native-elements.md`: an `<anchored>` bullet.

## Constraints

- Style with `<style>` blocks, `var()` for colours, `style:` only for measured values.
- No comments in CSS; one why-comment for the grace timer and one for the outside-press
  bounds check.

## Acceptance

- [ ] Probe test proves parent anchoring on the real pipeline.
- [ ] `Tooltip` opens after `delay`, survives moving onto the tip, closes after leave.
- [ ] `Popover` closes on outside press and Escape, not on its own trigger.
- [ ] `test:tooltip` passes on Node and Bun; typecheck and eslint clean.
- [ ] README, CLAUDE.md and the tutorial mention both components and the fill quirk.

## Risks

Deferred-layer bounds, hover through `simulateMouseMove`, and spread `on*` in a snippet
parameter are all unverified until the probe runs; sequence the probe before writing the
components. `<anchored>` behaviour on Windows and Linux is untested here as well.

## Sources

[solid-floating]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/components/floating.ts#L234-L310
[solid-tooltip]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/components/tooltip.ts#L92-L162
[solid-anchored-compat]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid1/src/anchored-surface-compat.ts#L23-L29
[anchored-wrap]: https://github.com/remorses/gpuix/blob/@gpuix/native@0.7.0/packages/native/src/custom_elements/anchored.rs#L179
[anchored-fill]: https://github.com/remorses/gpuix/blob/@gpuix/native@0.7.0/packages/native/src/custom_elements/anchored.rs#L309-L316
