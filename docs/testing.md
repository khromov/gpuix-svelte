# Testing headlessly

`TestGpuixRenderer` runs the real GPU pipeline without a window, and `gpuix-svelte/test` wraps the
loop around it:

```js
import { mount_headless, click_test_id, press, all_text, check, finish } from 'gpuix-svelte/test';
import Counter from './Counter.svelte';

mount_headless(Counter, { width: 400, height: 300 });
click_test_id('plus'); // getElementBounds → simulateClick → drainEvents → dispatch → settle
press('cmd-k');
check('the click reached the counter', all_text().includes('1'));
finish('counter'); // prints the verdict; exits 1 on any failed check
```

`mount_headless` mounts and settles; `settle()` runs Svelte's effects, ships the batch and lets
GPUI paint (`await wait(ms)` first for timers and promises); `find_text`, `find_test_id`,
`element_of` and `tree()` read `getTreeJson()`, where every node carries its `testId`; `click`,
`click_text`, `click_test_id`, `click_at`, `press`, `type` and `drop_files(target, paths)` go
through GPUI's real hit testing and input pipeline; `painted()`, `all_text()`, `bounds()`
(`{ x, y, width, height }`) and `screenshot(path)` read back. The
headless viewport is at most 538 px tall, so keep test layouts short (`click` says when a target is
outside), and Windows ignores the requested size, so read `native.getWindowSize()` rather than
asserting the numbers you passed. The headless renderer emits no `focus`/`blur` events (a window does), so `focus()` and
`unfocus()` stand in for them. Tests are plain scripts — no runner.
