# Native parity

Every part of the `@gpuix/native` contract, next to how gpuix-svelte exposes it, so a gap shows up
as a "—" in the gpuix-svelte column instead of being rediscovered by reading `index.d.ts`. This page
describes `main` on native 0.10.0. `npm run parity` derives the method tables from the installed
`index.d.ts`, the wasm build's `gpuix-web.d.ts` and `src/`. Check this page against its output after
any native bump.

## Pins

| | |
|---|---|
| Range | `>=0.10.0 <0.11.0` in `package.json`. Pre-1.0, so every minor may break |
| Installed | 0.10.0 (`bun.lock`) |
| Checked | 2026-10-14, against `main` at `45e0cd1` |
| Upstream source | `https://raw.githubusercontent.com/remorses/gpuix/@gpuix/native@<version>/packages/native/src/<file>`. Every release has a tag; the sibling `../gpuix` checkout lags behind and is not a source of truth ([CLAUDE.md](../CLAUDE.md#regenerating-the-styling-reference)) |
| Prebuilds | darwin-arm64, linux-x64 (without `TestGpuixRenderer`) and win32-x64. A browser bundle gets `browser.mjs`, which loads `wasm/gpuix-web_bg.wasm` |

## Renderer methods

**on** says which class has the method. **R** is the napi `GpuixRenderer` behind a window, **T** is
`TestGpuixRenderer` and **W** is the wasm `GpuixRenderer` that `browser.mjs` exports. Calls that
`src/test.ts` makes count for T only, because it never holds anything else. Every other caller
reaches the renderer through `get_native()`, which holds whichever class was mounted. "raw in
`test/x.ts`" means a test calls the native method directly because no helper wraps it. "The
automation server" is what `GPUIX_AUTOMATION=1` starts (`src/automation-server.ts`): it reaches R
through `@gpuix/native/automation`'s `liveRendererAsTest` rather than by name, so `npm run parity`
cannot see those calls and lists `simulateKeyDown` and `simulateKeystrokes` as unused on R.

### Lifecycle and batching

| native | on | gpuix-svelte | notes |
|---|---|---|---|
| `init(options?)` | R W | `render()`, on its first call | Takes `WindowOptions` (below). A remount reuses the window, so it never calls `init` again. W ignores the options |
| `applyBatch(json)` | R T W | `commit()` in `renderer.ts` | One call per commit. The ids it returns as destroyed are purged from the id map |
| `tick()` | R W | `start_frame_loop` in `render.ts` | Once it returns `false`, the last window has closed and the process exits. On W it does nothing |
| `requiresTick()` | R W | `start_frame_loop` | `false` switches the renderer to `set_auto_commit(true)`. W always returns `false` |
| `isInitialized()` | R W | — | `render()` tracks the window in its own `globalThis` slot instead |
| `flush()` | T | `settle()`, and every input helper in `gpuix-svelte/test` | Headless layout and paint |
| `getRetainedElementCount()` | T | — | raw in `test/lifecycle.ts`, `test/autocommit.ts` and `test/portal.ts` |
| `getRootId()` | T | — | |

`commit()` also calls `commitMutations?.()`. Neither 0.10.0 class declares that method, so the call
does nothing. It is left over from older natives.

### Window

| native | on | gpuix-svelte | notes |
|---|---|---|---|
| `setWindowTitle(title)` | R W | `set_window_title()` | |
| `activateWindow()` | R | `activate_window()` | Brings forward a window opened with `show: false` or `focus: false` |
| `minimizeWindow()` | R | `minimize_window()` | |
| `zoomWindow()` | R | `zoom_window()` | |
| `toggleFullscreen()` | R | `toggle_fullscreen()` | |
| `promptForPaths(options?)` | R T W | `prompt_for_paths()` | Resolves `null` on T (checked in `test/host.ts`). W rejects with "not supported on the web" |
| `getWindowSize()` | R T W | `window_size`, polled while something reads it; T: `center()`, the viewport guard every pointer helper shares; the automation server's `initialize` | No native resize event exists, hence the poll |
| `getWindowInsets()` | R W | `window_insets`, polled the same way | Safe area, IME and effective insets. T has none, so they read as zero headlessly |

### Focus and keys

| native | on | gpuix-svelte | notes |
|---|---|---|---|
| `focusElement(id)` | R T W | `focus_element(node)`; in `gpuix-svelte/test`, `focus(target)` | If mutations are still queued, the call waits until the next commit (`with_native_id`) |
| `blur()` | R W | `blur()` | T has no `blur()`; `unfocus()` in `gpuix-svelte/test` reports the blur to the tree instead |
| `getFocusedElementId()` | R T W | `focused_element()` | Returns the shadow node |
| `focusNextWithin(id)` | R T W | `focus_next_within(node)` | Wraps around inside the subtree. Covered by `test/host.ts` |
| `focusPreviousWithin(id)` | R T W | `focus_previous_within(node)` | Covered by `test/host.ts` |
| `focusNext()` | R T W | — | Walks the whole window's tab order. Since 0.7, Tab reaches `keyDown` as an ordinary key, so nothing moves focus on Tab unless the app calls this |
| `focusPrevious()` | R T W | — | |
| `setWindowKeyEvents(keyDown, keyUp, eventId)` | R T W | `on_window_key()`; `render()`'s `onKeyDown` / `onKeyUp` | The renderer listens through a window pseudo-node, which the selection channel shares |

### Selection

| native | on | gpuix-svelte | notes |
|---|---|---|---|
| `setWindowSelectionChange(enabled, eventId)` | R T W | `on_selection_change()`; `render()`'s `onSelectionChange` | Uses the same window pseudo-node as `on_window_key` |
| `getSelectedText()` | R T W | T: `selected_text()`, `drag_select()`; R: the automation server | The `e.value` that `on_selection_change` receives carries the same text |
| `clearSelection()` | R T W | T: `clear_selection()`; R: the automation server | |
| `dragSelect(x1, y1, x2, y2)` | T | `drag_select(from, to)` | |

### Scrolling and geometry

| native | on | gpuix-svelte | notes |
|---|---|---|---|
| `getElementBounds(id)` | R T W | `bounds()` and `center()` in `gpuix-svelte/test`; `Scroller`; `Popover` (a press inside the trigger) | Otherwise called raw through `get_native()` ([Guide](guide.md#forms)) |
| `getScrollOffset(id)` | R T W | `Scroller`; the automation server | No public helper; raw in `test/scroller.ts`, `test/helpers.ts` and `test/host.ts` |
| `scrollTo(id, x, y)` | R T W | `Scroller` (thumb drag); the automation server | No public helper |
| `scrollToItem(id, index, offsetInItem?)` | R T W | `Scroller virtual` (thumb drag) | No public helper. It also emits a synthetic `visibleRange` |
| `getListScrollTop(id)` | R T W | `Scroller virtual` | Returns `[index, offsetInItem, viewportHeight]` |
| `scrollIntoView(id)` | R T W | `scroll_into_view(node)` | |

### Images

| native | on | gpuix-svelte | notes |
|---|---|---|---|
| `setImage(id, bytes)` | R T W | `set_image(node, bytes)` | |
| `setImagePixels(id, width, height, pixels)` | R T W | `set_image_pixels(node, width, height, rgba)` | |

### Debug frame overlay

| native | on | gpuix-svelte | notes |
|---|---|---|---|
| `setDebugFrameOverlay(mode)` | R T W | `set_debug_overlay(mode)`; `render()`'s `debugFrameOverlay` option and the `GPUIX_FPS` environment variable both go through it | `GPUIX_FPS` outranks the option and `1` means `full`. An unknown mode warns once instead of throwing out of `render()` |
| `cycleDebugFrameOverlay()` | R T | `cycle_debug_overlay()` | |
| `getDebugFrameOverlay()` | R T W | `debug_overlay()` | |
| `resetDebugFrameOverlayStats()` | R T | `reset_debug_overlay_stats()` | |
| `getDebugFrameOverlayStats()` | R T | `debug_overlay_stats()` | Draw-time samples, recorded whether or not the overlay is showing |

### Reading back

| native | on | gpuix-svelte | notes |
|---|---|---|---|
| `getTreeJson()` | T | `tree()`, `find()`, `find_all()`, `find_text()`, `find_test_id()`, `element_of()` | |
| `getAllText()` | R T W | T: `all_text()`; R: the automation server | |
| `getPaintedText()` | R T W | T: `painted()`; R: the automation server | |
| `getPaintedHighlights()` | R T W | T: `painted_highlights()` | Without a screenshot, the only way to assert on `highlight`. R and W have no wrapper; raw in `test/search.ts` |
| `getA11yTree()` | T | — | raw in `test/host.ts` |
| `getAutomationTree()` | R T W | T: `automation_tree()`, and the locators of `test_app()`; R: the automation server | Painted bounds but no `style` or `events`, the reverse of `getTreeJson()` |
| `findByType(type)` | T | — | |
| `getText(id)` | T | — | |
| `hasEventListener(id, type)` | T | — | raw in `test/teardown.ts` |
| `getSyntaxCacheStats()` | T | — | Syntax-cache hits, misses and document count for `<code>` |
| `drainEvents()` | T | `drain()`, and every input helper | |
| `captureScreenshot(path)` | R T | R: the `GPUIX_SCREENSHOT` environment variable, read by `render()`, and the automation server's `screenshot`; T: `screenshot(path)` | |

### Input simulation

| native | on | gpuix-svelte | notes |
|---|---|---|---|
| `simulateClick(x, y, button?, modifiers?)` | R T W | T: `click()`, `click_at()`, `click_text()`, `click_test_id()`; R: the automation server | |
| `simulateKeyDown(keystroke, isHeld?)` | R T | T: `press()`; R: the automation server | |
| `simulateKeystrokes(keystrokes)` | R T | T: `type()`; R: the automation server | |
| `simulateFileDrop(x, y, paths)` | T | `drop_files()` | |
| `simulateKeyUp(keystroke)` | R T | T: `key_up()`; R: the automation server | |
| `simulateMouseDown(x, y, button?, modifiers?)` | R T W | T: `mouse_down()`, `drag()`; R: the automation server | |
| `simulateMouseUp(x, y, button?, modifiers?)` | R T W | T: `mouse_up()`, `drag()`; R: the automation server | |
| `simulateMouseMove(x, y, pressedButton?, modifiers?)` | R T W | T: `hover()`, `mouse_move()`, `drag()`; R: the automation server | raw in `test/tooltip.ts`, which flushes between moves |
| `simulateScrollWheel(x, y, deltaX, deltaY, modifiers?)` | R T W | T: `wheel()`; R: the automation server | |

### Clock

| native | on | gpuix-svelte | notes |
|---|---|---|---|
| `clockPause()` | R T W | T: `clock_pause()`; R: the automation server (`app.clock`) | The clock `motion` animates on |
| `clockSet(nowMs)` | R T W | T: `clock_set()`; R: the automation server | |
| `clockFastForward(deltaMs)` | R T W | T: `clock_fast_forward()`; R: the automation server | |
| `clockResume()` | R T W | T: `clock_resume()`; R: the automation server | |
| `advanceTime(milliseconds)` | T | `advance_time()` | GPUI's executor timers (caret blink, drag autoscroll), not `setTimeout` |

### Module exports

| native | gpuix-svelte | notes |
|---|---|---|
| `GpuixRenderer` / `TestGpuixRenderer` | `render()` / `mount_headless()` | |
| `hasTestGpuixRenderer()` | `mount_headless()`, which throws when this returns false | Returns false on the Linux prebuild |
| `checkUpdate(currentVersion, options)` → `AvailableUpdate` | — | The signed-bundle auto-updater (`downloadAndInstall()`). [Shipping](shipping.md) does not mention it |
| `__napiBindingTarget` | — | Says which binding artifact loaded |

### Not in native

0.10.0 has no native call for either of these, so there is nothing to wrap:

- **The clipboard.** `index.d.ts` declares no clipboard method.
- **The application menu.** `app_menu.rs` builds a fixed app menu (Services, Hide, Hide Others,
  Show All, Quit) and a fixed Window menu (Minimize, Zoom, Close Window). `appName` is the only
  part that can be configured.

## Window options

`RenderOptions` extends `WindowOptions`. `render()` takes its own fields off and passes everything
else to `init()` unchanged, so every native field is exposed, on the first `render()` only. A remount
reuses the window, and W ignores all of them (the page's CSS sizes the canvas).

| native | type | gpuix-svelte | notes |
|---|---|---|---|
| `title` | `string` | passthrough (every example) | `set_window_title()` changes it later |
| `appName` | `string` | passthrough | The name inside the macOS Hide and Quit menu items. Defaults to `title`. The app menu's own title comes from the executable or `.app` bundle |
| `width`, `height` | `number` | passthrough (every example) | |
| `minWidth`, `minHeight` | `number` | passthrough (`examples/tutorial`) | |
| `resizable` | `boolean` | passthrough | |
| `fullscreen` | `boolean` | passthrough | `toggle_fullscreen()` changes it later |
| `transparent` | `boolean` | passthrough (`examples/liquid-glass`) | When `windowBackground` is unset, this is the same as `"transparent"` |
| `titlebarTransparent` | `boolean` | passthrough (`examples/liquid-glass`) | |
| `windowBackground` | `"opaque" \| "transparent" \| "blurred"` | passthrough (`examples/liquid-glass`) | |
| `trafficLightX`, `trafficLightY` | `number` | passthrough | |
| `focus` | `boolean` | passthrough | `false` opens the window behind the active app. Ignored on Linux |
| `show` | `boolean` | passthrough | `false` opens it hidden until `activate_window()`. Ignored on Linux |
| `appId` | `string` | passthrough | Wayland `app_id` / X11 `WM_CLASS` |
| `layerShell` | `LayerShellOptions` | passthrough | Opens a Wayland `wlr-layer-shell` surface. Linux/Wayland only |

The package adds these:

| field | type | what it does |
|---|---|---|
| `props` | `Record<string, unknown>` | Props for the root component |
| `rootStyle` | `GpuiStyle` | Style for the root `div` that `create_root` makes |
| `onEvent` | `(event: EventPayload) => void` | Every native event, after the renderer has dispatched it |
| `onKeyDown`, `onKeyUp` | `(event: GpuixEvent) => void` | `on_window_key` handlers that are kept across remounts |
| `onSelectionChange` | `(event: GpuixEvent) => void` | An `on_selection_change` handler that is kept across remounts |
| `debugFrameOverlay` | `DebugFrameOverlayMode` | The draw-time overlay; re-applied only when a later `render()` changes it |
| `GPUIX_FPS`, `GPUIX_SCREENSHOT`, `GPUIX_AUTOMATION` | environment variables | The debug overlay (outranks `debugFrameOverlay`), a PNG written after every mount, and the stdio automation server (desktop only) |

## Events

The Rust at the 0.10.0 tag emits exactly these strings through `emit_event_full` (`renderer.rs`,
`custom_elements/*.rs`, `accessibility.rs`). All 23 element events are in `GPUI_EVENTS`, which also
matches `EVENT_PROPS` in `@gpuix/native/host` (`npm run parity` compares the two). Svelte spells
each one lowercase, as `on<event>`.

| native | emitted on | tested by | notes |
|---|---|---|---|
| `click` | `div`/`text`, `input`/`textarea`, `img`, `svg`, `code`, `diff`, `markdown`, `anchored` | most tests (`test/smoke.ts`, `test/hitbox.ts`, ...) | Fired on primary mouse-up, and on a VoiceOver Press. macOS ctrl+click also arrives as `click` |
| `auxClick` | `div`/`text` | `test/auxclick.ts` | Right and middle buttons. Carries `isRightClick`, `x` and `y` |
| `mouseDown`, `mouseUp`, `mouseMove` | `div`/`text` | `test/scroller.ts` (the `Scroller` thumb), `test/helpers.ts` (`drag()`) | |
| `mouseEnter`, `mouseLeave` | `div`/`text`, `img`, `svg`, `code`, `diff`, `markdown`, `anchored` | `test/helpers.ts` (`hover()`), `test/tooltip.ts` | |
| `mouseDownOutside` | `div`/`text` | `test/tooltip.ts` (`Popover`) | |
| `keyDown`, `keyUp` | the focused `div`/`text`, `input`/`textarea` | `keyDown` in `test/window-keys.ts`, `keyUp` in `test/helpers.ts` | |
| `focus`, `blur` | any element with a focus handle (`input`/`textarea`, a `tabIndex`, or a key or focus listener) | `test/window-keys.ts`, with synthetic events | The headless renderer never emits these. The renderer always listens on inputs, which is how it sets the `editing` flag |
| `scroll` | `div`/`text` that scroll | `test/scroller.ts` | |
| `fileDrop` | `div`/`text`, `input`/`textarea`, `img`, `svg`, `code`, `diff`, `markdown`, `anchored` | `test/host.ts` | `<virtual-list>` does not emit it |
| `motionComplete` | any element with `motion` | `test/host.ts` | |
| `highlight` | any element with `highlight` | `test/search.ts` (`TextSearch`) | Carries `matchCount` |
| `visibleRange` | `virtual-list` | `test/scroller.ts` (through `Scroller virtual`) | `scrollToItem` also emits one |
| `change`, `submit` | `input`/`textarea` | `change` in `test/helpers.ts` | |
| `linkClick` | `markdown` | — | |
| `toggleFile`, `showMore`, `lineClick` | `diff` | — | |
| `windowKeyDown`, `windowKeyUp` | the id given to `setWindowKeyEvents` | `test/window-keys.ts` | `on_window_key()`. These are not in `GPUI_EVENTS` |
| `selectionChange` | the id given to `setWindowSelectionChange` | `test/host.ts` | `on_selection_change()`. Also not in `GPUI_EVENTS` |

Nothing emits `contextMenu`, even though the `EventPayload.button` doc comment in `index.d.ts` still
lists it.

## Element props

These are what each native element reads: `supported_props()` / `supported_events()` in
`custom_elements/*.rs`, plus `renderer.rs` for `div`, `text` and `virtual-list`. The renderer
forwards every attribute verbatim to anything except `div` and `text`. It keeps back only `style`,
`class`, `hover`, `active`, `hitbox` and `portal`, and renames `autofocus`, `tabindex` and `testid`
to their camelCase forms. `src/html.d.ts` types the attributes.

| element | native props | native events | documented in | tested by |
|---|---|---|---|---|
| `div`, `text` | `autoFocus`, `tabIndex`, `testId`, `motion`, `highlight`, `role`, `aria-label`, `aria-description`, `aria-id`, `aria-expanded`, `aria-selected`, `aria-valuetext`, `aria-level` | `click`, `auxClick`, `mouseDown`, `mouseUp`, `mouseMove`, `mouseEnter`, `mouseLeave`, `mouseDownOutside`, `keyDown`, `keyUp`, `focus`, `blur`, `scroll`, `fileDrop`, `motionComplete`, `highlight` | [Guide](guide.md) (`highlight` under [Text search](guide.md#text-search)), [Styling](styling.md) (`motion`) | `tabIndex`, `role`, `aria-label`, `aria-expanded`, `aria-level` and `motion` in `test/host.ts`; `highlight` in `test/search.ts` and `test/helpers.ts`; `testId` in most tests. Nothing tests `autoFocus`, `aria-description`, `aria-id`, `aria-selected` or `aria-valuetext` |
| `input` | `value`, `placeholder`, `readOnly`, `theme`. It shares an adapter with `textarea` | `change`, `submit`, `click`, `keyDown`, `keyUp`, `focus`, `blur`, `fileDrop` | [Guide](guide.md), the [tutorial](../examples/tutorial/content/native-elements.md) | `test/hitbox.ts` (keeps its hitbox), `test/window-keys.ts` (`onkeydown`), `test/helpers.ts` (`change`, `onkeyup`). No test sets `value` or hears `submit` |
| `textarea` | the same, plus `minRows` and `maxRows` | the same as `input` | [Guide](guide.md), the [tutorial](../examples/tutorial/content/native-elements.md) | — |
| `img` | `src`, `objectFit`, `alt` | `click`, `mouseEnter`, `mouseLeave`, `fileDrop` | [README](../README.md), [Guide](guide.md) (`set_image`), the [tutorial](../examples/tutorial/content/native-elements.md) | `src` (a `data:` URL) in `test/hitbox.ts`; `set_image` and `set_image_pixels` in `test/host.ts` |
| `svg` | `source`, `src` | the same as `img` | [README](../README.md), the [tutorial](../examples/tutorial/content/native-elements.md) | `source` and colour inheritance in `test/hitbox.ts` |
| `code` | `code`, `language`, `path`, `showLineNumbers`, `theme` | the same as `img` | the [tutorial](../examples/tutorial/content/native-elements.md) | — |
| `diff` | `patch`, `wordDiff`, `scroll`, `maxLines`, `collapsedPaths`, `theme` | `toggleFile`, `showMore`, `lineClick`, plus the same as `img` | the [tutorial](../examples/tutorial/content/native-elements.md) (one line) | — |
| `markdown` | `source`, `theme` | `linkClick`, plus the same as `img` | the [tutorial](../examples/tutorial/content/native-elements.md) | — |
| `anchored` | `position`, `side`, `align`, `anchor`, `gap`, `offset`, `fit`, `snapMargin`, `deferred`, `priority`, `occlude` | the same as `img` | [Components](components.md) (`Tooltip`, `Popover`) | `side`, `align` (and its off-centre `center`), `anchor`, `gap`, `occlude`, `mouseEnter` and `mouseLeave` in `test/tooltip.ts`. Nothing tests `position`, `offset`, `fit`, `snapMargin`, `deferred` or `priority` |
| `virtual-list` | `alignment`, `followTail`, `overdraw`, `estimatedItemHeight`, `itemCount`, `windowStart`, plus `testId`, `role` and `aria-*` | `visibleRange` | [Components](components.md) (`Scroller virtual`) | `estimatedItemHeight`, `testId` and `visibleRange` in `test/scroller.ts` |
| `canvas` | none: 0.10.0 registers no `canvas` element | none | — | — |

Three things in that table are worth knowing:

- **`<canvas>` renders nothing.** `GPUI_TAGS` and `INTERACTIVE_TAGS` in `src/renderer.ts`, and
  `html.d.ts`, still accept the tag, and upstream's own `ElementType` in `@gpuix/native/host` still
  lists it. But the Rust logs
  "Unknown element type" and returns `gpui::Empty`, so its children never paint either. A headless
  probe on 0.10.0 found no painted text and no bounds for either node.
- **`html.d.ts` declares handlers that cannot fire.** Every tag gets every handler, but custom
  elements wire only the events listed above. `onmousedown` on an `<img>`, `onscroll` on an
  `<input>` and `onclick` on a `<virtual-list>` all type-check and never fire. `<code>` also
  declares `onlineclick`, which only `<diff>` emits.
- **No test covers `<code>`, `<diff>`, `<markdown>` or `<textarea>`.** The tutorial is their only
  user.

## Styles

Not copied here. [Styling](styling.md#what-works-and-what-does-not) keeps the two lists, "Working,
standard CSS semantics" and "Working, non-standard CSS semantics", which are transcribed from
`style.rs` (`StyleDesc`), `renderer.rs` (`apply_styles`) and `color.rs` at the release tag.
[CLAUDE.md](../CLAUDE.md#regenerating-the-styling-reference)'s "Regenerating the styling reference"
explains how to redo them, and how `NUMBER_ONLY` / `DIMENSION` in `src/style.ts` follow the Rust
types.

## JS entry points

From 0.10, the package ships compiled TypeScript beside the napi class.
[CLAUDE.md](../CLAUDE.md#hard-constraints) gives the reason this package does not build on it:
`/host`, `/runtime` and `/testing` are "the framework-neutral layer `@gpuix/react` and
`@gpuix/solid` share; this renderer keeps its own `render.ts` / `renderer.ts` / `test.ts`, because
that layer's event map and mutation queue would replace the batching here rather than simplify it."
The pieces that stand on their own are used, though: `/host`'s polling and search helpers, and
`/automation`.

| entry | what it holds | gpuix-svelte uses |
|---|---|---|
| `@gpuix/native` | `GpuixRenderer`, `TestGpuixRenderer`, `hasTestGpuixRenderer`, `checkUpdate`, the payload and option types. Under `browser` it resolves to `browser.mjs` (wasm); under `require`, to `index.cjs` | `render.ts`, `test.ts` and `types.ts`. `scripts/web.ts` bundles `browser.mjs`, and the compile scripts resolve to `index.cjs` (`resolve_native_cjs`) |
| `@gpuix/native/host` | Prop and style types (`StyleDesc`, `HostProps`, a props interface for each element, `MotionProps`, `GpuixTheme`, `HighlightSpec`, `CursorValue`); `readWindowSize`, `readWindowInsets`, `observeWindowSize`, `observeWindowInsets` (polling); `observeSelectedText`; `findRanges`, `createTextSearchController`; `createMutationQueue`, `EVENT_PROPS`, `UNIVERSAL_PROPS`, `BUILT_IN_TYPES`; `createRendererState` and the event-handler registry | `readWindowSize`, `readWindowInsets`, `observeWindowSize` and `observeWindowInsets` behind `window_size` / `window_insets` (`window.ts`); `createTextSearchController` and `findRanges` behind `TextSearch` / `find_ranges` (`search.ts`); the types `GpuixTheme`, `HighlightSpec`, `MotionProps`, `DebugFrameOverlayMode`, `DebugFrameOverlayStats`, `WindowSize`, `WindowInsets` and `EdgeInsets`, all re-exported from `gpuix-svelte`; `scripts/native-parity.ts` reads `EVENT_PROPS` |
| `@gpuix/native/runtime` | `createNativeRenderer`, `startFrameLoop`, `enableAutomation`, `installBrowserAutomation` | Nothing. `render.ts` has its own `start_frame_loop` |
| `@gpuix/native/testing` | `TestRenderer` (wraps `TestGpuixRenderer`, adding `findByText`/`findByTestId`, a parsed `getA11yTree`, and `native*`/`dispatch*` simulators), `hasNativeTestRenderer`, and the cpu-throttle re-exports | Nothing. `src/test.ts` is its own harness |
| `@gpuix/native/automation` | `App`, `Locator`, `launch`, `connectStdio`, `connectTest`, `serveAutomationStdio`, `SseBackend`, `InProcessBackend`, `liveRendererAsTest`, `browserRendererAsTest`, plus the wire protocol (`methods`, `encodeSse`, `createSseDecoder`, `PROTOCOL_VERSION`, ...) | `gpuix-svelte/automation` re-exports `App`, `Locator`, `AutomationError`, `connectStdio`, `connectTest` and `PROTOCOL_VERSION`, and builds `launch()` on `connectStdio` and `test_app()` on `connectTest`. `src/automation-server.ts` serves with `InProcessBackend`, `liveRendererAsTest`, `createSseDecoder`, `encodeSse` and `handleAutomationRequest`. Upstream's own `launch` and `serveAutomationStdio` are not used ([Testing](testing.md#driving-a-running-app)) |
| `@gpuix/native/cpu-throttle` | `MAC_CPU_THROTTLES`, `readMacCpuThrottle`, `applyMacCpuThrottleFromEnv` | Nothing |

## Adoption policy

1. Before moving the range, read the new tag's `CHANGELOG.md`, the `index.d.ts` diff and the Rust
   (`renderer.rs`, `custom_elements/*.rs`, `style.rs`) at that tag.
2. Move the tests first: `npm test` and `npm run bun:test` must pass on the new version before
   anything starts using the new surface.
3. In the same change as the range, update this page against `npm run parity` (and the
   [Styling](styling.md) lists, if `style.rs` moved).
