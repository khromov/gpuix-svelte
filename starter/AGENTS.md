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
npm run build        # the app for this platform (dist/<name>.app, .exe or binary); needs Bun
```

With Bun: `bun run start`, `bun run test`. After a change, run `npm run typecheck` and `npm test`.
To see what the window draws, run `GPUIX_SCREENSHOT=/tmp/app.png npm start`: it writes a PNG after
every mount and hot reload.

## Building

**Building standalone executables requires Bun** (>= 1.4), even in a project that uses npm and Node.

`npm run build` runs `build.ts`, one `build()` call from `gpuix-svelte/build`, which compiles
`standalone.ts` with Bun into a self-contained executable (110 to 130 MB: the Bun runtime, Svelte and
the GPUI addon) and packages it for the platform: `dist/<name>.app` with its icon on macOS, a
console-less `dist/<name>.exe` with version info on Windows, `dist/<name>` on Linux.

- The name, identifier, version, icon and copyright are the `app` options `standalone.ts` hands
  `render()` (`name` defaults to the window `title`, `version` to package.json's). The build reads
  them from the source, so write each as a string, in place or in a top-level `const`; a value
  computed at runtime fails the build. `icon.png` is a 1024 px square PNG; replace it.
- The output is for the platform it was built on: macOS arm64, Windows x64 or Linux x64, the
  three GPUI ships prebuilt. To release for all three, run `npm run build` on each, for example in a
  GitHub Actions matrix over `macos-latest`, `windows-latest` and `ubuntu-latest`.
- `standalone.ts` mounts `App.svelte` with `render` and a static import, since a binary has no
  source files to hot-reload. Keep its window options in step with `app.ts`.
- macOS keeps a downloaded, unsigned app from opening until it is allowed under System Settings →
  Privacy & Security. With `CODESIGN_IDENTITY` and `NOTARY_PROFILE` set (a `.env` beside
  package.json), the build signs and notarizes the `.app`; the Shipping page of the docs has the setup.

## Writing components

- Elements are GPUI's: `div`, `text`, `img`, `svg`, `input`, `textarea`, `code`, `markdown`,
  `virtual-list`, `anchored`. `<img src>` takes a file path, a `data:` URL or an http(s) URL, plus
  a width and a height.
- Style with `<style>` class rules (`.btn`, `.btn.primary`, `.btn:hover`, `.btn:active`,
  `.btn:focus-visible` with `outline-*` for the keyboard focus ring) and inline
  `style=`. Layout is flexbox in logical pixels: lengths in `px` or `rem` (16 px), and `%`/`auto` for `width`,
  `height`, `min-*` and `max-*`. Use `flex-grow: 1` for `flex: 1`, and `border-width` plus
  `border-color` for `border`. The styling page lists every property.
- Colours go in `var(--token)`, with the palette set once from the root through
  `set_css_vars({ token: '#fff' })`.
- Inputs report through events: `<input value={text} onchange={(e) => (text = e.value)} />`.
  `{@attach (node) => ...}` hands you an element.
- A click goes to the element under the pointer. Put `hitbox="self"` on a clickable element whose
  children paint a background, and it receives their clicks. `onclick` is the primary button; right
  and middle clicks are `onauxclick`.
- App-wide keyboard shortcuts: `on_window_key('keydown', handler)` from `gpuix-svelte`, returned
  from an `$effect` so it unsubscribes. Tab and Shift+Tab already move focus between `tabindex`
  elements; don't wire them to `focus_next()`, and call `e.preventDefault()` in a key handler to
  keep a Tab.
- On GNOME under Wayland, which draws no title bar for the window, `render()` draws one (title,
  minimise, maximise, close) and mounts the app in the box below it, which its `rootStyle` styles.
  `render(App, { titlebar: false })` turns it off, `true` draws it everywhere.
- Scrolling content goes in `Scroller` (`gpuix-svelte/components/Scroller.svelte`), which draws the
  scrollbar; modals, menus and toasts go in `Portal` (`gpuix-svelte/components/Portal.svelte`),
  which paints on top; hover tips and dropdowns that sit beside a trigger go in `Tooltip` and
  `Popover` from the same directory.
- State that should survive a hot reload goes in a `.svelte.ts` module; editing one needs a restart.
- Handlers take `GpuixEvent` and `{@attach}` gets a `ShadowNode`, both importable as types from
  `gpuix-svelte`.

## TypeScript

`.ts` files run through Node's and Bun's built-in type stripping, not a compiler, and `tsconfig.json`
enforces what that allows: no enums, namespaces or constructor parameter properties, `import type`
for anything that is only a type, and relative imports spelled with their extension (`./util.ts`).

## Dependencies

`gpuix-svelte` brings its own build of Svelte, the one with the custom renderer API, and resolves
every `svelte` import to it. Keep `svelte` itself out of `package.json`.

## Files

- `app.ts` — the entry: `render_hot` opens the window and remounts `App.svelte` on save.
- `App.svelte` — the root component.
- `test.ts` — the headless test (`gpuix-svelte/test`); a plain script that exits 1 on failure.
- `standalone.ts`, `build.ts`, `icon.png` (`icon.svg` is its source) — the entry, the build script
  and the app icon behind `npm run build`.
- `tsconfig.json`, `svelte.d.ts`, `svelte.config.js` — TypeScript and svelte-check setup.
