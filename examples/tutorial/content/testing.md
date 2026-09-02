`TestGpuixRenderer` from `@gpuix/native` runs the real Metal pipeline without opening a window, so the renderer's own tests are plain scripts: mount, poke, assert, exit 1 on failure — no test runner. `gpuix-svelte/test` is the loop the window runs, packaged:

1. `mount_headless(Component, { props, width, height })` — `set_native(new TestGpuixRenderer(width, height))`, `create_root()`, a comment anchor, `mount()`, and a first `settle()`.
2. `settle()` after every change: `flushSync()` → `commit()` → `native.flush()`. The last one runs GPUI until layout and paint are done. `await wait(ms)` first when the update comes from a timer or a promise.
3. To interact, `click_text('Save')`, `click_test_id('plus')`, `press('cmd-k')` and `type('h i')` go through GPUI's real hit testing and input pipeline — `simulateClick`, then `drainEvents()` fed to `dispatch()`. Calling `dispatch()` directly bypasses hit testing and can pass while the real window fails.
4. Read back with `all_text()`, `painted()`, `tree()` (`getTreeJson()` parsed — every node carries its `testId`), `find_text()`, `find_test_id()`, `bounds()`, or `screenshot(path)`. `check(label, actual, expected)` and `finish(name)` are the assertion and the exit code.

The headless viewport's height caps at 538 logical px: anything laid out below cannot be hit (`click` says so), so keep test layouts short. On Linux the test renderer is not compiled; `mount_headless` throws.

### Where to go next

- `npm run demo` — the four demos, each a different corner of the renderer.
- `npm run demo:styling` — every style string next to what GPUI made of it.
- `CLAUDE.md` — the architecture notes, including the mutation contract.
- [The Svelte custom-renderer PR](https://github.com/sveltejs/svelte/pull/18511) this is all built on.

Your quiz score is in the footer. Thanks for reading!
