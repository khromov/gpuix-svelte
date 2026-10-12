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

## Driving a running app

`gpuix-svelte/automation` is `@gpuix/native/automation`'s Playwright-style `App` and `Locator`,
wired to this renderer twice: `launch()` starts an app and drives its real window from another
process, and `test_app()` runs the same script against whatever `mount_headless` mounted.

```js
import { launch } from 'gpuix-svelte/automation';

const app = await launch({ entry: 'src/main.ts' }); // bun: true runs the app on Bun
for (let i = 0; i < 3; i++) await app.getByTestId('plus').click();
await app.getByText('3 clicks').waitFor();
await app.screenshot({ path: '/tmp/counter.png' });
await app.close(); // ends the app's stdin; it answers what is in flight and exits 0
```

Run the driver like any test, through the bin (`npx gpuix-svelte drive.ts`). Locators re-resolve
on every call. `getByTestId`, `getByText` (a substring of a text node) and `getByType` chain to
scope to descendants; `element()` throws an `AutomationError` whose `code` is `NotFound` or
`Ambiguous`; `click`, `hover`, `wheel`, `dragTo`, `dragBy`, `fill`, `press`, `textContent` and
`waitFor({ timeoutMs })` act on the one match; `app.mouse`, `app.clock` and `app.screenshot()`
cover the rest, and `app.process` is the app's child process.

`launch()` runs the entry through the `gpuix-svelte` bin with `GPUIX_AUTOMATION=1`, and that
variable is the only thing that turns the server on — never stdin not being a terminal, which it
is not under CI or an agent's shell either. Under it **stdout is the wire**: `console.log`,
`info` and `debug` move to stderr (which `launch()` passes through), so don't write to
`process.stdout` yourself, and stdin ending exits the app. Each input replies only once its effect
is laid out, so a read straight after a click sees it. Any language can drive it: requests and
replies are SSE `data:` frames of JSON with numeric ids, the methods are
`@gpuix/native/automation`'s `methods`, and an unparseable request gets a `Protocol` error back:

```sh
printf 'data: {"id":1,"method":"initialize","params":{"protocolVersion":1,"client":"sh"}}\n\ndata: {"id":2,"method":"getAllText","params":{}}\n\n' \
  | GPUIX_AUTOMATION=1 npx gpuix-svelte src/main.ts 2>/dev/null
```

Headlessly, `test_app()` (same module) returns that `App` over `TestGpuixRenderer`, every input
going simulate → `drainEvents` → `dispatch` → `settle` like `click()` does; pointer input outside
the viewport throws `NotFound` rather than missing silently, and each read settles first, so
`waitFor` sees an update that lands on a timer.
