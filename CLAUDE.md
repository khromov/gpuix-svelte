# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Svelte custom renderer that targets GPUI (Zed's GPU-accelerated UI framework) through
`@gpuix/native`. Svelte components render into a real native desktop window — no DOM, no
webview, no browser. Built on Svelte's unreleased custom renderer API
([sveltejs/svelte#18511](https://github.com/sveltejs/svelte/pull/18511)). The same package has a
DOM build for Vite and SvelteKit, and `packages/ui` is a component toolkit for both.

User-facing documentation lives in `README.md` and `docs/*.md` (every page is in `scripts/docs.ts`'s
`PAGES`); `docs/contributing.md` is the contributor's side (setup, demos, devcontainer, consumer
path, docs site). This file is the internals and the constraints behind them, and points there
rather than repeating them.

## Commands

Everything goes through the package scripts, and those go through `bin/gpuix-svelte.js`
(`gpuix-svelte [--bun] [runtime flags] <entry> [args]`, published as the `gpuix-svelte` bin). The
first argument not starting with `--` is the entry, so a runtime flag that takes a value needs the
`=` form; `gpuix-svelte update …` is the updater's release CLI (`bin/update.js`). On Node it runs
`node --conditions custom-renderer --conditions development --import gpuix-svelte/register <entry>`,
on Bun the same conditions with `--preload gpuix-svelte/plugin`; both loaders resolve through the
package's own `exports` (`src/*.ts` here, `lib/*.js` once packed). The conditions are
**mandatory**: without `custom-renderer`, `gpuix-svelte` resolves to its DOM build (`src/dom.ts`),
whose `render_hot` rejects and whose `render()` throws, both naming the bin. So an ad-hoc
`node app.ts` or `bun app.ts` fails; go through the bin. Flags before the entry are forwarded to
the runtime (`demo:glass-ffi` passes `--experimental-ffi` that way).

The bin runs Bun when given `--bun`, when it is itself running on Bun, or when
`npm_config_user_agent` names Bun, so `bun run test` runs the Node suite on Bun. Under Bun it
spawns `process.execPath`, except on the copy of Bun named `node` that `bun run` puts first on PATH
where Node is not installed (and always under `bun --bun run`): that one ignores `--conditions`
(oven-sh/bun#44611), so the bin runs the `bun` beside it, or `bun` from PATH (`test:launcher`).

```bash
bun install                # entire setup (bun.lock is the lockfile); @gpuix/native ships prebuilt
npm run typecheck          # tsc --noEmit, then svelte-check --fail-on-warnings twice (tsconfig.json for the
                           # GPUI markup, tsconfig.dom.json for the DOM components); the first step of `test`
npm run lint               # eslint; NOT part of `test` (only CI's linux job runs it), so run it before pushing
npm test                   # typecheck, then every test:* below except automation-live and coverage
npm run test:<name>        # test/<name>.ts (test:media also runs test/media-default.ts); each file's header
                           # says what it covers. test:update and test:launcher need `bun` on PATH
npm run test:automation-live  # opens a window: launch()es the counter and drives it; not in `test`,
                           # CI's linux job runs it under Xvfb
npm run test:coverage      # optional; needs SVELTE_SAMPLES_DIR (see "Testing")
npm run demo               # counter, tic-tac-toe, hacker-news and liquid-glass at once (scripts/demo-all.ts)
npm run demo:<name>        # counter (hot-reloads on save), tictactoe, hn, glass, styling, desktop,
                           # native-0.11, cross, ui; docs/contributing.md says what each shows
npm run demo:glass-ffi     # real Liquid Glass (NSGlassEffectView, macOS 26+) via a clang-compiled ObjC shim
                           # + FFI in examples/liquid-glass-ffi/glass.ts; GPUIX_GLASS=0 forces the fallback
npm run demo:web           # tic-tac-toe on GPUI's wasm/WebGPU build at :4173 (scripts/web.ts; --production,
                           # --build-only). BUN ONLY. See "Rendering to the web"
npm run demo:dom           # Vite dev server for examples/cross-target in the DOM, and demo:ui-dom for the
npm run demo:ui-dom        # toolkit's showcase (scripts/dom.ts; -- --build-only, -- --no-open). Vite on Node
npm run tutorial           # examples/tutorial: 12 steps (prose in content/*.md, the registry in steps.ts,
                           # samples/ hot-reload); GPUIX_TUTORIAL_STEP=7 starts at step 7
npm run check:svelte       # every .svelte / .svelte.ts through the Svelte MCP server's autofixer
                           # (scripts/svelte-mcp.ts; `-- --help`). Exits 1 on issues, never on
                           # suggestions. Needs the network
npm run docs               # README.md + docs/*.md → dist/docs (scripts/docs.ts), with the live demos and
                           # the playground; a new page needs an entry in PAGES. docs:serve serves it at
                           # :4321 and rebuilds on change; .github/workflows/docs.yml deploys it
npm run og                 # homepage/og.png from index.html#og through headless Chrome ($CHROME); og:docs
                           # does docs/assets/og-docs.png. Rerun after changing the hero
npm run shots              # every other screenshot the homepage, README and docs carry (scripts/shots.ts,
                           # through the bin; macOS or Windows, Bun and Chrome; -- --only hn,demos), including
                           # docs/ui.md's samples as docs/assets/ui-*.png (scripts/ui-shot frames each in a
                           # window as wide as the docs column; -- --only ui after changing one)
npm run wallpapers         # macOS only: Apple's wallpapers for the share cards, gitignored since they may
                           # not be republished; -- --use <slug> writes the tracked webp a release's `wall` names
npm run vendor             # re-vendor svelte; see "Hard constraints"
npm run parity             # @gpuix/native methods nothing in src/ calls (--all for every method and its
                           # callers); run it after a native bump
npm run pack -- <dir>      # the npm tarball (scripts/publish.ts; publish:npm wraps `npm publish` the same way)
npm run pack:ui -- <dir>   # the UI toolkit's (scripts/publish-ui.ts; publish:ui)
npm run consume            # pack both, scaffold an app with packages/create-gpuix-svelte under $TMPDIR,
                           # install and check it (docs/contributing.md "The consumer path"); fails if a
                           # non-declaration `.ts` ships or tsx lands in the consumer. bun:consume also builds
                           # and checks its binary; consume:open / bun:consume:open open the window
npm run compile            # tic-tac-toe through gpuix-svelte/build into dist/ (-- --archive, -- --aot,
                           # -- --trim); signs/notarizes with CODESIGN_IDENTITY / NOTARY_PROFILE. Bun only
```

Every test and demo script that goes through the bin has a `bun:`-prefixed twin (`npm run
bun:test`, `npm run bun:demo:counter`, ...) running the same entry with `--bun`. Adding a bin script
means adding both halves and, for a test, chaining both into `test` / `bun:test`. `compile` and
`demo:web` are Bun-only, `demo:dom` and `demo:ui-dom` run Vite on Node, `shots` has no twin,
`bun:typecheck` is an alias, `demo` and `consume` take `--bun` for their twins, and the tooling
that needs no loader (`lint`, `check:svelte`, `docs`, `docs:serve`, `og`, `wallpapers`, `vendor`,
`parity`, `pack`, `publish:*`) runs on plain `node`, which strips their types itself.

## Testing

Tests are plain scripts over `gpuix-svelte/test` (`src/test.ts`) — no runner; `docs/testing.md` is
the helper reference. `check(label, actual, expected)` records a failure and `finish(name,
expected)` exits 1 if any happened. **`finish`'s second argument is how many `check` calls should
have run**, and a mismatch (zero included) fails: nothing else counts them, so assertions that stop
executing would otherwise take the file green with them — adding or removing a check means bumping
that number.

A test has to fail when the behaviour it names breaks, which passing says nothing about, so try a new
assertion against a mutation of the code it covers, and put a positive control beside any assertion
that something is absent (the same query finding it when it is there). `check` compares
`JSON.stringify` output, so `undefined`/`null`, `NaN`/`null`, `{ a: undefined }`/`{}`, any `Map` or
`Set`/`{}` and a plain `Error`/`{}` all compare equal, and a missing `expected` means `true`; where
that matters compare what you mean (`.map(String)`, `=== undefined`, `.has()`, the message).

Two refactor hazards: `render()` runs headlessly on a `TestGpuixRenderer` put in its `globalThis`
slot (`test/seed-window.ts`), and `created: true` there depends on `render()` reading `slot.native`
twice, so restructuring that read could open a real window. And `test/update.ts` reaches into
`install()` through internals a refactor can break with no change in behaviour: the
`SharedArrayBuffer` `rename_in` allocates between the swap's renames and its `Atomics.wait` retry
sleep, the `process.cwd()` read right after the swap, `Date.now` read once per relaunch poll, the
`process.platform` reads during extraction and a replaced `process.exit`.

The input helpers run GPUI's real hit testing and input pipeline (`simulateClick` → `drainEvents()`
→ `dispatch()`) and end in `pump()`, which drains and settles until a paint queues nothing more (10
rounds at most); `wait()` pumps on both sides of its sleep, because a window hands over what a
paint queued (`layout`, say) right after that paint, and `Scroller`'s thumb depends on it. Prefer
them over calling `dispatch()` directly, which bypasses hit testing and can pass while the real
window fails (`test/teardown.ts` is the one direct use, for a listener's survival). The pointer
helpers pass a point through unchecked, and the headless renderer delivers a move or release past
the viewport to an element holding pointer capture, so a drag that leaves the window is testable
(`test/scroller.ts`). On macOS the headless width follows `mount_headless`'s, but the height caps
at about 540 logical px (`MAX_HEADLESS_HEIGHT`'s 538 is only error text; a macOS 27 machine
measured 542), so elements below it can't be hit (`click` throws; shift the layout up inside an
absolute wrapper, or wheel them into view). Windows ignores the requested size and sizes from the
display, so never assert against the size you asked for; read `native.getWindowSize()`
(`test/portal.ts`). Since native 0.11 the headless renderer emits `focus`/`blur` itself, so
`focus()` leaves both to native (except when refocusing what `unfocus()` blurred); `unfocus()`
reports a blur itself (the test renderer has no `blur()`) and `deliver()` drops native's repeat of it.

`src/window.ts`'s helpers no-op wherever the renderer lacks the method, so app code never needs
`get_native()?.x?.()` guards. Its node-taking helpers go through `with_native_id`, which defers the
call past the next commit while mutations are queued — from an `{@attach}` the element's
`createElement` has not shipped yet and native throws `GenericFailure`.

On Windows `file_open_dialog` runs inside a GPUI foreground task, so while the picker is open no
`UiCommand` runs: every native call that waits on the UI thread (window size, bounds, scroll and
focus reads, `getElementsAt`, `getAutomationTree`, the overlay reads, `setImage`/`setImagePixels`,
`registerFont`) blocks JS for 2 s and throws `Timed out after 2 seconds…`, and a throw from a timer
ends the process. `applyBatch`, `tick`, `scrollTo` and the focus commands don't wait. So on Windows
`prompt_for_paths` counts open dialogs, and until the last one closes `read_native` answers null
without calling native, `window_size` reads the size taken as the dialog opened, and `upload` keeps
the newest image per element. macOS and Linux keep the UI thread running behind the picker, so
there it only forwards the call. A call in flight as the last window closes throws too (`The GPUI UI
thread stopped during…` or the timeout), so `read_native` and `upload` go through `answered`, which
swallows those two texts and nothing else (by text, so a reworded message fails open).
`test/dialog.ts` fakes the platform and the blocked thread, so macOS CI runs the Windows path, but
only a real window on Windows exercises the real thing.

On Windows and Linux, `getElementBounds`, `getElementsAt` and `getAutomationTree` each draw a full
frame (`window.refresh()`, answered from `on_next_frame`), so reading them on a timer keeps an idle
window drawing; `onlayout` / `onscrollchange` are the way to be told instead. Under Wayland a
minimized window gets no frame callback, so those three block JS for 2 s and throw every time
(`read_native` swallows the throw, not the stall).

CI is `.github/workflows/test.yml`: `npm test` on macOS, Windows x64 and Windows arm64 × Node 24
and 26 and `bun:test` on those three; `consume` + `bun:consume` there and on Linux; `compile` on
all four (`--archive` with an `update` keygen/manifest/verify round trip, then `--aot --trim`; built,
never launched); and a Linux job for what needs no headless renderer: `typecheck`, `lint`, the
scaffolder's `npm pack --dry-run`, a binding load check, the suites docs/contributing.md lists, the
`--build-only` builds of `demo:web`, `demo:dom` and `demo:ui-dom`, and `test:automation-live` under
`xvfb-run`, on both runtimes where there are twins. `TestGpuixRenderer` is Metal on macOS and
DirectX on Windows.

`test:coverage` mounts every sample from Svelte's own custom-renderer suite; point
`SVELTE_SAMPLES_DIR` at a svelte checkout's `packages/svelte/tests/custom-renderers/samples` (it
skips at exit 0 otherwise). It copies them into `test/.samples-tmp` first, because importing in
place would mix two Svelte runtimes. It asserts at least 33 mount, no unexpected compile error,
and exactly one runtime failure, raw-snippet (whose `_config.js` declares `error:` rather than
`compile_error`); at the last count 33 of 47 mounted and 13 were refused by design.

### Seeing what a demo renders

A window can't be inspected from a terminal, but a PNG can:

```bash
GPUIX_SCREENSHOT=/tmp/x.png npm run demo:counter    # a PNG after every mount/remount (one demo at a time)
GPUIX_FPS=1 npm run demo:hn                         # GPUI's draw-time overlay (=minimal for the last draw
                                                    # only). Draw time, not fps: 8.3 ms is 120 Hz
```

Then open the PNG with the Read tool. Headless code calls `screenshot(path)` from
`gpuix-svelte/test` (the real GPU pipeline, no window). From code the overlay is `render()`'s
`debugFrameOverlay` option; `GPUIX_FPS` outranks it, and the option is re-applied only when a later
`render()` changes it, since `render_hot` remounts with the same options and must not undo a runtime
`cycle_debug_overlay()`.

The Linux addon's `captureScreenshot` throws, so on Linux take pixels from X11: `Xvfb :99 -screen 0
1280x800x24` with `DISPLAY=:99` and `WAYLAND_DISPLAY` unset runs a window on Mesa's software Vulkan,
and `xwd -root` reads it (24 bits per pixel, not 32). Behaviour goes through `launch()`, which needs
no pixels. For the Wayland path, `dbus-run-session -- gnome-shell --headless --wayland --no-x11
--virtual-monitor 1280x800 --wayland-display gpuix-wl` is a private GNOME that leaves the desktop
alone (give it a short `XDG_RUNTIME_DIR` under `/run/user`, or the socket path overflows), and
`WAYLAND_DEBUG=1` shows what a window told the compositor.

`.devcontainer/` is that setup ready-made; docs/contributing.md "Developing in a devcontainer"
covers using it. Bun is pinned in its `Dockerfile` while CI's `setup-bun` takes the latest, so bump
the pin with a Bun release. `start-display.sh` runs Xvfb and serves it as noVNC (noVNC and
websockify from upstream tags, since Ubuntu's packages pull in nodejs and numpy), with an
`index.html` handing noVNC a relative websocket path so it works behind code-server's
`/proxy/6080/`. `BROWSER=none` is read by Vite and `docs:serve`; `xdg-open` alone ignores it and
starts a real Chrome on `:99`.

### Driving a running app

`docs/testing.md` covers the API. `gpuix-svelte/automation` (`src/automation.ts`) re-exports
`@gpuix/native/automation`'s `App` / `Locator` / `AutomationError` but has its own `launch()`,
because upstream's pipes stderr and never drains it, SIGTERMs on `close()`, hangs on an app that
dies before `initialize`, and decodes each chunk on its own, splitting a multi-byte character. Ours
spawns the bin with `GPUIX_AUTOMATION=1` and stderr inherited, connects with upstream's
`connectStdio`, and its `close()` ends the app's stdin. `test_app()` is the same `App` over
`TestGpuixRenderer` (`headless_renderer()`, with test.ts's simulate → drain → settle discipline);
its tree, text and screenshot reads settle first, its bounds, selection and scroll reads don't.

`GPUIX_AUTOMATION=1` is deliberately explicit rather than upstream's stdin-is-not-a-TTY sniffing:
stdin is not a TTY under CI, `nohup`, an agent's shell or `demo-all.ts`'s children, and the variable
is what lets stdin ending mean "exit". The window takes focus as usual, because one that is not key
gets no input focus (no `focus`/`blur`, no caret, `e.editing` false). Under it `render()` starts
`src/automation-server.ts` right after creating the window (so `render_hot` remounts reuse it),
which rebinds `console.log`/`info`/`debug` to stderr: stdout is the wire, and a logged line starting
with `data:` would merge into the next reply. The server is imported through a computed specifier
so the normal app path never loads it, and `build()` defines `process.env.GPUIX_AUTOMATION` to `""`
with `render.ts` reading it spelled out inside the `if` itself (a local const holding it leaves the
import in), so the branch folds away and a compiled binary cannot serve; otherwise `aot` compiles
the server and zod in. The server owns its stdio loop, to answer an unparseable request that has an
id with a `Protocol` error (upstream drops it and the driver waits forever) and to answer what is in
flight before stdin's end exits. Upstream's `liveRendererAsTest` ticks synchronously after each
input, but the napi callback carrying the event runs on a later loop turn, so a read right after a
click could miss a just-shown node; the server hides `tick` and wraps the backend (`frame_synced`):
requests run one at a time and every input replies only after two of the frame loop's own ticks
(`next_frame()`, which brings each one forward); reads and `screenshot` don't wait. In a live window
a native `:hover` outlives the move that left the element until a move after a read, so a capture
after a click goes move, read, move (`scripts/shots.ts`).

### Measuring frame cost

Scroll lag here is native per-frame layout, not JS, so measure before reasoning. `src/window.ts`
wraps GPUI's own draw times on both renderers: `set_debug_overlay(mode)`, `cycle_debug_overlay()`,
`debug_overlay()`, `reset_debug_overlay_stats()` and `debug_overlay_stats()` (cur/p90/p99/max ms
and a frame count, recorded even while the overlay is hidden). A headless bench is those calls and
`wheel()` around `mount_headless`; over a real window, the same calls around `render()` plus a wheel
through `gpuix-svelte/automation`. Keep the baselines next to the app so a regression shows.

## Shipping

### Standalone binary

User-facing steps, signing and notarization are in `docs/shipping.md`. The implementation is
`gpuix-svelte/build` (`src/build.ts`, Bun-only, plus the runtime-agnostic `src/app-bundle.ts`),
which `scripts/compile.ts` and a scaffolded app's `build.ts` both call as `build({ entry })`. It is
`Bun.build({ compile })` over a static-`render()` entry — `render_hot` re-imports from disk and
can't live in a binary, so the dev entry (`main.ts` in the examples, `app.ts` in the starter) stays
separate — followed by the platform's packaging. `Bun.build` never sees the `Bun.plugin`
registration from `bunfig.toml`, so it wires `src/plugin.ts`'s exported hooks in itself:

- `load_svelte` / `load_module` compile components, and the build counts the components that went
  through them, because without the plugin a `.svelte` import silently becomes a file asset while
  the build still succeeds.
- `resolve_svelte(conditions)` pins `svelte` to the bundled copy under the build's own conditions
  (`custom-renderer` + `production` here, `custom-renderer` + `browser` in `scripts/web.ts`).
  `production` only takes effect together with the `process.env.NODE_ENV` define, because Bun
  implies `development` otherwise and esm-env lists it first.
- `resolve_native_cjs` points `@gpuix/native` at its `index.cjs`: the ESM loader finds the `.node`
  through `createRequire(import.meta.url)`, which `Bun.build` cannot trace, and without the CJS
  entry the binary ships without the addon and dies at launch — the size floor catches that. Bun
  embeds only the host's prebuild, so a binary is built on the OS it targets.

`autoloadBunfig` and `autoloadDotenv` are off, so a `bunfig.toml` or `.env` beside the binary can't
reconfigure it. `GPUIX_SVELTE_RENDERER` is a build-time variable on this path.

`build({ aot, trim })` passes Bun's experimental `compile.aot` / `compile.trim`, both off by
default (`trim` may also be Bun's `{ allow, remove }` object); docs/shipping.md "A smaller
executable" has the sizes. A Bun without them ignores them silently and `Bun.version` can't tell a
canary apart, so `supported_flags` asks `bun build --help` for each flag and logs the ones it drops.
With either one on, the size floor gives way to a search for the host prebuild's bytes in the
executable (`native_addon()` in `app-bundle.ts` finds the prebuild), and `@gpuix/native` resolves to
a one-line `require()` of that prebuild instead of napi-rs's loader, which keeps Bun's module loader
and interpreter in. The default build keeps the loader, since no CI job launches a compiled binary.

To see what stops `trim`, add `aotExplain: ['trim']` to an `aot` build's `compile` and read the
`trim:` lines in `result.logs`: `blocked by` names the cause and where. Fixed so far, each worth
measuring again after a change near it: a computed key on `globalThis` (hence the named
`__gpuix_svelte_host` slot), the automation `import()`, `process.getBuiltinModule` in
`previous-instance.ts` / `screen-reader.ts` (now static `node:fs` / `node:child_process` imports,
which Bun's browser build stubs) and the napi-rs loader. What remains in an app with updates is
`Function` at `update.ts`'s `new AppUpdate`, which keeps the interpreter, from two triggers no edit
in our code has cleared: adm-zip's read path (`new AdmZip(path)` + `getEntries()`) and the
`AppUpdate` instance reaching the component. `trim: { remove: [...] }` gets past them, but it
overrides the compiler (a removed feature throws `ERR_FEATURE_REMOVED`), so it stays opt-in. Typing
doesn't help `trim`: narrowing types changed nothing, and shipping the TypeScript under an `"aot"`
export condition made the executable larger.

**App metadata comes from `render()`'s `app` option** (`AppOptions` in `types.ts`;
docs/shipping.md has the fields and defaults), so the entry is the one place that names the app.
The window reads `name` as the `title` fallback and as `appName` (macOS's Hide and Quit items), and
`identifier` as `appId`, which GPUI hands to Wayland and X11 (`WM_CLASS`) and a desktop matches a
`.desktop` file by; an explicit `title`, `appName` or `appId` wins (`window_options_for` in
`render.ts`). `build()` reads them from the entry's source: `Bun.Transpiler` strips the types and
`read_app_options` (`app-bundle.ts`, so `test:bundle` runs it on Node too) walks acorn's AST for the
one top-level `render()` imported from `gpuix-svelte`. Its second argument must be an object literal
or one hop through a top-level `const`; a spread or computed key anywhere in it, or a value under
`app` that is not a string literal, plain template, top-level `const` or `new URL('x',
import.meta.url)`, fails the build, while a computed `title` is dropped. `resolve_app_info` fills
the defaults.

Per platform:

- **macOS**: the executable moves into `dist/<Name>.app/Contents/MacOS/<slug>` with an `Info.plist`
  and `AppIcon.icns` cut by `sips` + `iconutil`; signing and notarization (`sign`, `notarize`) run on
  the bundle when the env vars are set, and the bare binary is not kept.
- **Windows**: the icon becomes a PNG-compressed `.ico` (`write_ico`: 256/48/32/16, scaled with
  .NET's `System.Drawing` through PowerShell) in Bun's `compile.windows` with `hideConsole: true`.
  The largest image comes first because Bun writes the `.ico` as group `#0` beside bun.exe's own
  `IDI_MYICON`, which the shell picks and which points at the first image (Explorer also caches
  icons by path, so check a build under a new file name). GPUI's window class loads icon resource
  1, which neither group is, so the title bar stays generic while the taskbar shows the exe's icon.
  Whatever `compile.windows` leaves unset keeps bun.exe's value (`Bun`, `Oven`, its version), so
  `description` and `publisher` fall back to the name, `copyright` to a single space, and the
  version is its numeric prefix (`0.0.0.0` if none fits).
- **Linux**: the bare executable.

An app that sets no `icon` gets `DEFAULT_ICON`, `assets/icon.png` (in `files` and publish.ts's list,
so it ships): the homepage's macOS tile, rasterized at 1024 px from the `icon.svg` beside it through
Chrome over CDP, since `sips` drops the bold weight and `qlmanage` paints a white background.

### Updates

`docs/updating.md` is the user-facing page. `gpuix-svelte/update` (`src/update.ts`, with `src/zip.ts`
over adm-zip, its one dependency) is in-house: nothing on npm fits a Bun-compiled app (Velopack needs
the .NET `vpk` toolchain, a second napi addon and its own installers; the rest are Electron- or
CLI-shaped), and `@gpuix/native`'s own `checkUpdate` (a cargo-packager-updater port) was rejected —
it installs only cargo-packager artifacts, doesn't sign the feed's version, holds the download in
memory, never relaunches or rolls back, and has no dev-run, translocation or writability guard. The
decisions behind it:

- **The build embeds what the app knows about itself.** `build()` defines
  `process.env.GPUIX_APP_INFO` as the JSON of `EmbeddedAppInfo`, which `app_info()` reads as that
  exact expression (not through a helper, or Bun's `define` would miss it), and defines
  `GPUIX_UPDATE_MANIFEST` to `""` so the dev-run override can't redirect a shipped app.
  `read_app_options` refuses anything under `app.update` but `manifest` and an optional `publicKey`,
  and `build()` a non-semver version when `update` is set, because a wrong value ships in an
  executable that can never update itself to a fixed one.
- **Installability is decided before anything is downloaded** (`resolve_target`). `is_compiled`
  checks `Bun.main` under `/$bunfs/` or `~BUN`, never a name heuristic, and writability is a real
  `mkdtemp` probe, since Windows ACLs ignore `accessSync`. Both URLs must be `https:` (loopback
  `http:` allowed), and `check_url` is applied to `response.url` too, so a redirect can't leave https.
- **The payload is a zip on every platform**, through adm-zip, chosen over a hand-written reader:
  zero-dependency, widely used, inflating through `node:zlib` (`Bun.Archive` reads only tar, and the
  module must run on Node for the tests). `src/zip.ts` adds what adm-zip lacks: each entry name is
  validated as it is extracted (absolute, drive letter, backslash, `..`, `.` → `ZipError`; what came
  before stays in staging, which `install` removes), modes are masked to `0o755` (`0o644` without
  one), `._` and `__MACOSX` sidecars are skipped (they break a signed bundle's seal), and symlinks are
  refused at both ends. `extract` tells the download apart by magic bytes, never by the URL, and the
  download lands under a fixed name in its own `mkdtemp`, so nothing from the URL becomes a path.
  The only `ditto` calls left are `notarize()`'s submission zip and its rebuild after stapling,
  which with `archive: true` is the shipped file, so the reader is tested on a ditto zip.
- **`locate` / `check_bundle` guard against a wrong upload, not a hostile manifest**: the values
  they check live in the attacker's own archive, so with an unsigned manifest whoever controls the
  host has code execution on every client. The manifest signature is the only trust; `publicKey`
  stays optional as a decision, and the docs say so.
- **The swap** renames the old app aside (into a `mkdtemp` staging directory beside the target, so
  the renames never cross a filesystem; to `.exe.old` on Windows, where a running exe can be renamed
  but not deleted) and the new one in, and keeps the old copy until the new instance has started.
  Staging and download directories carry the pid (`.update-<pid>-…`, `gpuix-svelte-update-<pid>-…`),
  so `finish_update()` deletes those whose process is gone; a failed rename-back leaves
  `.update-kept-…`, which the sweep's pattern never matches, and `StrandedError` names it. No
  code-signature check, as a decision.
- **Relaunch** is Electron's `app.relaunch()` with no helper process: `spawn` of the new executable
  itself (never `open`, a shell or PowerShell; no `windowsHide`, which would apply to the app's own
  window), detached, with this process's arguments. Electron's readiness handshake and
  wait-for-parent are kept in portable form: `GPUIX_RELAUNCH_AFTER=<pid>` and
  `GPUIX_RELAUNCH_READY=<sentinel>` go in the child's environment, the old process exits only once
  the sentinel appears (10 s, `READY_TIMEOUT`), and anything else rolls back (killing a slow new
  instance first, so it can't come up beside the restored app). The new instance's
  `wait_for_previous_instance()` (`src/previous-instance.ts`, called by render.ts before the window
  is created) writes the sentinel and then waits for the old pid to exit; it takes all three
  variables out of the environment so children don't inherit them, and `updated_from()` reads only
  `GPUIX_UPDATED_FROM`, so an app can call it before `render()` without the old instance rolling
  back. Node throws ENOEXEC (a wrong-architecture build) from `spawn` itself and puts ENOENT on the
  event; `test:update` goes through the first, since its fake executables can't exec. Windows
  de-elevation has no portable equivalent and is not done.
- **One install at a time.** `installed` makes a later `install()` throw and `installing` (set
  before the download) a concurrent one; a download in flight is shared, and a later caller's
  `signal` ends only its own wait (`until_aborted`).
- **Trust.** sha256 and `size` are checked while streaming, and the download stops once it passes
  `size`. An ed25519 signature over `canonical_manifest()` is required when the app carries
  `publicKey`; it covers everything and does not expire, so a hijacked host can replay an old signed
  manifest (documented, not solved). `build()`'s `beforeArchive` hook, which runs only with
  `archive: true` and before macOS signing, is where `signtool` goes.
- **Browser bundles** get `src/update-web.ts` through the `browser` condition on `./update`: the
  real module's `node:crypto` key functions have no browser shim and broke `demo:web`.
- **Release side.** `build({ archive: true })` writes `<slug>-<version>-<platform>.zip` and
  `update-<platform>.json`, which `gpuix-svelte update manifest` (`bin/update.js`) merges.
  `starter/.github/workflows/release.yml` is the GitHub golden path; this repo's `release.yml` runs
  the same build matrix and manifest job on tic-tac-toe, whose `standalone.ts` points at this
  repo's `releases/latest/download/update.json`, so every release exercises the path and the built
  example updates itself.

### Rendering to the web

`demo:web` is GPUI itself compiled to `wasm32-unknown-unknown`, painting a WebGPU (WebGL2 fallback)
`<canvas>` that the wasm appends to `<body>` with a hidden IME `<textarea>`. It is the same element
tree, the same `applyBatch` protocol and the same error-first callback, so `style.ts` and
`events.ts` are untouched, `renderer.ts` only reads the wasm's plain-string errors, and the pixels
match the desktop app. (A browser DOM is the other target; see the next section.)

`@gpuix/native` ships the build (`browser.mjs`, `wasm/gpuix-web.js` and a ~20 MB `.wasm`).
`browser.mjs` pulls the wasm in with `with { type: 'file' }`, which only Bun reads, so
`scripts/web.ts` (`Bun.build({ target: 'browser' })` with `build.ts`'s plugin hooks) is Bun-only and
fails if no `.wasm` was emitted; the docs' playground builds the same path with Vite by importing the
wasm through `?url`. The package's `custom-renderer` → `browser` export is `src/web.ts`, everything
`index.ts` has but `render_hot`. docs/shipping.md has the hosting side (cross-origin isolation,
`application/wasm`, no `file://`). A browser bundle has no `process`, and a bare `process.env.X`
throws before `render()` mounts — with GPUI already up, which makes it look like a renderer bug;
hence `env()` in `render.ts`.

The wasm class differs from the napi one (`node_modules/@gpuix/native/wasm/gpuix-web.d.ts`):
`requiresTick()` is false, so the frame loop never starts and `set_auto_commit(true)` carries every
commit; `init(options)` ignores its argument, so the page's CSS sizes the canvas; and it has no
screenshots, window controls, keystroke simulation or overlay stats, so frame-cost measurement is
desktop-only. It has everything `Scroller` needs and `getAutomationTree()`, but no `getTreeJson()`.

CI builds it (`demo:web -- --build-only`) and `test:docs` builds the playground's wasm frame, but
nothing runs the wasm automatically: `gpuix-svelte/test` is napi-only. Verify by hand with headless
Chrome over CDP (`--headless=new --enable-unsafe-swiftshader --remote-debugging-port=9222`, then
navigate and read `Runtime.consoleAPICalled`). Avoid `--virtual-time-budget`: GPUI never goes idle,
so Chrome fast-forwards frames forever and hangs.

### Rendering in the DOM

`src/dom.ts` is Svelte's own DOM renderer: what `gpuix-svelte` resolves to without the
`custom-renderer` condition, which is every browser toolchain (Vite, SvelteKit) and never the
desktop path. `exports["."]` nests the conditions — `custom-renderer` → (`browser` → `web.ts`, else
`index.ts`), `default` → `dom.ts` — and `./components/*` likewise falls back to
`src/components/dom/*`; `./dom` names the DOM build for a tool that sets `custom-renderer` anyway,
such as a hybrid app's tsconfig. `docs/dom.md` is the user-facing page.
`github.com/khromov/gpuix-svelte-sveltekit-shared-components-demo` is a companion repository (a
SvelteKit site and a GPUI window sharing one component library on this package, with the two
typechecks a hybrid app needs); a change to the DOM build's API or the components' props should
keep it building. The design:

- **`IS_GPUIX` is a constant per entry** (`true` in `web.ts`, hence in `index.ts`; `false` in
  `dom.ts`), not `get_native() !== null`, so a `.svelte.ts` module can read it before `render()`.
- **`dom.ts` mirrors `web.ts`'s export list** (`test/dom.ts` checks the names) with the browser's
  version of each call, or a typed no-op where only GPUI has the feature. The host plumbing
  (`renderer`, `set_native`, `create_root`, `commit`, `dispatch`, …) is deliberately absent;
  `render_hot` is there only to reject with a message naming the bin, because an entry run as plain
  `node app.ts` lands here and would otherwise die on a missing-export SyntaxError. `render()` sets
  `line-height: 1.618` on `<body>`, GPUI's default (`phi()`), because native takes `lineHeight` in
  px only, so the GPUI side can't be given a relative one, and a browser's `normal` (1.15–1.3) made
  every GPUI line look a quarter taller. Every `document`/`window` read goes through
  `doc()`/`win()`, so SvelteKit's server pass gets no-ops. `focused_element()` and `elements_at()`
  return DOM elements typed as `ShadowNode`, because a shared component is typed by the GPUI project.
- **The DOM components** keep the GPUI props (`testid` as `data-testid`). `Anchored.svelte` stands
  in for the native element: `Tooltip` and `Popover` hang a `position: fixed` layer off `<body>`,
  placed on every animation frame while shown (as GPUI does); the first placement runs `untrack`ed,
  or a prop change would re-run the attachment, re-hang the layer and blur what has focus in it.
  `Tooltip` passes `occlude={false}` (`pointer-events: none`), because a tip snapped over its own
  trigger must not take its clicks, so the DOM tip can't hear hover. `Portal` and the layers render a
  `display: contents` slot that stays in place and move only the inner element to `<body>`: the slot
  is the node Svelte holds, so a keyed `{#each}` that reorders the component moves the slot and
  leaves the layer in `<body>`. `pointer-events: none` is inherited in the DOM, unlike on GPUI, so
  the portal's direct children get `pointer-events: auto` from a zero-specificity `:where()` rule.
- **Typechecking is split.** The root tsconfig excludes `src/components/dom`, which
  `tsconfig.dom.json` covers with no `customConditions` (so `gpuix-svelte` resolves to the DOM
  build) and the default `svelteHTML` namespace. Never put a `vite.config.*` beside a component:
  svelte-check reads it as that component's Svelte config and drops the a11y `warningFilter`.
  `scripts/vite-dom.ts`'s `dom_plugins` are what every DOM build here shares — the svelte plugin
  with `configFile: false` (the repo's `svelte.config.js` would turn the custom renderer on), the
  a11y filter, and a `resolveId` that sends the bare `gpuix-svelte` and `gpuix-svelte-ui` through
  `import.meta.resolve` under Node's default conditions — while each caller sets Vite's own
  `configFile: false`. The callers are `scripts/dom.ts` (`demo:dom`, and `demo:ui-dom` through
  `--root`), `scripts/ui-bundle.ts`, `scripts/docs.ts` and `scripts/playground.ts`.
- **The docs' live demos.** A fenced block in `docs/*.md` with the info string `svelte demo
  [name]` is both the code sample and a component (docs/contributing.md "Docs site" has the authoring
  side). `scripts/docs.ts` writes the demos to `dist/docs-demos/` (under `dist`, which tsc,
  svelte-check and eslint skip) with a generated entry that mounts each with Svelte's `mount`,
  catching per demo, and exports `mount_demos()` for `test/docs.ts`, which needs
  `preserveEntrySignatures: 'strict'` or an app build drops it. The bundle lands before
  `homepage/` is copied, so a `demos.js` there hits the collision check. The demo tokens sit on
  `:root`, not on the frame, because `Tooltip` and `Popover` hang their layer off `<body>`, and
  because the `dom.md` theme demo's `set_css_vars` writes `<html>`'s inline style, which outranks
  the `:root` rule; no demo may name the site's own tokens (`--bg`, `--fg`, `--accent`, …). The
  frame reads the toolkit's `--ui-bg` / `--ui-ink` ahead of `--paper` / `--ink`, which only
  `ui.md`'s demos set, or its light palette left dark ink on the dark frame. `test/docs.ts` runs
  the build on Node whatever runtime runs it and mounts each built page's demos under happy-dom.
- **The docs' playground** (`playground/`, built by `scripts/playground.ts` into
  `dist/docs/playground.html`). The page (`main.ts`, the CodeMirror editor in `editor.ts`, link
  sharing in `share.ts`, `examples/*.svelte` read with `?raw` and typechecked as GPUI markup)
  compiles in the browser and runs the result in one same-origin iframe per renderer, because
  GPUI's wasm appends its canvas to `<body>` and can never be torn down, and the DOM `render()` takes
  `<body>` too. `compile.ts` uses `src/compile-core.ts` (the package's compile step with no `node:*`
  or `process`) for GPUI and `svelte/compiler` with `css: 'injected'` for the DOM, then `link()`
  rewrites every import to a URL. The trick it rests on: each frame is a Vite build whose entries
  are the frame script plus one tiny re-exporting module per specifier in `modules.ts`
  (`preserveEntrySignatures: 'strict'`, names from `file_of`), so the blob module a frame imports
  shares the frame's chunks — one Svelte runtime, one renderer, live bindings intact. An import
  outside that list is a compile error naming it; a new shipped component or svelte entry point
  goes in `modules.ts`. The GPUI frame swaps `@gpuix/native` for a virtual module importing the
  wasm through `?url`, under `custom-renderer` + `browser`, with `base: './'`. `frame-gpui.ts` wraps
  `applyBatch` and posts every batch to the page, where `tree.ts`'s `Mirror` rebuilds the element
  tree, text wrappers included, for the Render tree and Mutations views. The GPUI frame is
  remounted through `render()` on every edit (so `set_css_vars` values outlive a run, while a
  `:root` rule goes with the source that declared it, compiled hot), the DOM frame reloaded; both
  get `frame.ts`'s `ROOT_STYLE` (black background, `#ededed` text), because GPUI's default text is
  black on an unpainted black window.
  **Fonts**: the wasm can't reach system fonts and has no `registerFont`, so it draws in the eight
  faces it embeds (IBM Plex Sans 400/600 and Lilex 400/700, each with an italic), and the DOM frame
  loads the same faces from `homepage/assets/fonts/gpui/`, cut out of `gpuix-web_bg.wasm` (scan for
  sfnt headers, length from the table directory) and compressed with fontTools; redo that if a
  native bump changes the embedded fonts. **Isolation**: GitHub Pages can't send COOP/COEP, so an
  inline script registers `playground/sw.js` (published as `playground-sw.js`, scope
  `./playground`) and reloads once; the worker re-serves every response with `credentialless`, or
  `require-corp` in Safari, which lacks `credentialless` and so loses the cross-origin analytics
  script. Without isolation (no service worker, plain `http:` off localhost, `docs:serve`) the page
  defaults to the DOM renderer and shows a note if GPUI is picked. Checking the wasm side is by
  hand in headless Chrome, as for `demo:web`, with `--enable-unsafe-webgpu` or
  `--enable-unsafe-swiftshader`.
- **`test/dom.ts`** registers happy-dom's globals before anything imports `svelte`, compiles the DOM
  components and the example into `test/.dom-tmp/`, and rewrites their `gpuix-svelte` and component
  specifiers to `src/dom.ts` and the compiled components, because the process itself runs under the
  custom-renderer condition. `check` compares JSON, under which every DOM element is `{}`, so element
  identity is asserted as `a === b`. `test/cross-target.ts` mounts the same example on GPUI.
- **Publishing**: `scripts/publish.ts` rewrites nested condition objects recursively and leaves
  `.svelte` pattern targets alone. `scripts/consume.ts` builds a Vite page in the consumer with a
  plugin that fails if any `svelte` import made from inside the package resolves to the bundled copy
  instead of the app's (vite-plugin-svelte's `resolve.dedupe` keeps them apart), then runs the GPUI
  test again, because an app on both targets has the registry svelte in its root `node_modules` and
  the loaders have to keep pinning the bundled one.

### The UI toolkit

`packages/ui` is `gpuix-svelte-ui`, a second published package: one set of `.svelte` components for
both renderers (written to `docs/dom.md`'s rules and typechecked under both tsconfigs), the `--ui-*`
theme, a toast queue, a router and the per-renderer helpers they share. `docs/ui.md` is the
user-facing page and `packages/ui/README.md` the npm readme. The design:

- **A Bun workspace.** The root's `workspaces: ["packages/ui"]` links `node_modules/gpuix-svelte-ui`
  → `packages/ui` (a root dependency on it would break a Bun `file:` install of this checkout, which
  the companion repository makes; the scaffolder stays out of the glob so its bin's mode and the
  lockfile are untouched), and the package's `devDependencies["gpuix-svelte"]: "workspace:*"` links
  the root in as `node_modules/gpuix-svelte` → `..`, so the components' bare imports resolve to the
  root under whichever conditions the toolchain sets. The in-repo manifest has no
  `peerDependencies`, because Bun fetches a peer named like the root from the registry instead of
  linking it; `scripts/publish.ts` strips `workspaces` from the published root manifest.
- **Imports between `.svelte` and `.ts` go by package name** (`gpuix-svelte-ui/keys`,
  `gpuix-svelte-ui/components/Icon.svelte`), never relatively: the published `.ts` modules live in
  `lib/` while the `.svelte` files stay under `src/components`, so only the package's own `exports`
  resolve from both places. `.ts` → `.ts` imports stay relative. `scripts/publish-ui.ts` is
  `publish.ts` for this package (its comments and `tsconfig.lib.json`'s have the `preserveSymlinks`
  and `svelte.d.ts` reasons) and adds the `peerDependencies` (`gpuix-svelte: ^<its own version>`,
  `svelte` optional) for the length of `npm pack` / `npm publish`. release-please keeps its version
  equal to the root's, and `consume` installs its tarball beside the root's.
- **Per-renderer differences stay in `src/shared.ts`** (spreads such as `own_hitbox`, `test_id`,
  `aria_*`, `drag_handlers`; reads such as `bounds_of`, `focus_node`, `holds_focus`) and
  `src/keys.ts` (`chorded`, `activates`), since the DOM typecheck refuses GPUI attributes written out
  and GPUI measures through native. `Icon` is the one `{#if IS_GPUIX}` in markup, because `{@html}`
  is refused under the custom renderer even in a branch. The components' own comments carry the
  other per-renderer reasons (the text fields' `focused` class and disabled `.shield`, `Toggle`'s
  `motion`, `Toaster`'s key, `Select` on Alt+Down).
- **CSS that holds on both**: no descendant selectors, no `@keyframes` (`Spinner` and `Skeleton` are
  timers), a length `flex-basis` only under a width query (`0` is fine anywhere; GPUI has no `auto`
  for it), and `border-width: 0 0 1px 0` rather than a lone `border-style`, which a browser draws
  3 px wide.
- **Escape goes through the package's `dismiss_layer`**, not a stack of the toolkit's own: `Dialog`
  takes a layer while open (a non-dismissable one too, so its Escape never reaches an overlay
  underneath) with its `dismiss_scope()`, and `Menu` and `Select` are on the stack through their
  `Popover`. A `Tooltip` or `Popover` inside a `Dialog` therefore closes first and the `Dialog` on
  the next press, which `test:ui` and `test:ui-dom` assert through the showcase's Cancel tooltip.
- **The router** (`src/router.ts`, `Router.svelte`, `Link.svelte`; docs/ui.md "Screens and
  routing") keeps its store in module state, so a window keeps its screen across a `render_hot`
  remount (`start_router` is once per process; `stop_router` exists for the DOM test). In a page the
  history API or the hash holds the stack while the position (`index`, `length`, `visit`) rides in
  each entry's `history.state.__ui`, which is how `can_go_back` / `can_go_forward` stay right
  through the browser's own buttons; `router.ts`'s comments cover each case. The invariant is that
  the entry the page is on always carries the current length (an entry is stamped again when a pop
  arrives on it with a stale one). A known limit: the router can't count entries other code pushes
  without a `popstate`, so the flags can be off by one around them.
- **Tests and demos.** `packages/ui/showcase/Showcase.svelte` places the components with test ids;
  `demo:ui` opens it, `demo:ui-dom` serves it, `test/ui.ts` clicks through it headlessly (wheeling
  each target into the ~540 px viewport first) and `test/ui-dom.ts` under happy-dom from the Vite
  bundle `scripts/ui-bundle.ts` writes (on Node even under Bun). That test replaces happy-dom's
  `HistoryItemList.prototype.replace`, whose `replaceState` drops the entries ahead of the current
  one as no browser does.

## Hard constraints

- **TypeScript sources run as-is; no build step in the repo.** `exports` points straight at
  `src/*.ts`, and Node and Bun both strip the types natively — no tsx, no loader for `.ts`.
  `tsc --noEmit` (strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`, explicit `./x.ts`
  specifiers) covers everything in `tsconfig.json`'s `include`; `types/*.d.ts` hold the ambient
  shims. Keep it that way: no enums, namespaces or parameter properties, and no `dist/`. The only
  emit is inside the tarball, because Node refuses to strip types under `node_modules`:
  `scripts/publish.ts` runs `tsc -p tsconfig.lib.json` into a gitignored `lib/` (JS with
  `rewriteRelativeImportExtensions`, declarations beside it, plus a copy of `src/html.d.ts`),
  rewrites the declarations' `./x.ts` specifiers to `./x.js`, and for the length of
  `npm pack`/`npm publish` points `main` and every `src/*.ts` export at `lib/*.js` (TypeScript finds
  each `.d.ts` beside its `.js`, so there are no `types` conditions) and ships `lib`,
  `src/components`, `bin` and `assets/icon.png` only. tsc wraps the two computed `import()`s in an
  inlined `__rewriteRelativeImportExtension` helper: `render_hot`'s, inert since its specifier is
  always a `file://` URL, and `render.ts`'s `'./automation-server.ts'`, which it rewrites to `.js`.
  The starter's tsconfig carries `erasableSyntaxOnly`, `verbatimModuleSyntax` and
  `allowImportingTsExtensions`, so an app's `tsc` rejects what Node's stripping cannot run.
  `bin/gpuix-svelte.js` is plain JS (checked via `checkJs`) because it is what starts the runtime.
- **Markup is only typechecked by svelte-check** (tsc never opens a `.svelte` file;
  `--diagnostic-sources js,svelte`, since the CSS source flags GPUI-only properties like
  `selection-color`). tsconfig's `"svelteOptions": { "namespace": "gpuixHTML" }` makes svelte-check
  and the editor type markup against `src/html.d.ts` (GPUI's tags, Svelte-spelled attributes,
  `GpuixEvent` handlers) instead of Svelte's DOM `svelteHTML`. Mind two svelte2tsx quirks: it
  lowercases attribute names except `on*`, names on hyphenated tags and the `{shorthand}` form, so
  `html.d.ts` declares `minrows` and `minRows` both; and it splits blocks on a literal
  `<style>`/`<script>` even inside a comment or string. `svelte.config.js` is read by the editor and
  svelte-check, never at runtime; svelte-check pulls the registry's svelte in as its peer, which
  lacks `customRenderer`, so the starter's sets only the a11y `warningFilter`. README "TypeScript"
  has what a consumer's tsconfig needs.
- **Node >= 24** (`engines`; the package needs `module.registerHooks` and `stripTypeScriptTypes`;
  only the glass-ffi demo needs 26.1's experimental `node:ffi`) or **Bun >= 1.4.0**. See "Runtime"
  for where runtime-specific code may live.
- **Never `bun --hot`.** `render_hot` implements its own in-process reload; `--hot` re-evaluates
  Svelte's runtime, so the old component belongs to a module instance the new one can't see and
  `unmount()` fails.
- **`svelte` is vendored and bundled**: `dependencies.svelte` is
  `file:vendor/svelte-<version>-<sha7>.tgz`, a build of sveltejs/svelte at that commit of the
  custom-renderer PR stack (#18042 → #18405 → #18461 → #18511, whose `custom-condition` branch is
  the tip), and `bundleDependencies` lists it, so the npm tarball carries that build (and its
  transitive deps) under `node_modules/svelte` and a consumer never installs svelte. It has to be in
  `dependencies` (npm-packlist skips dev and peer deps when bundling) and there is no
  `peerDependencies` (npm 7+ would auto-install the registry release with the same version string,
  which has no `mount()`). The bundled copy is nested, so both loaders pin every `svelte` /
  `svelte/*` import to it — `register.ts` with a `resolve` hook that swaps `parentURL` for its own
  URL, `plugin.ts` with one `build.module()` virtual module per svelte export (Bun's runtime
  `onResolve` never sees a bare specifier) — and both throw `WRONG_SVELTE` when `svelte/renderer`
  fails to resolve, which is how a non-PR build is caught. The *published* manifest cannot carry the
  `file:` spec (Bun resolves a bundled dep's spec before honouring the bundle, and npm `overrides`
  cannot diverge from a direct dep: `EOVERRIDE`), so `scripts/publish.ts` rewrites it to `>=5.56.0`
  for the duration of `npm pack` / `npm publish` and restores it in `finally` (not
  `prepack`/`postpack`: `npm publish` re-reads the manifest after `postpack`).
  `starter/tsconfig.json` shows the `paths` a consumer's `tsc` needs to see the nested copy. It
  can't be a URL pin: pkg.svelte.dev drops a build once a force-push removes its commit from the
  branch, and this PR is rebased on every update. `npm run vendor` moves the pin (it errors if
  pkg.svelte.dev hasn't built the head yet); then run `npm test` and `npm run bun:test`. For a commit
  pkg.svelte.dev no longer has, `pnpm build && pnpm pack` in a svelte checkout's `packages/svelte`
  and drop the tarball in by hand under the same name. `.gitignore` un-ignores `vendor/*.tgz`;
  `files` keeps it out of the npm package. `bun.lock` records the tarball's sha512, so a new build is
  a new lockfile entry.
- **`@gpuix/native` range is `>=0.11.0 <0.12.0`** (pre-1.0, so every minor may break) and the
  renderer speaks its mutation contract: applyBatch only — no `removeChild` op (reinserts reparent
  implicitly; nodes that leave the live tree are destroyed at commit and re-materialize if shown
  again), `setCustomProp` not `setCustomPropValue`, and no `commitMutations`. The package is ESM with
  an `index.cjs` under the `require` condition. Prebuilds exist for darwin-arm64 / linux-x64 /
  win32-x64 / win32-arm64 only; the Linux one links `libxcb`, `libxkbcommon` and
  `libxkbcommon-x11`. On Linux `TestGpuixRenderer` is a constructor that throws
  (`hasTestGpuixRenderer()` says so), so CI there runs only the suites that don't mount headlessly,
  plus a real window under Xvfb. Its `/host`, `/runtime` and `/testing` entry points are the
  framework-neutral layer `@gpuix/react` and `@gpuix/solid` share; this renderer takes `/host`'s
  window observers, text search, types and `EVENT_PROPS` / `UNIVERSAL_PROPS` / `BUILT_IN_TYPES`
  tables, `/testing`'s `A11yTreeDump` type, and `/automation`. It keeps its own `render.ts` /
  `renderer.ts`, because that layer's event map and mutation queue would replace the batching here
  rather than simplify it (its `createMutationQueue` also resends a refused op on every flush,
  freezing the window, and ships lone surrogates native refuses), and ports `createRendererState`'s
  keystroke flags, Tab default and dismiss-layer stack into `renderer.ts`, since its `attach` throws
  on a second root. It keeps its own `test.ts` because upstream's `TestRenderer` never paints
  between the rounds of `dispatchNativeEvents` (so a `layout` a paint queued stays queued), its key
  simulation forces focus, its raw native methods are private, and its `findBy*` reads the raw tree,
  which knows nothing of the text wrappers. **Moving the range:** read the new tag's
  `CHANGELOG.md`, the `index.d.ts` diff and the Rust (`renderer.rs`, `custom_elements/*.rs`,
  `style.rs`) at that tag; get `npm test` and `npm run bun:test` passing on the new version before
  anything uses the new surface; and in the same change go through `npm run parity`'s output and
  redo `docs/styling.md`'s lists if `style.rs` moved (see "Regenerating the styling reference").
  0.11's terminal mode is untested here: native `init()` honours `GPUIX_TERMINAL=1` on its own, and
  `render()` logs to the stdout that mode draws on.
- **The `custom-renderer` export condition is the renderer switch.** Every desktop path sets it
  (the bin, `Bun.build` in `build.ts` and `scripts/web.ts`, every tsconfig but `tsconfig.dom.json`)
  and no browser toolchain does. A new export that a component may import needs the same
  `custom-renderer` / `default` split as `.` and `./components/*`, or a DOM build fails to resolve
  it; a new helper in `web.ts`'s list needs its counterpart in `dom.ts`, covered in `test/dom.ts`.
  The toolkit's components import `gpuix-svelte` by name for the same reason: the condition, not the
  file, picks their build.

## Architecture

Three layers, `src/`:

```
render.ts    window lifecycle + frame loop  ─┐
renderer.ts  shadow tree → GPUI projection   ├─ style.ts (CSS text → GpuiStyle) and events.ts (event names) translate for it
compile.ts   .svelte → JS + the ?v=N buster ─┘
  compile-core.ts  the compile step itself, no node:* ─ also what the docs' playground runs in the browser
  types.ts     ShadowNode, GpuixEvent, GpuiStyle, Mutation, … ─ re-exported as types from `gpuix-svelte`
  html.d.ts    the gpuixHTML markup namespace ─ `gpuix-svelte/html`
  media.ts     @media / media_query() parsing and matching ─ no imports, shared by compile-core.ts and both entries
  layers.ts    dismiss_layer's stack, place_layer, dismiss_scope ─ shared by both builds
  hot.ts       render_hot's fs.watch reload ─ node:* stays out of render.ts
  index.ts     web.ts plus render_hot ─ the desktop entry
  web.ts       the `browser` condition's entry ─ IS_GPUIX → true
  dom.ts       the entry without `custom-renderer` ─ the DOM build for Vite / SvelteKit; IS_GPUIX → false
  reset.ts     the DOM build's CSS reset, one `:where()` rule per tag GPUI draws bare ─ a new alias tag adds its entry here
  register.ts  Node loader (module.registerHooks) ─ the default
  plugin.ts    Bun loader (Bun.plugin) + Bun.build hooks ─ the `bun:*` scripts, build.ts, scripts/web.ts
  build.ts     Bun.build({ compile }) + per-platform packaging ─ `gpuix-svelte/build`; Bun-only
  app-bundle.ts  build.ts's Node-testable half: app options from source, metadata, Info.plist, .icns/.ico, codesign, notarytool, the archive
  update.ts    `gpuix-svelte/update` ─ zip.ts is its adm-zip layer, update-web.ts its browser stub
  previous-instance.ts  a relaunched instance's wait for the old one ─ node:fs, stubbed by Bun's browser build
  screen-reader.ts  VoiceOver detection for the frame loop's pace ─ node:child_process, likewise
  test.ts      headless harness over TestGpuixRenderer ─ `gpuix-svelte/test`
  automation.ts  upstream's App/Locator, launch(), test_app() ─ `gpuix-svelte/automation`
  automation-server.ts  GPUIX_AUTOMATION=1 stdio server ─ imported lazily by render.ts
  titlebar.ts  render's `titlebar` option: a static bar above the app root (GNOME Wayland draws none)
  window.ts    window, picker, focus, image, overlay helpers ─ no-op where native lacks the method
  search.ts    TextSearch, find_ranges ─ createSubscriber, so no runes in src/
  components/  Scroller, Portal, Tooltip, Popover .svelte ─ `gpuix-svelte/components/*`
  components/dom/  their DOM versions, plus Anchored.svelte ─ the same specifier without `custom-renderer`
```

**Compiling.** `compile-core.ts`'s `compile_source` compiles `.svelte` with `runes: true` (legacy
`export let` / `$:` never compiles in legacy mode) and `experimental: { customRenderer }`, which makes
the compiler emit `import $renderer from 'gpuix-svelte/renderer'` into every component;
`compile.ts`'s `compile_svelte` reads the file, calls it and busts child specifiers.
`GPUIX_SVELTE_RENDERER` overrides that baked specifier — needed for components outside this
workspace, since it must resolve from the `.svelte` file's own location. `async: true` rides along
because a `pending`/`failed` snippet in a `<svelte:boundary>` crashes the compiler without it
(`SvelteBoundary.js` reads through the `renderer_snippet` wrapper; still present in the vendored
build). Reported upstream on #18511; drop the flag once it lands.

Before compiling, `collapse_whitespace` does to the template's text what an HTML parser would:
GPUI draws a text node as written and the compiler leaves interior whitespace to the browser, so a
sentence wrapped over indented lines showed its line break and tabs (docs/styling.md has the user
side, and `<svelte:options preserveWhitespace />` opts out). It rewrites runs of HTML's whitespace
(`[ \t\r\n]`, never `\s`: a no-break space is content) in `Text` nodes that sit directly in a
fragment, including a run at a text's edge beside an `{expression}`, the one edge the compiler
doesn't collapse itself; the neighbour is found the way the compiler's `clean_nodes` finds it, past
comments and the nodes it hoists (`UNSEEN`). A run with a line break becomes `<!--run--> `, because
the compiler drops comments and joins the text around them, which keeps every line's number for
errors and warnings. A source that does not parse is handed to `compile` unchanged, which reports it.

**`<style>` blocks.** The compiler refuses `css: 'injected'` under a custom renderer and hands the
scoped CSS back instead, so `compile-core.ts` walks the block's AST (`modernAst: true`) and appends
a `define_styles(scope, rules)` call to the component: one rule per compound selector, keyed by the
`svelte-<hash>` scope class the compiler already stamps on every matched element (`cssHash` captures
it). What is accepted and refused (with a warning naming the file) is docs/styling.md "What works
and what does not"; declarations go through `parse_css_text` at compile time, so the value checks
below apply to them too. An `@media` block whose prelude `parse_media_query` accepts tags the rules
inside with `media: [prelude, …]`, outermost first. Rules are emitted weakest first (tags under
classes, then source order, a media rule keeping its place), and the renderer's `class_rules()`
picks the ones whose classes the element carries on every `class` change, so `class:` directives and
dynamic class strings restyle for free.

**Media at runtime.** A rule whose queries do not hold against `current_viewport()` is skipped but
still sets `media_read`, which makes the node `uses_media` and a member of `media_nodes` (an `<svg>`
inheriting its colour from such an ancestor is left out: the ancestor's restyle sweeps it). A query
no size can change (`screen`, `print`) is settled at compile time (`media_constant`), and an
unanswerable alternative of a comma list is a `never` entry, as a browser has it. The viewport comes
from `observe_viewport`: by default native's own `observeWindowSize`, because a consumer's test
through `gpuix-svelte/test` never loads window.ts (`test/media-default.ts` covers that path), and
once window.ts loads, its `watch_size` — one observer over the dialog-guarded `geometry`, shared by
`window_size`, `media_query()` and the renderer, so the three agree frame for frame and a Windows
picker stalls none of them. The observer starts at the first media rule, `on_viewport` restyles
`media_nodes` only when `media_changed` finds a cached query that answers differently, and a commit
stops it once `media_nodes` is empty and no `:root` rule sits under `@media` (`root_media`);
`set_native` resets all of it. `dom.ts`'s `media_query()` is `matchMedia`, re-read on its `change`
event and on `resize` (happy-dom fires only the latter).

**Style merging.** `build_style` lays the inline `style` on top of the class rules; `:hover`,
`:active` and `:focus-visible` rules become GPUI's native `hover` / `active` / `focusVisible` objects,
with the `hover=` / `active=` / `focus-visible=` attribute winning. A block that reads
`var(--name[, fallback])` is emitted as `css` text instead of a parsed `style`, because the map it
resolves against lives at runtime: `style.ts` substitutes on every `parse_css_text`, memoises each
such rule per `vars_generation`, and the renderer flags nodes whose style read a variable
(`uses_vars`). A change of variables, from `set_css_vars(vars)` or a `:root` rule, only sets
`vars_moved`, and the next `commit()` restyles exactly those nodes, in one batch. An undefined
variable without a fallback drops the declaration and is warned about at that `commit()` rather
than where it was read, because the root's palette `$effect` runs after Svelte has styled the tree.
A later `padding: 20px` clears the longhands an earlier `padding: 12px 24px` expanded to, since GPUI
reads longhands over the shorthand.

**`:root` variables.** A `:root` rule (or `:global(:root)`) never becomes a class rule:
`extract_rules` takes its custom properties out, and the component gets a second call,
`define_root_vars(file, rules[, hot])`, which runs at import time like `define_styles`, as a browser
has a sheet's variables once the sheet loads. `file` is a hash of the path rather than the scope
class's hash of the CSS, because an edit has to replace the file's earlier rules where they were:
`root_sheets` is a `Map` in first-evaluation order, which is the cascade's (a component evaluates
after the ones it imports, so its rule wins over theirs, as its sheet does in Vite's output).
`cascade_root_vars()` flattens the sheets whose `@media` holds into the two maps `style.ts`'s
`declared()` reads under and over `set_css_vars()`'s, the three layers a browser ranks the same way:
`:root` rules, then `set_css_vars()` (the DOM build writes those to `<html>`'s inline style, where
`null` or `''` removes one and the rule's value shows through again), then `:root` declarations
marked `!important`. `resolve_var` resolves the `var()`s inside a variable on every read; one that
reads an unset variable with no fallback is unset itself, and so is every member of a cycle, as in
CSS. The commit's sweep skips nodes that are no longer live, because after a hot reload that is the
outgoing tree, which would be restyled against the new variables and reported for each one the edit
removed. `root_media` has `on_viewport` cascade again when a query's answer changes. What a browser
honours and a window can't is refused at compile time, naming the file: a property in `:root` that is
no variable, `:root` with anything attached, and a variable declared on any other selector, which is
left out of that rule (one in an inline `style` is not looked at, and ships as a key serde drops).

`hot` is a loader saying the module is evaluated again on every reload, and the only thing that
makes a sheet removable: `compile_svelte` takes it from the `?v=N` query on Node, `plugin.ts` from
`reloading && reloads(path)` (set by the first `invalidate_svelte`, and the test its purge uses), and
the playground's `compile.ts` passes `true`, every run landing in the one GPUI frame. A hot sheet
records `mounts`, and `set_native`, which every remount goes through, drops the hot sheets that were
not declared again since the last one (a rule deleted from its file, a file no longer imported). A
sheet from a module that evaluates once, such as a package component's, has no count and stays. A
component imported lazily after the mount carries the next count, so its sheet outlives one reload
more than it should.

**Loaders.** There are two because there is no shared API: Bun has no `module.registerHooks`, and
its `module.register()` is a silent no-op. Both wrap `compile_svelte()` and must be installed before
the entry module resolves, which the bin does (`bunfig.toml`'s `preload` alone is not enough: the
`--conditions` flags pick the custom-renderer build); tests rely on that registration. Both also
compile `.svelte.ts` runes modules through `compile_module()` (`compileModule` from
`svelte/compiler`), which does **not** strip types, so the loaders do it first: `register.ts` puts
Node's `module-typescript` source through `stripTypeScriptTypes`, `plugin.ts` runs `Bun.Transpiler`.
Those modules are deliberately **not** cache-busted: a module is one instance per process, so state
kept in one survives a hot remount, and editing one (or any plain `.ts`) needs a restart, which
`render_hot` warns about.

**`renderer.ts`** is where the real work is. Svelte's renderer contract is DOM-shaped (fragments,
comments, sibling walking); GPUI's tree is flat, id-based and knows only `div`/`text` plus a few
custom element types. So the renderer keeps a JS shadow tree and *projects* it:

- Elements and non-blank text get a `nativeId`; comments, blank text and fragments never do —
  they are ordering-only. That holds in both directions: text set to `''` at runtime gives its id
  back, or it would keep a slot in GPUI's flex/gap layout.
- Native gives the accessibility `Label` role only to a `text` element holding no string of its
  own (upstream's `is_text_host`), so that React's text inside a `<text>` isn't heard twice. Svelte
  puts text anywhere, so a text node whose parent is not a `<text>` ships as two native nodes:
  `nativeId` is the outer `text` (what attaches, anchors and is destroyed) and `textId` the inner one
  holding the string, which every `setText` targets and which stays out of `by_id`, so `elements_at`
  reports the text once. Without it VoiceOver heard none of a plain-text app. Native's search,
  highlight, selection and copy treat adjacent text leaves under one parent as one run, so text
  beside other text (`Hello {#if}there{/if}`) stays bare: `wants_wrapper` reads the nearest real
  siblings, and `insert`, `remove` and the blank transitions in `setText` `rewrap` the ones either
  side. `unwrap_text` folds the wrappers back out of what `tree()`, `automation_tree()`,
  `test_app()` and the live automation server read.
- Ids are allocated lazily, when a node first becomes reachable from the root (`live`). Svelte
  renders offscreen constantly, and eager creation would leak a Rust node per abandoned render.
- Because virtual nodes are always leaves, "the next native node" is a flat scan of following
  siblings (`first_native_after`) — nothing to descend into.
- `remove()` never destroys: Svelte removes and re-inserts the same node in consecutive statements,
  so nodes go to `pending_destroy` and are reaped in `commit()`. It still has to `mark_dirty()`,
  because a frame that only removes nodes queues no mutation, so nothing else would tell the frame
  loop (or the auto-commit microtask) that there is anything to ship.
- `next_id` is monotonic across remounts, so a stale tree's ids can't collide with the new one's.
  A remount queues the old root's `destroyElement` after the new `setRoot`, in the same batch.
- Mutations queue as tuples and ship as **one** `applyBatch(json)` per commit, which returns the ids
  Rust destroyed (whole subtrees) for the id map to purge; a node's `listeners` and `attrs` survive
  that purge, so `materialize()` can re-emit them if it becomes live again. Native decodes a whole
  batch and resolves its styles before applying anything, so a refused batch applied nothing and
  `ship` resends it one op at a time, losing (and logging) only the op native refuses — otherwise
  the nodes it created would keep ids native never got, and stay missing until a remount. `ship`
  knows a refusal by its text (`REFUSED`), because `apply_batch` can also apply a batch and then
  throw from `request_invalidate` on a closed window or stopped UI thread, which is rethrown (from
  the resend too, so a closing window fails once rather than once per op); `costs_one_op` also
  covers a value that can't be serialized. A rewording of either fails `test:lifecycle`, but only at
  our next bump; a consumer can pick up a new 0.11.x first. A probe (create and destroy a throwaway
  element, treat a throw as a failed wake) was rejected: if native ever gained another failure after
  applying, it would apply the batch twice, silently. `to_json` writes a lone surrogate (an emoji cut
  by `.slice()`) as U+FFFD on the wire only, since native refuses its JSON escape and the shadow node
  has to keep Svelte's exact string.

**`render.ts`** owns the `GpuixRenderer`, a `globalThis.__gpuix_svelte_host` slot for the window
(so remounts reuse it; a named property, since Bun's `trim` reads a computed key on `globalThis` as a
way to `eval`), and a frame loop of its own calling `native.tick()` — not
`@gpuix/native/runtime`'s `startFrameLoop`, which has no room for the commit, the frame waiters or
VoiceOver's pace:

- On macOS it ticks on native's display-link wakes (`setFrameWakeCallback`), with a timer that
  steps aside (25 ms) while wakes keep coming, ticks every 8 ms for 2 s after the last input event
  or wake (input never wakes JS), and at `IDLE_FRAME_MS` after that. A visible window's display link
  wakes every frame, idle or not; only a hidden, minimised or covered window's stops. Upstream's
  100 ms idle pace there cut CPU (~2% → ~0.7%) but made accessibility queries against the window
  (System Events, AltTab, tiling managers) take ~630 ms instead of ~96 ms, since native answers one
  request per tick, so `IDLE_FRAME_MS` is 8 ms until native wakes JS for accessibility input (a TODO
  on the constant). `test:lifecycle` runs `start_frame_loop(native, 100)` so the slower pace stays
  proven. Elsewhere it ticks every 8 ms (`setImmediate` burns most of a core at idle).
- A clean→dirty `mark_dirty` (`set_on_dirty`) and `next_frame()` bring the next tick forward to 8 ms
  after the last, so a timer's or a fetch's update commits promptly and automation waits frames, not
  the fallback. While the link runs they stand aside for a wake due within half a frame (or a moving
  pointer drew ~190 ticks/s), and a wake within 2 ms of a tick's end returns without pumping.
- While VoiceOver runs the loop ticks every 1 ms, since at 8 ms each accessibility read costs 8 ms
  and VoiceOver reports the app as not responding; `src/screen-reader.ts` asks `pgrep -x VoiceOver`
  every 2 s, since native has no signal for an assistive client and `defaults` misses a VoiceOver
  started without its shortcut.
- A throw from `tick()` is logged once per run and the loop goes on; 100 in a row
  (`TICK_FAILURES`) end the process with 1 rather than logging forever. `requiresTick()` is true on
  every desktop platform — on Windows/Linux, where GPUI owns a blocking UI thread, `tick()` only
  reports whether that thread is alive — and `tick()` returns false once the last window closes,
  which ends the loop and the process. Where `requiresTick()` is false (wasm), `set_auto_commit(true)`
  schedules commits on a microtask, or a mutation with no native event behind it would wait for the
  next click.
- Native events run `dispatch` → `flushSync()` → `commit()` so the effects' mutations land in the
  same frame. `next_frame()` resolves after the loop's next `tick()` (a timer where there is no loop).

`render.ts` bundles for the browser as-is (env through a `globalThis.process?.env` helper; its only
`node:*` imports come through `previous-instance.ts` and `screen-reader.ts`, which Bun's browser
build stubs), which is why `render_hot` lives in **`hot.ts`**. That watches the entry's directory and
re-imports with a `?v=N` cache-buster; `compile.ts` propagates the query to child `.svelte`
specifiers (static, re-export, side-effect and dynamic `import()` alike) or a reload would
re-instantiate the root against stale children. It finds them by parsing the emitted JS with
`acorn` and splicing the query in at each specifier's offset, so a `.svelte` string in ordinary code
or a comment is left alone. Only relative, absolute and `file:` specifiers are busted: Node refuses a
bare one with a query, and a package component is not what is being edited. Bun 1.4.4 keys ES
modules by path alone, so the query does nothing there: `plugin.ts` puts a purge of every `.svelte`
key outside `node_modules` from `require.cache` on a `Symbol.for('gpuix-svelte.invalidate')`
global, which `import_fresh` calls first when it is there. `.svelte.ts` modules don't match, so their
state still survives a reload.

**`style.ts`** — Svelte hands over the `style` attribute as CSS *text*; GPUI wants a camelCase
object with bare-number lengths (`12px` → `12`, while `50%`, `auto` and `#1e1e2e` stay strings). The
raw string is kept on the shadow node because Svelte read-modify-writes it for `style:` directives.
docs/styling.md is the user-facing list of what survives.

Unknown *keys* need no allowlist — serde drops them. Unknown **values** are the opposite: a key GPUI
knows, handed a value it can't deserialize, makes native refuse the batch, and `ship`'s resend then
costs the element that whole `setStyle`. So multi-value box shorthands (`padding`, `margin`,
`border-width`, `border-radius`, `gap`, `inset` — the last even with one value, since GPUI has no
`inset`) expand to the longhands GPUI has, and each value is checked against the key's Rust type
through sets `set_of` checks against host.d.ts's `StyleDesc`: `NUMBER_ONLY` (`f64`: lengths, metrics,
`opacity`, `flexGrow` and the like, where `1em`, `50%` and `auto` are fatal), `DIMENSION`
(`width`/`height`/`min*`/`max*`, which take `%` or `auto`), `TEXT_ONLY` (`String`: a value that
coerced to a number is the fatal one, while native ignores a string it can't read), `BOOLEAN`, and
`NEVER` (structs CSS text can't build, such as `boxShadow` and the pseudo-style objects). A value
that fails is dropped with a one-time warning per property. A trailing `!important` is stripped
first. A few spellings are rewritten before the check: `Nrem` → `N × 16` (GPUI's rem size, which
gpuix never changes), `overflow*: auto` → `scroll` (native matches only `scroll`/`hidden`),
`max-content`/`min-content`/`fit-content(...)` → `auto` on dimension keys, `aspect-ratio: 16 / 9`
→ a number, `scrollbar-color` → its first colour, and `'true'`/`'false'` → booleans on `BOOLEAN`
keys. `em` stays dropped because it means the inherited font size, which the renderer cannot see,
and `vh`/`vw` because a class rule is parsed at compile time and nothing re-resolves on resize.

**`events.ts`** maps Svelte's lowercased event names (`onmouseenter` → `mouseenter`) onto GPUI's
camelCase ones through `@gpuix/native/host`'s `EVENT_PROPS`; unknown events are dropped silently.

### Shipped components

`src/components/` ships `.svelte` files as-is; the consumer's loader compiles them.
`docs/components.md` documents their props and the native `<anchored>`. Each has a DOM version under
`src/components/dom/` with the same props (see "Rendering in the DOM"); a prop added here needs
adding there.

- **`Scroller`** is the scroll column with a draggable thumb. GPUI's own thumb (`scrollbar-color`)
  takes no pointer, so a plain column draws its own from what native reports (`layout` on the column
  and its content, `scrollChange` on the column), and the thumb listens for `mousedown`, `mousemove`
  and `mouseup` itself, which arms native pointer capture. It never polls, since on Windows and Linux
  reading bounds draws a frame (polling kept an idle window at 8 frames/s per `Scroller`), and the
  thumb restyle is throttled to one per 50 ms because each one is a full native frame. A plain
  scroll container lays out and paints every child every frame, so `virtual` swaps in GPUI's
  `<virtual-list>` (each direct child a row, which needs `width: 100%`; `follow` → `followTail`).
  There GPUI paints the thumb itself; native hover never reaches it (`ThumbStyle::of` reads the base
  style), so a `hot` class swaps the colour, and an 8 px strip in the list's 12 px `padding-right`
  gutter drags it (without the gutter the strip took every row's right-edge clicks), reading
  `getListScrollTop` + `getScrollOffset` once per press and estimating the length from the rows
  above the anchor. JS can't read the measured total, so rows far from `estimate` make the thumb
  drift from the pointer.
- **`Portal`** is a window-sized `position: absolute; pointer-events: none` wrapper carrying the
  renderer's `portal` attribute: the shadow node stays exactly where Svelte put it (so Svelte's
  teardown walk, anchors and `{#if}` blocks are untouched) and only the **native** node hangs off
  the root (whose default `position: relative` makes `inset: 0` the window) — appended after the
  subtree it sits in has attached (`pending_portals`), so it paints last, and later portals over
  earlier ones. `first_native_after` skips portal nodes, since they are not in their shadow
  parent's native child list, and `commit()` destroys any portal that is no longer `live`, because
  its ancestor's `destroyElement` never reaches it.
- **`Tooltip`** and **`Popover`** hang a native `<anchored>` layer from a 0×0 dot on the trigger's
  edge, with `align="start"` and the `anchor` corner named explicitly, because native 0.11's
  `align: center` centres the layer box and then anchors its centre again, landing half a layer off
  (`test:tooltip` asserts the quirk, so it fails once upstream fixes it). The layer declares a
  background, or native paints `#1a1a1a` behind it. `Tooltip` tracks hover per source (wrapper,
  spread trigger handlers, tip) because a pointer jumping onto the tip gets the tip's `mouseEnter`
  before the trigger's `mouseLeave`. Focus is a separate opt-in (the snippet's second argument),
  because native's `needs_focus` makes anything listening for `focus` focusable, which would let a
  click on a plain trigger take focus from a text field. A tip that `open` forces never joins
  `dismiss_layer`, so it can't take an Escape meant for a layer below. `Popover`'s
  `mouseDownOutside` sits on the panel, since `<anchored>` only hears `click`, `mouseEnter`,
  `mouseLeave` and `fileDrop`. Both forward a `style` prop to the tip or panel: `var()` resolves
  from one global map and a parent's scoped rules cannot reach in, so inline style is the only
  per-instance hook.

### Regenerating the styling reference

The two `<details>` lists in `docs/styling.md` are transcribed from the native side, so redo them
whenever `@gpuix/native` moves. The npm package ships no Rust; read the release tag on upstream
(`https://raw.githubusercontent.com/remorses/gpuix/@gpuix/native@<version>/packages/native/src/<file>`,
tags exist for every release; the sibling `../gpuix` checkout is not a source of truth):

- `style.rs`, `struct StyleDesc` — every key and its type. `Option<f64>` keys are pixel-only,
  `DimensionValue` takes `%`/`auto`, `String` keys are keyword-matched, and anything that is a
  struct (`BoxShadowValues`, `BackgroundValue::Gradient`, the nested `hover` / `active` /
  `focusVisible` styles, which `NEVER` refuses as declarations) is unreachable from CSS text. Its
  `parse_cursor` is the cursor keyword list.
- `renderer.rs`, `fn apply_styles` — the keywords each `String` key actually matches; a key that is
  in `StyleDesc` but not here is accepted and ignored (`display: none`; `visibility: hidden` is
  handled further down, as `invisible()`).
  `sed -n '/fn apply_styles/,/^}/p' renderer.rs | grep -n 'Some("'` lists them all. `parse_font_weight`
  is the weight names; `overflow: scroll` is handled separately in `build_host_container`.
- `color.rs` — colour syntax (`csscolorparser`, so names and `hsl()` work).

Then mirror any new key into `NUMBER_ONLY` / `DIMENSION` / `TEXT_ONLY` / `BOOLEAN` / `NEVER` in
`src/style.ts` (`npm run typecheck` names a key the bump added), add a card to
`examples/styling-playground`, and confirm what actually reached GPUI headlessly: mount with
`TestGpuixRenderer` and read `getTreeJson()` — each node's `style` is the deserialized `StyleDesc`,
with unknown keys already dropped, which is exactly what `docs/styling.md` claims.

## Writing components for this renderer

`docs/styling.md`, `docs/guide.md`, `docs/components.md` and `docs/accessibility.md` are the full
user-facing rules; these are the ones that bite most often, and the renderer behaviour behind them.

- Style with `<style>` blocks for shape and colour, colours as `var(--token)` with the palette in a
  `:root { --token: #fff; }` rule in the root component (for a theme switch, an `$effect` handing
  `LIGHT`/`DARK` palette objects to `set_css_vars()`, which outranks the rule), and `style:` / inline
  `style="..."` only for measured values. A variable is global: one declared on any other selector is
  refused, and `:root` takes nothing but variables. `em`/`vh`/`vw` never work and `%`/`auto` only on
  `width`/`height`/`min*`/`max*`, so the `auto` halves of `margin: 0 auto`, and all of
  `border-radius: 50%`, are dropped with a warning. Shared reactive state goes in `.svelte.ts` modules.
- Only GPUI tags exist (`GPUI_TAGS`, checked against `ElementType` minus `canvas`); anything else
  degrades to `div` with a one-time warning. That includes `<canvas>`: native 0.11 registers no such
  element, so a window gave it no layout box and painted neither it nor its children. `<button>` is
  the one alias: the renderer ships it as a `div` (no styling of its own) with `role` `button` and
  `tabIndex` 0 unless the element sets its own, always listens for `keyDown` on it, and re-dispatches
  an unprevented, unheld `enter` or `space` as a `click`; `disabled` clears the tab stop and drops
  both the pointer's click and the key's (native has no disabled state, so a screen reader is not
  told). The DOM build's `render()` prepends `reset.ts`'s `:where(button)` rule, so a bare button
  looks the same on both. `<markdown>` is rebuilt and laid out in full on every frame, on screen or
  not, at a cost that follows its block count (a 226-block page cost ~7 ms a frame headless, ~18 ms
  in a real window), so a long document goes one block per row under `<Scroller virtual>`, one row
  per top-level token of `marked`'s lexer. `<svg source>` inherits **no** `color` natively, so the
  renderer copies the nearest ancestor's onto any `<svg>` without one and re-copies it when that
  ancestor's resolved colour changes (`own_color`: only then does `apply_style` scan
  `inheriting_svgs`); a parent's `:hover` colour does not reach it, since hover is native.
- Only the events in `GPUI_EVENTS` fire, and `keyDown`/`keyUp` require focus. Native 0.11 stops
  every Tab after the listeners ran (so it never types `\t` into an input) and leaves moving focus
  to the host, so `renderer.ts` does what upstream's `renderer-state.js` does for
  `@gpuix/react`/`@gpuix/solid`: every key event of one `keystrokeId` shares one flags object
  (`flags_for`), `stopPropagation()` skips the handlers still to come (the focusable ancestors, then
  the window's), and `key_default` runs on the `windowKeyDown`, which native sends last: for a key
  without ctrl/alt/cmd that nobody prevented, Escape calls the top `dismiss_layer`'s `onEscape`
  unless an element's handler stopped it or it is a held key's repeat, and Tab calls
  `focusNext`/`focusPrevious`. GPUI's X11 client sends a repeat as a fresh press, so on Linux
  `sync_window_events` also asks for window `keyUp` while a layer is open, and an Escape within a
  second of the last with no release since counts as held (`escape_down`); a `<button>`'s Enter and
  Space have no such guard there. Upstream runs Escape past any `stopPropagation()`, but here
  `dispatch` reads `flags.stopped` before the window handlers run, which keeps what Popover and
  Tooltip did when they listened on the window and matches the DOM build. A layer goes on top, or
  under the first open one whose `dismiss_scope()` (Svelte context, taken while the component
  initialises) descends from its own (`place_layer` in `src/layers.ts`), because Svelte runs a
  child's effect before its parent's and two layers opened in one commit would otherwise put the
  outer one on top. Window `keyDown` stays subscribed while `tabNavigation` (default true) is on or a
  layer is open. The keyboard-focus dim is native and kept on the tree across `setRoot`; `render`
  ships it only on a new window or when the option changed (`focus_dim_on_render`), so a runtime
  `set_keyboard_focus_dim()` survives a `render_hot` remount. `e.editing` comes from the renderer
  always listening for `focus`/`blur` on `<input>`/`<textarea>`. `on_selection_change` rides the same
  window pseudo-node as `on_window_key`. `<textarea>` Enter inserts a newline unless the element has
  `onsubmit`.
- `window_size`, `window_insets` and `selected_text()` are reactive getter objects through
  `createSubscriber`, not runes, because native 0.11 still has no window resize event (`layout` is per
  element). The size goes through `window.ts`'s `watch_size` (see "Media at runtime"), the insets
  through `observeWindowInsets`, each polled at 100 ms only while read; a module-level `$derived`
  first read outside any effect owns its poll forever (`createSubscriber` semantics, as Svelte's
  `MediaQuery`). The host object resolves `get_native()` on every call, so a poll that outlives a
  remount follows the new native. `selected_text()` is event-driven over `on_selection_change`.
- `render`'s `titlebar` (`src/titlebar.ts`) is plain renderer nodes, not a component: the root
  becomes a column, the bar its first child, and the app mounts into a `position: relative` box below
  it that a given `rootStyle` styles (through a class rule, so the box's defaults merge under it), so
  a row direction or padding meant for the app never reaches the bar, while a `<Portal>` still
  covers the whole window. The default `'auto'` means Linux with `WAYLAND_DISPLAY` set and
  `XDG_CURRENT_DESKTOP` naming GNOME: GPUI asks for server-side decorations, GNOME has none, and the
  client-side fallback draws nothing (KDE draws its own; X11 gets mutter's frame). Native 0.11 has
  no window close, move or resize, so close unmounts and calls `process.exit(0)` and the bar can't
  be dragged.
- **`onclick` is the primary button only; a right or middle click is `onauxclick`**, told apart by
  `e.isRightClick`, with `e.x`/`e.y` in window coordinates. GPUI routes macOS's ctrl+click to
  `click`, not `auxClick`, so a surface that wants the platform's secondary click needs both
  handlers; write the check (`e.isRightClick || e.modifiers.ctrl`) once in a helper and share it.
- **No mouse event bubbling, and a painted child occludes its parent's hitbox.** (Key events are the
  exception: a `keyDown` reaches the focused element *and* every focusable ancestor that listens, so
  a root shortcut handler also hears what is typed into an `<input>` below it.) A child with a
  `background-color` (or `position: absolute`) swallows clicks meant for a clickable ancestor — put
  `hitbox="self"` on the clickable element and the renderer ships `pointer-events: none` for every
  descendant that has no listener of its own (`PASSIVE_EVENTS` don't count), is not an
  `INTERACTIVE_TAGS` type, is not focusable and does not scroll; adding or removing a listener later
  restyles that element, and an explicit `pointer-events` on the descendant wins. GPUI captures the
  pointer on a left press for an element that listens for both `mousedown` and `mousemove`: its
  moves and `mouseup` keep arriving past its hitbox and the window's edge. So put all three on the
  element grabbed, as `Scroller`'s thumb and strip do — an overlay mounted on the press never arms
  capture — and still treat a move with `pressedButton == null` as a release never delivered. A
  right-button drag is not captured. (The sliders in `examples/liquid-glass/LiquidGlass.svelte`
  predate this and put the handlers on every surface the cursor may cross.) A left mousedown also
  starts a text selection that every later move extends, unless the element under the pointer (or
  an ancestor) has `user-select: none` — put it on every drag handle.
- **A wheel scrolls every scroll container under the pointer at once.** GPUI's scroll listener never
  stops propagation, and native occludes only for an explicit `pointer-events: auto`, which takes
  the containers behind it out of the wheel — so an inner scroll area carries it, as the native-0.11
  and desktop-apis lists do. The tutorial instead turns the right panel's scrolling off for the step
  whose sample scrolls (`previewFill`).
- Paint order is document order, so anything that must sit on top (a modal, a toast) goes inside
  `<Portal>`. Content beside a trigger goes in `Tooltip` / `Popover`, or the native `<anchored>` they
  build on, which sizes to its child unless `fill="window"` makes it cover the window (a scrim).
- `div`/`text` accept only `autoFocus`, `tabIndex`, `testId`, `motion`, `highlight`, `role` and the
  `aria-*` props docs/accessibility.md lists; other attributes are dropped for built-ins and
  forwarded for custom element types. `normalize_prop` turns the strings Svelte hands over for static
  attributes into the JSON types native reads, for every prop in `BOOLEAN_PROPS` / `NUMBER_PROPS`
  (checked by `set_of` against `@gpuix/native/host`'s prop interfaces, so a new native prop fails
  typecheck): a bare or `"readonly"` boolean is `true` and `"false"` is `false`, `minRows="6"` is `6`,
  a non-number ships `null` with a one-time warning (a bare `tabindex` is 0), and each one's lowercase
  spelling maps to the camelCase name. Native ignores a mistyped prop silently.
- `TextSearch` (`src/search.ts`; docs/guide.md "Text search") is native's
  `createTextSearchController` behind `createSubscriber`, feeding `highlight=`. Its `matches` setter
  compares by value, because an `$effect` that works it out from `search.query` subscribes through
  that getter and would otherwise notify itself until `effect_update_depth_exceeded`.
  `getSnapshot()` both builds a fresh spec and records the options `next()` counts against, so
  `search.ts` calls it once per change and keeps an unchanged spec's identity — Svelte skips an
  identical attribute, which spares a `setCustomProp` per reported count.
- `bind:` is refused by the compiler under `customRenderer`; use `{@attach (node) => ...}`, whose
  node is the shadow node, with `node.nativeId` for native calls (`getElementBounds` reports the
  border box, a clipped child its full size). The scroll offset moves after the wheel event returns,
  so take it from `onscrollchange`, as `Scroller` does.

## Releasing

`.github/workflows/release.yml` runs release-please on every push to `main` (docs/contributing.md
"Releasing" has the flow): `release-type: node`, `bump-minor-pre-major` so a pre-1.0 breaking change
bumps the minor, `include-component-in-tag: false` for `vX.Y.Z` tags, and `extra-files` keeping
`packages/create-gpuix-svelte/package.json` and `packages/ui/package.json` at the root's version (the
scaffolder writes `^<its own version>` into the app it creates, so `starter/package.json`'s own pin
can lag). Merging the release PR publishes `gpuix-svelte`, `create-gpuix-svelte` and
`gpuix-svelte-ui` on Linux with npm trusted publishing (OIDC, `id-token: write`); each package has
its own trusted publisher on npmjs.com (`khromov/gpuix-svelte`, workflow `release.yml`), and each
publish step skips a version already on npm, so a job that failed part-way can be re-run. npm only
lets a trusted publisher be configured on a package that already exists, so **`gpuix-svelte-ui`'s
first version (0.6.0) is published by hand**: `npm run publish:ui` with an npm token **from the
release PR's own branch**, before that PR merges. From `main` the version would still be 0.5.0, a
toolkit that fails at import against `gpuix-svelte@0.5.0` (no `IS_GPUIX`, `media_query` or DOM
build) and whose version number npm never gives back. `bun.lock` records the workspace's `version`,
which release-please does not bump; `bun install --frozen-lockfile` accepts the mismatch and the next
plain `bun install` rewrites that line, which is fine to commit.
**PR titles must be conventional commits** (`feat:`, `fix:`, `docs:`, `chore:` …) — squash merges
make the title the commit, and release-please ignores anything else. With the default
`GITHUB_TOKEN` the release PR does not trigger `test.yml`; a `RELEASE_PLEASE_TOKEN` PAT secret
fixes that.

**Write the title and description like a note to a colleague, and keep them short.** The title is
the prefix plus one plain sentence about what changes for the person using the package, not the
mechanism: `feat: render gpuix-svelte components in a browser DOM too`, not `feat: a DOM build of
the package for Vite and SvelteKit, and IS_GPUIX`. The description fits on one screen, roughly ten
lines, no headers:

1. One sentence on what someone can now do (or what no longer breaks).
2. One paragraph on how it works, only as much as a reviewer needs to read the diff.
3. A bullet per area touched (code, example, docs, tests), one line each, naming the files or
   scripts a reader would go to.
4. New dependencies, called out as runtime or dev, and a link to any companion repository.

Leave out what the diff already says, test logs, screenshots of the terminal, "Verified" and
"Not done" sections (a real caveat goes in one sentence where it belongs), and anything that reads
like marketing. Commit messages follow the same shape: a conventional title line, then a short
paragraph of the why. When the scope changes while the PR is open, edit the description rather than
appending to it; the final text is what the squash commit and the release notes carry.

`homepage/share/index.html` (`/share/`, `noindex`) draws a release's share cards from the
`RELEASES` array at the top of its script, newest first (its comments cover the layouts and the
WebKit workarounds in **Download PNG**). A new release is a new entry on top with its own `tiles`
(Bento), `desk` (Showcase) and `wall` (the Mac wallpaper behind Showcase and Dialog), so older
releases keep their cards. Fill it from `git log` as well as the release PR, since release-please
leaves `ci:`, `docs:` and `chore:` commits out of its notes. The bug-fix count is the fixes to
behaviour an earlier release shipped, not the PR's Bug Fixes entries: one entry can bundle a dozen,
and a fix to a feature new in the same release is not one.

`homepage/stickers.html` draws the stickers. Their text is Geist outlined once with fontkit from
`homepage/assets/fonts/Geist-Variable.woff2` (decompressed to TTF first, since fontkit's variation
instances fail on WOFF2); no script in the repo redoes it, so the paths and `INK`'s bounds are
redone by hand if the lockup changes.

`starter/` is the template `create-gpuix-svelte` copies: its `prepack` syncs it (and the root
`LICENSE`) into the package's gitignored `template/`, and `index.js` prefers `template/` whenever
it holds an `App.svelte`, falling back to `starter/` — so a `template/` left by an earlier pack makes
a hand run copy a stale starter (`consume` refreshes it first). It is also the app `npm run consume`
installs the packed tarball into (under `$TMPDIR`, so the checked-in one stays pristine), with its
own tsconfig (the `paths` for the nested svelte) and `AGENTS.md` (and a `CLAUDE.md` that imports it)
for the consumer's agents, and is excluded from the root tsconfig, eslint and `files`. The release
workflow is optional: an interactive run asks (and for `owner/repo`, which it writes into
`standalone.ts`'s commented-out `update:` line, uncommenting it), `--github [owner/repo]` /
`--no-github` decide for scripts, and with neither a non-TTY run keeps the workflow, which is what
`consume` gets. `--no-github` removes `.github/`, `release-please-config.json` and
`.release-please-manifest.json` after the copy.

## Runtime

Node 26 (`.nvmrc`; `nvm use` before anything). Install with `bun install` (CI: `--frozen-lockfile`;
a locked version moves within its range with `bun update <pkg>`), run scripts with
`npm run <script>`; packing and publishing stay on npm (`npm pack` bundles the vendored svelte and
its dependencies, and `npm publish` does the OIDC trusted publishing). Keep the source
runtime-agnostic — `node:*` builtins only, no `Bun.*` calls and no `bun` imports outside
`src/plugin.ts`, `src/build.ts` and `scripts/web.ts` (Bun is the bundler there; `update.ts`'s
guarded `globalThis.Bun?.main` read is the one other touch). Import types with `import type`, and
components import the renderer's types (`ShadowNode` for `{@attach}`, `GpuixEvent` for handlers)
from `'gpuix-svelte'`; `.svelte` files use `<script lang="ts">` — the compiler strips the types
itself, and svelte-check (part of `typecheck`) checks them.

## Working in this repo

- Make file changes with the Edit/Write tools so every change shows as a diff; Bash is for
  reading, running scripts and tests, and scratch files under `$TMPDIR`. Anything worth
  remembering goes in this file, not in Claude Code's memory directory.
- The headless renderer (Metal) and every window crash under Claude Code's Bash sandbox ("Swift
  Fatal error: Array index out of range", hiservices XPC errors) — run `npm test`, `consume` and
  the demos with the sandbox disabled.
- Sibling checkouts: `../gpuix` is the fork this repo was extracted from; read upstream release tags
  for native instead (see "Regenerating the styling reference"). `../svelte` (khromov/svelte) is the
  local copy of the custom-renderer PR stack; check out its `custom-condition` branch before reading
  (it is force-pushed about weekly). To run a consumer app's test suite against this checkout, swap
  its `node_modules/gpuix-svelte` for a symlink to this repo; `bun install` there restores the
  published copy.
- A Bun canary for `--aot` / `--trim` builds lives in the gitignored `.bun-canary/`, never through
  `bun upgrade --canary`, which replaces the system Bun other processes use. Fetch it with
  `curl -fsSL -o /tmp/bun.zip https://github.com/oven-sh/bun/releases/download/canary/bun-darwin-aarch64.zip && unzip -j -o /tmp/bun.zip '*/bun' -d .bun-canary`,
  then run `.bun-canary/bun scripts/compile.ts --aot --trim`. `bun --revision` names the canary.
- `typescript` is held at `^5.9`, not 7 (the Go port changes defaults such as `types: []`);
  `@types/node` is a direct devDependency because bun-types' `*` would float; `types/node-ffi.d.ts`
  adds `float32`/`float64`, which `node:ffi` accepts but `@types/node` omits. Bun and tsc silently
  map a stale `./x.js` specifier onto `x.ts`; Node's own stripping does not, so only the Node suite
  catches one.
- Mutation sweeps (breaking the code under each assertion in turn, since flipping an assertion only
  proves it runs) found three guards that survive source mutation because no reachable state
  distinguishes them: `first_native_after`'s `n.attached` check, `flush_var_warnings()` sitting
  above `commit()`'s empty-queue return (a var read always queues the `setStyle` that read it), and
  `insert`'s `pending_destroy.delete(n)` (`commit()` already spares a node that is live again). All
  three are deliberate belt-and-braces; don't "cover" them, and don't delete them on the grounds that
  no test fails.
- `check:svelte` (`scripts/svelte-mcp.ts`, whose `FILTERS` give each dropped class's reason) leaves
  the "stateful variable X is assigned inside an `$effect`" class unfiltered on purpose: every
  current hit is an async fetch, a timer or a two-way sync, but it is the class that caught
  tic-tac-toe's score tally. A one-shot subscription with nothing reactive in it
  (`on_selection_change` in `examples/desktop-apis`) goes through `onDestroy` instead of an
  `$effect`, which keeps it out of that class. A clean run reports 0 issues and a couple of
  suggestions.
- `demo:glass-ffi` renders as an opaque dark slab over bright backdrops on every native version
  tested: attaching the NSGlassEffectView itself turns the window opaque (the shim never opts into
  behind-window sampling), not a renderer regression.

## Comments

Use code comments sparingly, this is important.

- Comment the **why**, never the **what** — the code already says what it does, and a comment that restates it just rots. Prefer no comment to an obvious one.
- **One sentence.** Allow a second only when the why is genuinely incomprehensible without it (a non-obvious constraint, a bug being worked around, an ordering dependency between two calls); never a third. A comment that keeps growing usually means the code needs a better name or a smaller function, not more prose.
- Do not add comment signatures for new functions unless you need to explain WHY the function is needed.
- Do not add comments for CSS - ever!
- Do not add comments to simple functions.
