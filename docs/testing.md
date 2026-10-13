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

Every other input native can simulate has a helper too, taking a node (its centre) or a `{ x, y }`
point in window coordinates: `hover`, `mouse_move` (`{ pressed_button }` makes it a drag move),
`mouse_down`, `mouse_up`, `wheel(target, dx, dy)` (negative `dy` scrolls down), `drag(from, to,
{ steps })` (press, `steps` moves with the button held, release), `drag_select(from, to)` (returns
the selection), `selected_text()`, `clear_selection()` and `key_up(keystroke)`. Each one, like
`click`, ends in `pump()`: drain and settle until native queues nothing more, since a paint can
report events of its own (a hover change, a finished motion). `center(target)` and `point_of` are
the targeting they share; a scroll container's bounds move with its own offset, so aim repeated
wheels at a point measured before scrolling. `painted_highlights()` reads back `highlight` washes
with their rects, and `automation_tree()` is `getAutomationTree()` parsed: last-paint `bounds` on
every node but no `style` or `events`, the reverse of `tree()`.

Time is controllable: `clock_pause()`, `clock_set(ms)`, `clock_fast_forward(ms)` and
`clock_resume()` drive the clock `motion` animates on and return its time, and `advance_time(ms)`
runs GPUI's own executor timers (caret blink, drag autoscroll) — neither touches `setTimeout`. For
those, `await wait_for(() => find_text('ready'), { timeout, interval, label })` polls, pumping
between tries, and rejects naming the label once the timeout (2000 ms) passes.
