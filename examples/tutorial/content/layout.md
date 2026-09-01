Layout is flexbox (GPUI uses the Taffy engine), plus grid with a column count. The patterns every demo in this repo is built from:

- **Rows and columns**: `display: flex; flex-direction: row | column` with `gap`, `align-items`, `justify-content`. A `div` without `display: flex` just stacks its children top to bottom.
- **Filling space**: `flex-grow: 1` (never `flex: 1`). Add `min-height: 0` or `min-width: 0` on a growing child that must be allowed to shrink, exactly as in the browser.
- **Scrolling**: `overflow-y: scroll` on an element with a bounded height — a `flex-grow: 1` child of a column that itself has a height, or `height: 100%`. The window is the only bound at the top, which is why every root sets `width: 100%; height: 100%`.

Two rules that have no browser equivalent:

- **One vertical scroller per ancestor chain.** A scroller inside a scroller is not supported. Siblings are fine (this window has two), and horizontal scrollers such as `<code>` blocks may sit inside a vertical one.
- **No scrollbars are painted.** The thumbs on both panels here are drawn by `examples/tutorial/Scroller.svelte`: it reads `getElementBounds()` and `getScrollOffset()` through `get_native()` and calls `scrollTo()` while you drag.

Because the preview on the right is itself a scroller, the right panel does not scroll on this step.
