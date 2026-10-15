# Testing headlessly

`TestGpuixRenderer` runs the real GPU pipeline (Metal on macOS, DirectX on Windows) without opening
a window, and `gpuix-svelte/test` wraps the mount, settle and input loop around it. A test is a
plain script that you run through the bin, as in `gpuix-svelte test.ts`:

```js
import { mount_headless, click_test_id, press, all_text, check, finish } from 'gpuix-svelte/test';
import Counter from './Counter.svelte';

mount_headless(Counter, { width: 400, height: 300 });
click_test_id('plus'); // getElementBounds → simulateClick → drainEvents → dispatch → settle
press('cmd-k');
check('the click reached the counter', all_text().includes('1'));
finish('counter', 1); // prints the verdict; exits 1 on a failed check or a wrong count
```

`check(label, actual, expected = true)` compares the two as JSON and prints `ok` or `FAIL`.
`finish(name, expected)` exits 1 if any check failed, or if the number of checks that ran differs
from `expected`. That count is what catches assertions that quietly stopped running, so bump it
when you add or remove a check. Leave it out, and `finish` only asks for at least one.

## Mounting, reading and clicking

`mount_headless(Component, { props, width, height })` mounts the component and settles.
`settle()` runs Svelte's effects, ships the batch and lets GPUI paint. For timers and promises,
`await wait(ms)` waits and then settles.

To read the tree, `find_text`, `find_test_id`, `element_of` and `tree()` go through
`getTreeJson()`, where a node carries its `testId`. `painted()`, `all_text()`, `bounds()`
(`{ x, y, width, height }`) and `screenshot(path)` read back what GPUI drew.

For input, `click`, `click_text`, `click_test_id`, `click_at`, `press`, `type` and
`drop_files(target, paths)` go through GPUI's real hit testing and input pipeline. Calling
`dispatch()` at an element skips hit testing and can pass while the real window fails, so reach
for these helpers first.

The headless viewport has two limits. On macOS it's at most 538 px tall (`MAX_HEADLESS_HEIGHT`),
so keep test layouts short; `click` tells you when a target falls outside. Windows ignores the
requested size and opens 1024×749, so assert against `native.getWindowSize()`. The headless
renderer also emits no `focus`/`blur` events (a real window does), so `focus()` and `unfocus()`
stand in for them.

## Every other input

Every other input native can simulate has a helper too. Each takes a node (aimed at its centre) or
a `{ x, y }` point in window coordinates:

- `hover(target)`, `mouse_move(target, { pressed_button })` (a move with a button held is a drag
  move), `mouse_down` and `mouse_up`.
- `wheel(target, dx, dy)`, where a negative `dy` scrolls down.
- `drag(from, to, { steps })`: a press, `steps` moves with the button held, then a release.
- `drag_select(from, to)`, which returns the selected text. `selected_text()` reads the selection
  and `clear_selection()` clears it.
- `key_up(keystroke)`, the key-up half that `press()` leaves out.

Each one, like `click`, ends in `pump()`, which drains and settles until native queues nothing
more. A paint can report events of its own, such as a hover change or a finished motion, and
`pump()` catches those. `center(target)` and `point_of(target)` are the targeting the helpers
share. A scroll container's bounds move with its own offset, so aim repeated wheels at a point you
measured before scrolling.

`painted_highlights()` reads back `highlight` washes with their rects. `automation_tree()` is
`getAutomationTree()` parsed: it has last-paint `bounds` on every node but no `style` or `events`,
the reverse of `tree()`.

## Time

`clock_pause()`, `clock_set(ms)`, `clock_fast_forward(ms)` and `clock_resume()` drive the clock
that `motion` animates on, and each returns the clock's time. `advance_time(ms)` runs GPUI's own
executor timers (caret blink, drag autoscroll). `setTimeout` and promises keep real time, so for
code that waits on those, `await wait_for(() => find_text('ready'), { timeout, interval, label })`
polls, pumping between tries, and rejects with the label once the timeout (2000 ms by default)
passes.

## Driving a running app

`gpuix-svelte/automation` is `@gpuix/native/automation`'s Playwright-style `App` and `Locator`,
wired to this renderer in two ways. `launch()` starts an app and drives its real window from
another process, and `test_app()` runs the same script against whatever `mount_headless` mounted.

```js
import { launch } from 'gpuix-svelte/automation';

const app = await launch({ entry: 'src/main.ts' }); // bun: true runs the app on Bun
for (let i = 0; i < 3; i++) await app.getByTestId('plus').click();
await app.getByText('3 clicks').waitFor();
await app.screenshot({ path: '/tmp/counter.png' });
await app.close(); // ends the app's stdin; it answers what is in flight and exits 0
```

Run the driver through the bin like any test (`npx gpuix-svelte drive.ts`). Locators re-resolve on
every call:

- `getByTestId`, `getByText` (a substring of a text node) and `getByType` chain, scoping to
  descendants.
- `element()` throws an `AutomationError` whose `code` is `NotFound` or `Ambiguous`.
- `click`, `hover`, `wheel`, `dragTo`, `dragBy`, `fill`, `press`, `textContent` and
  `waitFor({ timeoutMs })` act on the single match, and `count()` counts the matches.
- `app.mouse`, `app.clock` and `app.screenshot()` cover the rest, and `app.process` is the app's
  child process. If the app is still running two seconds after `close()`, it gets killed.

`launch()` runs the entry through the `gpuix-svelte` bin with `GPUIX_AUTOMATION=1`. That variable
is the one switch for the automation server; `0` or an empty value leaves it off. Under it,
**stdout carries the protocol**. `console.log`, `info` and `debug` move to stderr, which
`launch()` passes through, so don't write to `process.stdout` yourself. When stdin ends, the app
answers whatever is in flight and exits. Each input replies once its effect is laid out, so a read
straight after a click sees the result.

Any language can drive it. Requests and replies are SSE `data:` frames of JSON with numeric ids,
the methods are the ones listed in `@gpuix/native/automation`'s `methods`, and a request that
can't be parsed but carries an id gets a `Protocol` error back:

```sh
printf 'data: {"id":1,"method":"initialize","params":{"protocolVersion":1,"client":"sh"}}\n\ndata: {"id":2,"method":"getAllText","params":{}}\n\n' \
  | GPUIX_AUTOMATION=1 npx gpuix-svelte src/main.ts 2>/dev/null
```

Headlessly, `test_app()` (from the same module) returns that `App` over `TestGpuixRenderer`. Every
input goes simulate → `drainEvents` → `dispatch` → `settle`, pointer input outside the viewport
throws `NotFound`, and each read settles first, so `waitFor` sees an update that lands on a timer.
