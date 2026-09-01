`TestGpuixRenderer` from `@gpuix/native` runs the real Metal pipeline without opening a window, so the renderer's own tests are plain scripts: mount, poke, assert, `process.exit(1)` on failure — no test runner.

The loop is the one the window runs, written out by hand:

1. `set_native(new TestGpuixRenderer(width, height))`, `create_root()`, a comment anchor, then `mount(Component, { renderer, target, anchor })`.
2. After every change: `flushSync()` → `commit()` → `native.flush()`. The last one runs GPUI until layout and paint are done.
3. To interact, prefer `simulateClick(x, y)` and friends — they run GPUI's real hit testing, occlusion included — then `drainEvents()` and feed each event to `dispatch()`. Calling `dispatch()` directly bypasses hit testing and can pass while the real window fails.
4. Read back with `getAllText()`, `getPaintedText()`, `getTreeJson()`, `getElementBounds(id)`, or `captureScreenshot(path)`.

The headless viewport's height caps at 538 logical px: anything laid out below cannot be hit, so keep test layouts short. On Linux the test renderer is not compiled and its constructor throws; `hasTestGpuixRenderer()` tells you beforehand.

### Where to go next

- `npm run demo` — the four demos, each a different corner of the renderer.
- `npm run demo:styling` — every style string next to what GPUI made of it.
- `CLAUDE.md` — the architecture notes, including the mutation contract.
- [The Svelte custom-renderer PR](https://github.com/sveltejs/svelte/pull/18511) this is all built on.

Your quiz score is in the footer. Thanks for reading!
