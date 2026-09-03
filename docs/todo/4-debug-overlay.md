# 4. Debug frame overlay as a render option

| | |
|---|---|
| Candidate | D in `docs/comparison-gpuix-solid.md` |
| Size | XS: about 20 lines of source, 15 of test |
| Depends on | nothing (shares `test/window.ts` with task 3) |
| Unblocks | 9 (benchmarks read the overlay stats through the wrappers) |
| Line numbers | as of `e729a86` |

## Goal

Turn on GPUI's frame-cost overlay from a `render()` option or an environment variable, and
expose the overlay and its stats through `src/window.ts`, so any demo can be profiled without
code changes and scripts stop reaching for the raw handle.

## Background

Native exposes, on both `GpuixRenderer` and `TestGpuixRenderer` (`index.d.ts:49-56`,
`:289-296`):

- `setDebugFrameOverlay(mode: 'hidden' | 'minimal' | 'full'): string`
- `cycleDebugFrameOverlay(): string` (hidden → minimal → full → hidden)
- `getDebugFrameOverlay(): string`
- `resetDebugFrameOverlayStats(): void` (clears the last 1000 draw samples; frame count stays)
- `getDebugFrameOverlayStats(): { currentMs?, p90Ms?, p99Ms?, maxMs?, frames, samples }`

gpuix-solid takes `debugFrameOverlay` as a [`render()` option][solid-render] and applies it in
[`capabilities.ts`][solid-caps] (its whole content is that one call). Nothing binds a key to
cycle it.

Prior art here: `examples/second-brain/scripts/frame-cost.ts` (the "Measuring frame cost"
section of CLAUDE.md) already calls `setDebugFrameOverlay('full')`,
`resetDebugFrameOverlayStats()` and `getDebugFrameOverlayStats()` on the live renderer through
`get_native()`. The package itself wires none of it: no render option, no environment variable,
no wrapper.

## Design

- [`src/types.ts`](../../src/types.ts): `export type DebugOverlay = 'hidden' | 'minimal' | 'full';`
  and `debugFrameOverlay?: DebugOverlay` on `RenderOptions` (line 109). Widen `WindowNative`
  (line 107) with `setDebugFrameOverlay`, `cycleDebugFrameOverlay`, `getDebugFrameOverlay`,
  `resetDebugFrameOverlayStats`, `getDebugFrameOverlayStats` (task 3 adds the size and inset
  methods to the same `Pick`).
- [`src/window.ts`](../../src/window.ts):

```ts
const OVERLAYS = new Set(['hidden', 'minimal', 'full']);
const warned = new Set<string>();

export function set_debug_overlay(mode: DebugOverlay): DebugOverlay | undefined {
	if (!OVERLAYS.has(mode)) {
		// The env var path can carry a typo; warn once instead of throwing out of render().
		if (!warned.has(mode)) { warned.add(mode); console.warn(`[gpuix-svelte] unknown debug overlay "${mode}"`); }
		return undefined;
	}
	return win()?.setDebugFrameOverlay?.(mode) as DebugOverlay | undefined;
}
export const cycle_debug_overlay = () => win()?.cycleDebugFrameOverlay?.() as DebugOverlay | undefined;
export const debug_overlay_stats = () => win()?.getDebugFrameOverlayStats?.();
export const reset_debug_overlay_stats = () => win()?.resetDebugFrameOverlayStats?.();
```

- [`src/render.ts:109`](../../src/render.ts#L109): destructure `debugFrameOverlay` out of
  `options` so it never reaches `native.init(window_options)`. After the first
  `flushSync(); commit();` (lines 167-168, `set_native` has run so `win()` is the window):

```ts
const overlay = process.env.GPUIX_DEBUG_OVERLAY ?? debugFrameOverlay;
if (overlay) set_debug_overlay(overlay as DebugOverlay);
```

  The environment variable wins, sits beside `GPUIX_SCREENSHOT` (line 174), and is re-applied on
  every remount (idempotent).
- `src/index.ts`: export the four functions and the `DebugOverlay` type.
- Optional: `examples/second-brain/scripts/frame-cost.ts` can switch to the wrappers. Not
  required; it is Bun-only and already works.

## Tests

In `test/window.ts` (shared with task 3; if task 3 is not done yet, create the file with just
these checks):

- `set_debug_overlay('full') === 'full'`; `cycle_debug_overlay() === 'hidden'`.
- `typeof debug_overlay_stats()?.frames === 'number'` after a `settle()`.
- A bad mode warns once and returns `undefined` (capture `console.warn` as `test/vars.ts:22-27`
  does).
- `render()` itself opens a window, so the option and env var stay covered by `typecheck` only.
  Verify by hand once: `GPUIX_DEBUG_OVERLAY=full npm run demo:hn` shows the overlay.

## Docs

- CLAUDE.md, "Seeing what a demo renders" or "Measuring frame cost": add
  `GPUIX_DEBUG_OVERLAY=full npm run demo:hn`, and mention the wrappers.
- README, the "Window" subsection task 3 adds (or "Known limitations" if 3 is not done):
  one paragraph on the option and the stats.
- CLAUDE.md, Commands block: `test:window` if this task creates it.

## Acceptance

- [ ] `render(App, { debugFrameOverlay: 'full' })` and `GPUIX_DEBUG_OVERLAY=full` both show the overlay.
- [ ] `set_debug_overlay`, `cycle_debug_overlay`, `debug_overlay_stats`,
      `reset_debug_overlay_stats` exported and no-ops when there is no native.
- [ ] `test:window` passes on Node and Bun; typecheck and eslint clean.

## Sources

[solid-render]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/runtime.ts#L46-L50
[solid-caps]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/capabilities.ts
