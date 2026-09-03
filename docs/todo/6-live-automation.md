# 6. Live automation: locator API, stdio protocol, `launch()`

| | |
|---|---|
| Candidate | F in `docs/comparison-gpuix-solid.md` |
| Size | M to L: about 1,200 lines across 12 files |
| Depends on | 2 (the headless backend delegates to the helpers) |
| Unblocks | CI against a real window; a coding agent driving a running app instead of reading a `GPUIX_SCREENSHOT` PNG |
| Line numbers | as of `e729a86` |

## Goal

An external process can click, type, scroll, screenshot and read the element tree of a running
gpuix-svelte window, through the same `Locator`/`App` API that also runs against the headless
renderer in tests. `launch({ entry })` starts an app and returns an `App`.

## Background

gpuix-solid's [`gpuix-solid/automation`][solid-automation] has three layers:

1. **Locator and App** ([automation.ts][solid-locator]): `getByTestId`, `getByText`,
   `getByType` (chained locators scope to descendants), `all`, `count`, `element` (throws
   `NotFound`/`Ambiguous`), `bounds`, `center`, `click`, `hover`, `wheel`, `dragTo`, `dragBy`,
   `fill`, `press`, `textContent`, `waitFor`; `app.mouse.{move,down,up,click,wheel,drag}`,
   `app.clock.{pause,set,fastForward,resume}`, `app.screenshot()`.
2. **Backends**: an `AutomationBackend` interface with an in-process implementation over the
   test renderer and a [live implementation][solid-live] over the production `GpuixRenderer`
   that calls `tick()` after every input so the effect is painted before the reply.
3. **Transport** ([protocol.ts][solid-protocol], [server.ts][solid-server],
   [stdio.ts][solid-stdio]): SSE-framed JSON (`data: {...}\n\n`) requests with numeric ids,
   validated with zod, fourteen methods. The app [auto-serves][solid-autoserve] on stdin/stdout
   when `process.stdin.isTTY` is false; [`launch({ command })`][solid-launch] spawns it and
   connects. Its `initialize` reply hardcodes an 800×600 window, and it never reads the child's
   stderr pipe.

Their roadmap still lists live `fill()` and `press()` as blocked on the production renderer
exposing keystroke simulation ([ROADMAP.md][solid-roadmap]). On 0.7.0 the live `GpuixRenderer`
has `simulateClick`, `simulateMouseDown`, `simulateMouseUp`, `simulateMouseMove`,
`simulateScrollWheel`, `simulateKeystrokes`, `simulateKeyDown`, `simulateKeyUp`,
`getAutomationTree()`, `getElementBounds`, `getAllText`, `getPaintedText`,
`getPaintedHighlights`, `getSelectedText`, `clearSelection`, `captureScreenshot`,
`getWindowSize`, `getWindowInsets` and the four clock calls (`index.d.ts:4-135`). So the whole
design works against our pin.

Facts that shape the port:

- `getAutomationTree()` returns `{ type, id, testId?, text?, bounds: { x, y, width, height },
  children? }`: bounds as an object, no `style` or `events`. It is the only tree the live
  renderer exposes. `getTreeJson()` (headless only) has style and events and no bounds.
- On the live renderer, events arrive through the constructor callback
  ([`src/render.ts:114-122`](../../src/render.ts#L114-L122) → `handle_event` →
  `dispatch → flushSync → commit`). A napi threadsafe callback runs on a later event-loop turn,
  not inside `simulateClick()`. Painting happens in the frame loop's `native.tick()`
  ([`render.ts:89`](../../src/render.ts#L89)).
- `bin/gpuix-svelte.js` spawns the runtime with `stdio: 'inherit'`, so pipes and env pass
  through; the bin needs no change for the protocol to work.
- `getElementBounds` returns `null` only for unknown ids and untracked hosts (a virtual-list's
  host). A clipped node still has bounds outside the window.

## Design

### Modules and dependency order

```
src/automation/protocol.ts   ← src/automation.ts   ← src/test.ts
src/automation/protocol.ts   ← src/automation/server.ts   ← src/render.ts
```

The app path never loads `mount`, `TestGpuixRenderer` or `node:child_process`.

### `src/automation/protocol.ts`

```ts
export type AutomationErrorCode = 'NotFound' | 'Ambiguous' | 'Timeout' | 'Protocol' | 'Closed' | 'Unsupported';
export class AutomationError extends Error { readonly code: AutomationErrorCode; constructor(code: AutomationErrorCode, message: string) }
export interface Bounds { x: number; y: number; width: number; height: number }
export interface WindowSize { width: number; height: number }
export interface AutomationNode { id: number; type: string; text?: string; testId?: string; bounds?: Bounds; children?: AutomationNode[] }

export interface AutomationBackend {
	tree(): AutomationNode | null | Promise<AutomationNode | null>;
	bounds(id: number): Bounds | null | Promise<Bounds | null>;
	window_size(): WindowSize | Promise<WindowSize>;
	click(x: number, y: number, button?: number, modifiers?: string): void | Promise<void>;
	mouse_move(x: number, y: number, pressed_button?: number, modifiers?: string): void | Promise<void>;
	mouse_down(x: number, y: number, button?: number, modifiers?: string): void | Promise<void>;
	mouse_up(x: number, y: number, button?: number, modifiers?: string): void | Promise<void>;
	wheel(x: number, y: number, delta_x: number, delta_y: number, modifiers?: string): void | Promise<void>;
	keystrokes(keys: string, element_id?: number): void | Promise<void>;   // focuses element_id first when given
	screenshot(path: string): void | Promise<void>;
	clock_pause(): number | Promise<number>;
	clock_set(now_ms: number): number | Promise<number>;
	clock_fast_forward(delta_ms: number): number | Promise<number>;
	clock_resume(): number | Promise<number>;
	close(): void | Promise<void>;
}

export const PROTOCOL_VERSION = 1;
export const METHODS = [...] as const;                       // the 14 wire names below
export function validate_request(value: unknown): Request;   // throws AutomationError('Protocol' | 'Unsupported')
export function encode(message: object): string;             // JSON + '\n'
export function decode_lines(buffer: string, chunk: string, on_line: (line: string) => void): string;  // returns the remainder
export function parse_tree(json: string): AutomationNode | null;
export function to_bounds(arr: number[] | null): Bounds | null;
```

`validate_request` is a hand-rolled checker over a per-method table such as
`{ x: 'number', button: 'number?', modifiers: 'string?' }`, walked with `typeof`. Unknown
methods are `Unsupported`; shape errors are `Protocol`. No zod, no `eventsource-parser`: the
package allows no new dependencies, and a local pipe does not need SSE framing.

### Wire protocol (NDJSON)

One JSON object per line, UTF-8, `\n`-terminated; client-assigned positive integer ids echoed
back. Lines that are not a JSON object go to the client's `on_log` or are answered with a
`Protocol` error (`id: null`) by the server.

```
→ {"id":1,"method":"initialize","params":{"protocolVersion":1,"client":"gpuix-svelte/automation"}}
← {"id":1,"result":{"protocolVersion":1,"pid":4242,"platform":"darwin","runtime":"node","capabilities":["tree","input","screenshot","clock"],"window":{"width":820,"height":560}}}
→ {"id":2,"method":"getTree","params":{}}
← {"id":2,"result":{"tree":{...},"window":{"width":820,"height":560}}}
→ {"id":3,"method":"getBounds","params":{"elementId":7}}          ← {"id":3,"result":{"bounds":{...}}}   (or null)
→ {"id":4,"method":"click","params":{"x":100,"y":40,"button":0,"modifiers":"shift"}}   ← {"id":4,"result":{"ok":true}}
→ mouseMove {x,y,pressedButton?,modifiers?} · mouseDown/mouseUp {x,y,button?,modifiers?} · scrollWheel {x,y,deltaX,deltaY,modifiers?}
→ keystrokes {keys, elementId?}                                    ← {"ok":true}
→ screenshot {path}                                                ← {"path":...}
→ clockPause {} · clockSet {nowMs} · clockFastForward {deltaMs} · clockResume {}   ← {"nowMs":...}
← {"id":5,"error":{"code":"Unsupported","message":"unknown method \"foo\""}}
← {"id":null,"error":{"code":"Protocol","message":"expected a JSON object with an integer id"}}
```

Same 14 method names as gpuix-solid, camelCase on the wire, snake_case in TypeScript.
`window` is `getWindowSize()` in both `initialize` and `getTree`, so every locator resolution
sees the current size (a resized window, the Windows 1024×749 headless viewport) without a
15th method. Optional and cheap: `getText {}` → `{ all, painted, selected }`; painted text is
the only way to assert on `<code>`/`<markdown>` live.

### `src/automation.ts` (`exports["./automation"]`)

```ts
export class Locator {
	get_by_test_id(id: string): Locator;
	get_by_text(text: string, opts?: { exact?: boolean }): Locator;   // substring on text nodes by default
	get_by_type(type: string): Locator;                                // chained = descendant scope
	all(): Promise<AutomationNode[]>;  count(): Promise<number>;
	element(): Promise<AutomationNode>;        // NotFound for 0, Ambiguous for >1
	bounds(): Promise<Bounds>;                 // node.bounds ?? backend.bounds(id) ?? NotFound('element N has no painted bounds')
	center(): Promise<Point>;                  // viewport check against backend.window_size(), same wording as click()'s
	click(opts?: MouseOptions); hover(opts?: MoveOptions); wheel(dx: number, dy: number, opts?);
	drag_to(target: Locator | Point, opts?: DragOptions); drag_by(dx: number, dy: number, opts?: DragOptions);
	fill(text: string);                        // cmd-a (darwin) / ctrl-a, then keystrokes: space→'space', \n→'enter', \t→'tab'; '' → 'backspace'
	press(key: string);                        // keystrokes(key, id)
	text_content(): Promise<string>;           // own text + descendants
	wait_for(opts?: { timeout?: number; interval?: number }): Promise<AutomationNode>;  // unique match; Timeout / Ambiguous
}

export class App {
	constructor(backend: AutomationBackend);
	get_by_test_id / get_by_text / get_by_type;
	readonly mouse: { move; down; up; click; wheel; drag };    // targets are Locator | Point
	readonly keyboard: { press(keys: string): Promise<void> }; // no focus change, for on_window_key shortcuts
	readonly clock: { pause; set; fast_forward; resume };
	window_size(): Promise<WindowSize>;
	screenshot(path: string): Promise<string>;
	close(): Promise<void>;
}

export class StreamBackend implements AutomationBackend { ... }   // client over any readable/writable pair; correlates replies by id
export function connect(streams: { input: Readable; output: Writable; on_log?: (line: string) => void; close?: () => Promise<void> }): Promise<App>;
export function launch(opts:
	| { entry: string; bun?: boolean; args?: string[]; cwd?: string; env?: Record<string, string>; on_log?: (line: string) => void; timeout?: number }
	| { command: string; args?: string[]; cwd?: string; env?: Record<string, string>; on_log?: (line: string) => void; timeout?: number }): Promise<App>;
```

`launch({ entry })` resolves `new URL('../bin/gpuix-svelte.js', import.meta.url)` and spawns
`process.execPath bin [--bun] entry` with `stdio: ['pipe', 'pipe', 'inherit']` and
`env: { ...process.env, ...env, GPUIX_AUTOMATION: '1' }`, then `connect()`s and awaits
`initialize` (default 15 s → `Timeout`; a child exit first → `Closed` with the code). stderr is
inherited so a chatty app never blocks on a full pipe. `close()` ends the child's stdin (the
server exits on `end`), waits up to 2 s for `exit`, then `kill()`s. `StreamBackend.close()`
rejects every pending request with `Closed`.

Headless: `test_app()` in `src/test.ts` builds `new App(new HeadlessBackend())`, where
`HeadlessBackend` maps `tree` → `parse_tree(native().getAutomationTree())`, `bounds` →
`to_bounds(native().getElementBounds(id))`, `window_size` → `native().getWindowSize()`, `click`
→ `click_at`, the mouse and wheel calls → task 2's helpers, `keystrokes(keys, id)` →
`if (id) focus(id); type(keys)`, the clock calls → task 2's helpers, `close` → no-op. All
synchronous; `Locator` awaits whatever comes back. One hit-test path, not two.

### `src/automation/server.ts`

```ts
export type LiveNative = Pick<GpuixRenderer, 'simulateClick' | 'simulateMouseMove' | 'simulateMouseDown' | 'simulateMouseUp'
	| 'simulateScrollWheel' | 'simulateKeystrokes' | 'focusElement' | 'getAutomationTree' | 'getElementBounds'
	| 'getWindowSize' | 'captureScreenshot' | 'clockPause' | 'clockSet' | 'clockFastForward' | 'clockResume'>;
export class LiveBackend implements AutomationBackend { constructor(native: LiveNative, next_frame: () => Promise<void>) }
export async function handle_request(request: Request, backend: AutomationBackend): Promise<Response>;
export function serve(backend: AutomationBackend, opts?: { input?: Readable; output?: Writable; on_end?: () => void }): { stop(): void };
export function enable_automation(native: LiveNative, next_frame: () => Promise<void>): { stop(): void };
```

**Live sequencing.** In `LiveBackend`, every input is
`native.simulateX(...)` → `await next_frame(); await next_frame();` → reply. Why two frames and
not gpuix-solid's synchronous `tick()`: `simulateClick` returns before the napi callback has run;
that callback lands on a later event-loop turn, before or after the loop's next `tick()`
depending on which phase the stdin `data` handler fired in (and Bun orders differently). By the
end of the second frame the handler has committed and `tick()` has laid out and painted the
batch, so a following `getTree`/`getBounds` is fresh. Reads and clock calls do not wait. Not
calling `tick()` from inside the request handler keeps AppKit pumping on the loop's own cadence.
Cost: about 16 ms per input, about 130 ms for an 8-step drag. On Windows and Linux `tick()` only
reports liveness and the UI thread paints, so two frames is a heuristic there and `wait_for`
covers the gap. **Verify the delivery timing once by hand** (`GPUIX_AUTOMATION=1`, pipe one
`click` then `getTree`); if it turns out synchronous, one frame suffices, but keep two.

`serve` reads stdin with `setEncoding('utf8')` and `on('data')`, asynchronous on the same event
loop as the 8 ms frame loop, so requests run between ticks and never block one. Requests are
serialised through a promise chain so a drag's moves cannot interleave with another client's
click. `enable_automation` rebinds `console.log` and `console.info` to stderr (one why-comment)
so `[gpuix-svelte] mount complete` and hot-reload warnings stay visible without corrupting the
wire; the client still skips non-JSON lines defensively. `respond()` turns any thrown
non-`AutomationError` into a `Protocol` error response.

### `src/render.ts`

- Add `automation: { stop(): void } | null` to `Host` (lines 32-38); it lives in the slot so
  `render_hot` remounts keep the one server.
- Export `next_frame(): Promise<void>`, backed by a resolver list the loop drains right after
  `native.tick()` (line 89), with a `setTimeout(FRAME_MS)` fallback when there is no loop.
- After `if (!slot.loop) slot.loop = start_frame_loop(slot.native)` (line 170):
  `if (automation_requested() && !slot.automation) slot.automation = enable_automation(slot.native, next_frame)`.

**Enabling: `GPUIX_AUTOMATION=1`, explicit, not TTY sniffing.** gpuix-solid auto-serves when
stdin is not a TTY. That is zero-config, but stdin is never a TTY under CI, `nohup`, a coding
agent's shell, a VS Code task or `npm run demo:counter </dev/null`; the bin passes that non-TTY
straight through, so the app cannot tell "npm on a runner" from "a driver" and would silently
turn stdout into protocol frames and start consuming stdin. `scripts/demo-all.ts` fans four
children out on one inherited stdin, so only one would see each chunk. It also forecloses the
EOF policy: exiting on stdin `end` would kill every `</dev/null` run, yet without it `close()`
needs a signal, which Windows `kill()` never lets a handler run for. The env var costs a
hand-rolled driver one token, `launch()` sets it, and it buys clean semantics: stdout is the
wire, stdin `end` means `process.exit(0)`, which makes `close()` clean on all three platforms.
Accept `'0'` and `''` as off, so `GPUIX_AUTOMATION=stdio` can name a transport later.

`bin/gpuix-svelte.js`: no change required. Optional: intercept `--automation` like `--bun` and
set the env for the child.

`package.json`: `"./automation": "./src/automation.ts"` in `exports`; `test:automation` chained
into `test` and `bun:test:automation` into `bun:test`; `test:automation-live` and its twin
**not** chained.

### Edge cases

- **538 px cap / Windows 1024×749**: never compare to the requested size; `initialize.window`
  and `getTree.window` come from `getWindowSize()`; `Locator.center()` throws `NotFound` with the
  same wording `click()` uses, including the cap hint on macOS headless.
- **No painted bounds**: `AutomationError('NotFound', 'element N has no painted bounds')`;
  `wait_for` waits for uniqueness only, and `click` reports the bounds problem separately.
- **Text targets**: `get_by_text` matches text nodes; their centre is what `click_text` already
  clicks, so the parent's `onclick` receives it.
- **Hover**: `:hover` styles are native paint state invisible to both trees; assert through
  `onmouseenter` state or a screenshot.
- **Hot reload**: ids are monotonic per remount; locators re-resolve on every call, so a driver
  never caches an `AutomationNode.id` across `render_hot`.
- **Focus for keystrokes**: live `focusElement` needs a focus handle (an input, or key/focus
  listeners); headless `focus()` also dispatches the synthetic `focus` event so `editing` follows.
- **stdin end**: only under `GPUIX_AUTOMATION` does `end` exit the process; `serve()`'s `on_end`
  is injectable so the in-memory test does not exit.

## Tests

`test/automation.ts` with fixture `test/Automation.svelte` (reuse task 2's `Helpers.svelte` if
it fits), chained into `test`:

- Locator over `test_app()`: "get_by_test_id resolves the node find_test_id finds";
  "get_by_text is a substring match, exact narrows it"; "chaining scopes to descendants";
  "element() throws NotFound / Ambiguous"; "click() increments through hit testing"; "fill()
  replaces an input's value"; "text_content() joins descendants"; "wait_for times out with
  Timeout".
- Protocol in memory: the real headless backend behind `serve()` over a `PassThrough` pair from
  `node:stream`, `connect()` on the other end, no process, no window: "a request split across
  chunks decodes once"; "a log line on the wire is skipped and forwarded to on_log"; "a malformed
  line answers Protocol with id null"; "an unknown method answers Unsupported"; "initialize
  reports the window native reports"; "the same locator script runs over the wire" (click `+`,
  tree shows `1`); "close() rejects what is pending with Closed".
- `LiveBackend` with a stub native and a real `start_frame_loop` (pattern
  `test/lifecycle.ts:15-32`): "an input replies only after two frames have ticked"; "getTree
  does not wait".

`test/automation-live.ts` (`test:automation-live`, not chained): `launch({ entry:
'examples/counter/main.ts', bun: process.versions.bun != null })`; click `+` three times;
`get_by_text('3 clicks').wait_for()` (a substring of `Counter.svelte`'s `{#if}` text, `3 clicks — the {#if} branch is live`); click reset;
`screenshot(tmp)` exists; `close()` and the child exits 0 within 2 s.

CI: the headless suite gates on both runtimes. For the live test, add a separate macOS step with
`continue-on-error: true` and `timeout-minutes: 3`; GitHub's macOS runners have a logged-in GUI
session and Metal works there (the headless suite proves it), but a GPUI window opening on a
runner is unverified. Promote it into the gate after a few green runs.

## Docs

- README, "Testing headlessly" (line 436): the helper list and a "Driving a running app"
  subsection with a `launch()` example, `GPUIX_AUTOMATION=1`, stdout as the wire, logs on stderr,
  `close()`, a 10-line protocol summary and a shell one-liner for non-JS drivers.
- CLAUDE.md: Commands block (`test:automation`, `test:automation-live`); the headless harness
  paragraph (`test_app()`); a new paragraph for `gpuix-svelte/automation` (files, env var,
  two-frame rule, exit on stdin end); "Seeing what a demo renders" mentions `launch` +
  `screenshot`; the Architecture tree adds `automation.ts` and `automation/`; the `render.ts`
  paragraph mentions `next_frame` and `GPUIX_AUTOMATION`; Hard constraints notes the protocol is
  NDJSON by hand because no deps are allowed.
- `.github/workflows/test.yml`: the optional live step.

## Constraints

- No zod, no SSE library, no new dependencies; `node:*` only.
- `erasableSyntaxOnly`: classes are fine, parameter properties are not; declare fields.
- Validators use `unknown`, never `any` (eslint recommended).
- Keep the frame loop unblocked; never call `tick()` from a request handler.

## Acceptance

- [ ] `gpuix-svelte/automation` exports `Locator`, `App`, `AutomationError`, `connect`, `launch` and the types.
- [ ] `test_app()` in `gpuix-svelte/test` runs the same locator script headlessly.
- [ ] `GPUIX_AUTOMATION=1 npm run -s demo:counter` answers a hand-piped `initialize` and `click`.
- [ ] `test:automation` passes on Node and Bun; `test:automation-live` passes locally on macOS.
- [ ] README and CLAUDE.md updated; `exports` and scripts added.

## Risks

Live event-delivery timing (mitigated by the two-frame wait and `wait_for`; verify by hand once);
Windows paints on its own thread; rebinding `console.log` under `GPUIX_AUTOMATION` is a global
side effect (fall back to client-side filtering only if unwelcome); `motion` may ignore the clock;
a live CI window may not open on a runner (kept out of the gate); `process.stdin` in flowing mode
is a ref'd handle, harmless because the app already exits through `process.exit(0)` from the loop.

## Sources

[solid-automation]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation/index.ts
[solid-locator]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation.ts#L211-L326
[solid-live]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation/server.ts#L48-L121
[solid-protocol]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation/protocol.ts
[solid-server]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation/server.ts#L243-L254
[solid-stdio]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation/stdio.ts
[solid-autoserve]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/runtime.ts#L29-L36
[solid-launch]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/automation/stdio.ts#L259-L289
[solid-roadmap]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/ROADMAP.md#L81
