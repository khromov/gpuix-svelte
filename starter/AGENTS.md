# AGENTS.md

This is a gpuix-svelte app: Svelte 5 components rendered
into a native desktop window by GPUI, the GPU-accelerated UI framework behind the Zed editor. It runs
on Node.js >= 24 or Bun >= 1.4.

## Documentation

GPUI's elements, styling and events follow their own rules, so read the docs before writing UI code.
Fetch https://gpuix-svelte.stanislav.garden/llms.txt, then the pages it links for the task at hand.

## Commands

```bash
npm start            # opens the window; saving a .svelte file hot-reloads it
npm test             # headless test (test.ts) through GPUI's real hit testing; macOS and Windows
npm run typecheck    # tsc, then svelte-check against GPUI's element types
npm run build        # the app for this platform, in dist/; needs Bun
```

With Bun: `bun run start`, `bun run test`. After a change, run `npm run typecheck` and `npm test`.
To see what the window draws, run `GPUIX_SCREENSHOT=/tmp/app.png npm start`: it writes a PNG after
every mount and hot reload. That and `npm test` need macOS or Windows; on Linux, drive a real window
with `launch()` from `gpuix-svelte/automation` instead.

## Building

**Building standalone executables requires Bun** (>= 1.4), even in a project that uses npm and Node.

`npm run build` runs `build.ts`, one `build()` call from `gpuix-svelte/build`, which compiles
`standalone.ts` with Bun into a self-contained executable (110 to 155 MB by platform: the Bun
runtime, Svelte and the GPUI addon) and packages it for the platform: `dist/<name>.app` with its
icon on macOS, a console-less `dist/<slug>.exe` with its icon and version info on Windows,
`dist/<slug>` on Linux, where `<slug>` is the name lowercased with dashes (`My App` → `my-app`).

- The name, identifier, version, icon, copyright, and the Windows-only publisher and description
  are the `app` options `standalone.ts` hands `render()` (`name` defaults to the window `title`,
  then package.json's `name`; `version` to package.json's; `identifier` to `local.<slug>`). The
  build reads them from the source, so keep `render()` a top-level call and write each option as a
  string, in place or in a plain top-level `const`; an `app` value computed at runtime fails the
  build, and a computed `title` is skipped. The icon is the gpuix-svelte one until `icon` names a
  square PNG (1024 px for macOS; nothing checks either, and a non-square one is stretched), read
  relative to `standalone.ts`. On Linux the build uses no icon, and the window reports `identifier`
  as its app id, so a `.desktop` file for it is named `<identifier>.desktop`.
- The output is for the platform it was built on: macOS arm64, Windows x64 or arm64, or Linux x64,
  the platforms GPUI ships prebuilt (there is no Intel Mac build). To release for all three
  systems, run `npm run build` on each with Bun installed, for example in a GitHub Actions matrix
  over `macos-latest`, `windows-latest` and `ubuntu-latest` with `oven-sh/setup-bun`.
- `standalone.ts` mounts `App.svelte` with `render` and a static import, since a binary has no
  source files to hot-reload. Keep its window options in step with `app.ts`.
- macOS keeps a downloaded, unsigned app from opening until it is allowed under System Settings →
  Privacy & Security. With `CODESIGN_IDENTITY` set (a `.env` beside package.json), the build signs
  the `.app`, and with `NOTARY_PROFILE` as well it notarizes it and leaves `dist/<slug>.zip` to
  ship; the Shipping page of the docs has the setup.
- A built app updates itself: `update: { manifest }` in the `app` options names a JSON manifest
  (`https://github.com/<owner>/<repo>/releases/latest/download/update.json` on GitHub),
  `check_for_update()` from `gpuix-svelte/update` reads it and the `Update` it returns downloads,
  hash-checks and swaps the app (`App.svelte` has the banner), and `bun build.ts --archive` writes
  the archive plus the fragment `gpuix-svelte-update manifest` merges. `.github/workflows/release.yml`
  does the whole release on GitHub: release-please cuts the version, every platform builds and
  uploads, and `update.json` is written last. Under `npm start` the check resolves to null. The
  Updating page of the docs has the manifest format, the signing key and the per-platform details.

## Writing components

- Elements are GPUI's: `div`, `text`, `img`, `svg`, `input`, `textarea`, `code`, `diff`,
  `markdown`, `virtual-list`, `anchored`. Any other tag (`span`, `button`, `p`) fails the
  typecheck and renders as a `div`. `<img src>` takes a file path, a `data:` URL or an http(s) URL;
  give it a `width` and `height` in its style, or it takes the image's size once loaded and the
  layout jumps.
- Style with `<style>` class rules (`.btn`, `.btn.primary`, `.btn:hover`, `.btn:active`,
  `.btn:focus-visible` with `outline-*` for the keyboard focus ring, on an element with `tabindex`)
  and inline `style=`. Layout is flexbox, or `display: grid` with `grid-template-columns: <count>`,
  in logical pixels: lengths in `px` or `rem` (16 px), and `%`/`auto` only for `width`, `height`,
  `min-*` and `max-*`. Use `flex-grow: 1; flex-basis: 0` for `flex: 1`, and `border-width` plus
  `border-color` for `border`; both shorthands are dropped. The styling page lists every property.
- Colours go in `var(--token)`, with the palette set once from the root through
  `set_css_vars({ token: '#fff' })`.
- Inputs report through events: `<input value={text} onchange={(e) => (text = e.value)} />`;
  `onchange` fires on every edit, and there is no `oninput`. `{@attach (node) => ...}` hands you
  an element.
- Mouse events don't bubble: a click fires on each listening element under the pointer, down to
  and including the first that paints a background or is `position: absolute`, which hides what is
  behind it. Put `hitbox="self"` on a clickable element whose children paint a background, and it
  receives their clicks (children with a handler of their own, inputs, and focusable or scrolling
  elements keep theirs). A clickable child with no background fires along with its clickable
  parent, and `stopPropagation()` can't stop that; give the child a background or
  `pointer-events: auto`. `onclick` is the primary button; right and middle clicks are
  `onauxclick`, and macOS's ctrl+click is an `onclick` with `e.modifiers.ctrl`.
- An element's `onkeydown` fires only while it or a descendant has focus, so a `div` that listens
  needs a `tabindex`.
  App-wide keyboard shortcuts: `on_window_key('keydown', handler)` from `gpuix-svelte`, returned
  from an `$effect` so it unsubscribes; it also hears keys typed into a field, which `e.editing`
  flags. Tab and Shift+Tab already move focus through the tab stops (`tabindex` elements,
  `<input>`, `<textarea>`); don't wire them to `focus_next()`, and call `e.preventDefault()` in any
  handler of that keystroke, the element's or the window's, to keep focus where it is.
- On GNOME under Wayland, which draws no title bar for the window, the window gets one (title,
  minimise, maximise, close) and the app mounts in the box below it, which `rootStyle` styles. The
  bar can't be dragged; Super+drag moves the window. `titlebar: false` in the window options of
  `app.ts` and `standalone.ts` turns it off, `true` draws it everywhere.
- Scrolling content goes in `Scroller` (`gpuix-svelte/components/Scroller.svelte`), which draws the
  scrollbar; modals, menus and toasts go in `Portal` (`gpuix-svelte/components/Portal.svelte`),
  which paints on top; hover tips and dropdowns that sit beside a trigger go in `Tooltip` and
  `Popover` from the same directory.
- Only `.svelte` files hot-reload. State that should survive a reload goes in a `.svelte.ts`
  module; editing one, or any other `.ts` file, needs a restart, which `npm start` reminds you of.
- Handlers take `GpuixEvent` and `{@attach}` gets a `ShadowNode`, both importable as types from
  `gpuix-svelte`.

## TypeScript

`.ts` files run through Node's and Bun's built-in type stripping, not a compiler, and
`npm run typecheck` enforces what that allows: no enums, namespaces or constructor parameter
properties, `import type` for anything that is only a type, and relative imports spelled with their
extension. Write `./util.ts`: tsc also accepts `./util.js`, which Node then cannot find.

## Dependencies

`gpuix-svelte` brings its own build of Svelte, the one with the custom renderer API, and resolves
every `svelte` import to it. Keep `svelte` itself out of `package.json`.

## Files

- `app.ts` — the entry: `render_hot` opens the window and remounts `App.svelte` on save.
- `App.svelte` — the root component.
- `test.ts` — the headless test (`gpuix-svelte/test`); a plain script that exits 1 on failure, and
  also when the count given to `finish()` is not how many `check()`s ran, so keep it in step.
- `standalone.ts`, `build.ts` — the entry and the build script behind `npm run build`.
- `.github/workflows/release.yml`, `release-please-config.json`, `.release-please-manifest.json` —
  releases on GitHub: version, binaries for every platform and the update manifest. PR titles and
  commits on main must be conventional commits for release-please to see them.
- `tsconfig.json`, `svelte.d.ts`, `svelte.config.js` — TypeScript and svelte-check setup.
- `bunfig.toml` — preloads the `.svelte` loader for ad-hoc `bun file.ts` runs.
