# Rendering Svelte components in both gpuix-svelte and normal DOM

> [!NOTE]
> **Not released yet.** Everything on this page ships in the next gpuix-svelte release (0.6.0).
> The current release on npm, 0.5.0, resolves `gpuix-svelte` to the GPUI renderer under every
> condition, has no `IS_GPUIX`, and ships no DOM versions of its components.

gpuix-svelte's helpers and built-in components render in the DOM as well as in a GPUI window, so
the same components can be shared between a gpuix-svelte app and a normal Svelte app such as
SvelteKit, without changes to their code. A build that does not set the `custom-renderer` export
condition gets the DOM versions. `IS_GPUIX` tells a component which renderer it is on.

This is not the [WebAssembly build](shipping.md#run-it-in-a-browser), which is GPUI itself
painting a canvas in the page. Here the browser lays out and paints real DOM elements, your
`<style>` blocks apply as CSS, and the GPUI-only parts of the API become their nearest browser
equivalent or do nothing.

## Setup

A complete project to copy from is
[gpuix-svelte-sveltekit-shared-components-demo](https://github.com/khromov/gpuix-svelte-sveltekit-shared-components-demo):
a SvelteKit site on adapter-static and a GPUI window rendering one component library, with the
typechecks for both sides set up. The short version: install `gpuix-svelte` next to your app's own
`svelte`, and use the Svelte plugin as usual:

```js
// vite.config.js
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({ plugins: [svelte()] });
```

That is all. Vite, SvelteKit and every other browser toolchain resolve without the
`custom-renderer` condition, so `import { … } from 'gpuix-svelte'` lands on the DOM build and
`gpuix-svelte/components/Scroller.svelte` on the DOM `Scroller`. (The desktop side always sets
the condition: the bin, `gpuix-svelte/build` and the tsconfig a scaffolded app comes with.)
`gpuix-svelte/dom` names the DOM build outright, for a tool that sets the `custom-renderer` condition
anyway, such as the tsconfig of an app that ships to both targets.

The DOM `Scroller`, `Portal`, `Tooltip` and `Popover` are compiled by your app's Svelte, so they
need Svelte 5.29 or later (they use `{@attach}`). Vite dedupes `svelte` to your app's copy; the
custom-renderer build nested inside the package is never loaded in a browser.

An entry mounts the component the same way a desktop one does:

```ts
import { render } from 'gpuix-svelte';
import App from './App.svelte';

render(App, { title: 'My app' });
```

`render()` mounts into `document.body` and sets the page title. `<body>` gets the box GPUI gives
its root, a flex row filling the viewport with `position: relative` and no margin, or `rootStyle`
in its place, so a root with `width: 100%; height: 100%` fills the page as it fills the window.
It also gets `line-height: 1.618`, GPUI's default, so a line of text is as tall on both; a
browser's own default follows the font and is tighter. A `font` shorthand on an element resets it.
`width`, `height`, `titlebar`, `tabNavigation`, `keyboardFocusDim`, `debugFrameOverlay` and
`onEvent` are ignored. A second `render()` replaces the first. `render_hot` exists only to reject
with a message naming the bin, which is what an entry that lands here by mistake has skipped;
Vite's own hot reload takes its place.

The page itself supplies the little that a GPUI window gives for free and `render()` does not:
copy the stylesheet from
[`examples/cross-target/index.html`](../examples/cross-target/index.html), which is a complete
page.

## `IS_GPUIX`

```svelte
<script>
  import { IS_GPUIX } from 'gpuix-svelte';
</script>

{#if IS_GPUIX}
  <div onauxclick={menu}>…</div>
{:else}
  <div oncontextmenu={menu}>…</div>
{/if}
```

It is `true` on GPUI (a native window or the WebAssembly canvas) and `false` in the DOM,
decided by which module the build resolved, so it can be read at module level, before anything
is mounted.

This page runs the component below in the DOM, so its badge reads DOM; in a window the same
source reads GPUI. Its theme button calls `set_css_vars`, which here writes custom properties on
`:root`, so the area around it follows, and `window_size` is the viewport:

```svelte demo theme
<script>
  import { IS_GPUIX, set_css_vars, window_size } from 'gpuix-svelte';

  const DARK = { paper: '#111111', ink: '#ededed', panel: '#1f1f1f' };
  const LIGHT = { paper: '#fafafa', ink: '#171717', panel: '#ffffff' };
  let dark = $state(true);

  $effect(() => set_css_vars(dark ? DARK : LIGHT));
</script>

<div class="row">
  <div class="badge">{IS_GPUIX ? 'GPUI' : 'DOM'}</div>
  <div>{window_size.width} × {window_size.height}</div>
  <div class="btn" onclick={() => (dark = !dark)}>{dark ? 'Light' : 'Dark'} theme</div>
</div>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: 10px;
    background-color: var(--paper);
    color: var(--ink);
  }
  .badge {
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    background-color: var(--ink);
    color: var(--paper);
  }
  .btn {
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    user-select: none;
    background-color: var(--panel);
  }
</style>
```

## What the helpers do in the DOM

Same names, same signatures. Where a helper takes a node, the node an `{@attach}` hands over here
is the DOM element.

- `set_css_vars({ token: '#fff' })` sets `--token` on `:root`, so `var(--token)` in your styles
  resolves natively; `null` removes one. It writes `<html>`'s inline style, which is why a value
  set this way wins over a `:root` rule in a `<style>` block, on GPUI too
  ([Styling](styling.md#a-light-and-a-dark-palette)).
- `on_window_key('keydown', handler)` listens on `window`. The event is shaped like GPUI's:
  `e.key` is spelled the GPUI way (`escape`, `enter`, `space`, `up`, lowercase letters, and under
  Alt or Shift the physical key's letter or digit, so ⌥T is `t` with `alt`), `e.modifiers` has
  `shift`, `ctrl`, `alt` and `cmd` (the Meta key), `e.editing` is true while a text input, a
  textarea or a contenteditable has focus, and `e.preventDefault()` reaches the browser event.
  `render()`'s `onKeyDown` / `onKeyUp` go through it too.
- `on_selection_change(handler)` hears `selectionchange`; `e.value` is the selected text.
  `selected_text()` is `document.getSelection()` as text, reactive through the same event, and
  `clear_selection()` empties it. `is_terminal()` is false.
- `dismiss_layer({ onEscape })` keeps the same stack, with a `window` `keydown` listener added as
  the first layer opens: a handler on the focused element, or a window one subscribed before that,
  can still call `e.preventDefault()` to keep the top layer open, as can a handler on the focused
  element that calls `e.stopPropagation()`. A held key's repeats are ignored.
- `window_size` is `innerWidth` × `innerHeight`, reactive through the resize event (no polling).
  `window_insets` reads as zero, since the page already sits inside the browser's insets.
- `media_query('(max-width: 700px)')` is `matchMedia`, so every query a browser knows works here,
  including the ones GPUI refuses. `@media` blocks in a `<style>` are plain CSS in the DOM; on GPUI
  the width, height and orientation ones apply too ([Styling](styling.md#media-queries)), so a
  shared component can use both.
- `set_window_title(t)` sets `document.title`; `activate_window()` calls `window.focus()`;
  `toggle_fullscreen()` uses the Fullscreen API; `minimize_window()` and `zoom_window()` do
  nothing.
- `focus_element(node)`, `focused_element()`, `blur()`, `focus_next()`, `focus_previous()`,
  `focus_next_within(node)` and `focus_previous_within(node)` use the document's focus and walk
  the usual tab stops (links, buttons, fields, `tabindex`).
- `scroll_into_view(node)` is `scrollIntoView({ block: 'nearest' })`.
- `set_image(node, bytes)` shows the bytes on an `<img>` through an object URL (SVG bytes are
  recognised and typed, since browsers sniff every raster format but that one), and
  `set_image_pixels(node, w, h, pixels, format)` draws them to a canvas first (`bgra` is swapped
  for you). The newest upload per element wins, as on GPUI.
- `elements_at(x, y)` is `document.elementsFromPoint`.
- `prompt_for_paths()` resolves to `null`: a page cannot learn a file's path. `read_native()` and
  `get_native()` return `null`, as they do when there is no window.
- `register_font()` does nothing, because a `FontFace` needs the family name spelled out; use
  `@font-face`. `set_debug_overlay()`, `debug_overlay()`, `debug_overlay_stats()` and the rest
  of the overlay API return `undefined`; `set_keyboard_focus_dim()` does nothing.
- `TextSearch` and `find_ranges` are the same code. `find_ranges` works; the `highlight`
  attribute is GPUI's, so a DOM `TextSearch` counts no matches.
- `parse_css_text`, `build_style`, `to_gpui_event` and `GPUI_EVENTS` are the same code too.
- The host plumbing (`renderer`, `set_native`, `create_root`, `commit`, `dispatch`, …) is not
  exported: nothing in a browser can use it. `render_hot` is exported only to reject with a
  message naming the bin.

## The components in the DOM

Same props, same slots, same CSS variables; `testid` becomes a `data-testid` attribute.

- **Scroller** is a column with `overflow-y: auto`, so the browser scrolls it and draws the thumb
  (coloured by `--scroller-thumb` and `--scroller-thumb-hover` through `scrollbar-color`).
  `follow` keeps the bottom in view while the content grows. `virtual` and `estimate` are
  accepted and lay out every row: there is no virtual list, only the GPUI list's spacing rules.
- **Portal** moves its layer to the end of `<body>`, `position: fixed` over the whole viewport,
  so a modal, menu or toast paints on top from wherever it is rendered and its children position
  against the window.
- **Tooltip** and **Popover** hang a `position: fixed` layer off `<body>`, placed beside the
  trigger (or `position`) from measured boxes with `side`, `align` and `gap`, snapped inside the
  viewport, and placed again every frame while shown, as GPUI's layers are, so it follows a
  trigger that moves. The tooltip has `role="tooltip"` and takes no pointer, so a click on it
  lands on what lies beneath, as on GPUI; the popover closes on a `mousedown` outside the panel
  and the trigger, and on Escape.

## Writing a component for both

The DOM build makes the imports resolve and the components exist; the component itself has to
stay inside what both renderers draw the same way. The repository's
[`examples/cross-target`](../examples/cross-target) is one such component, opened in a window by
`npm run demo:cross` and served by Vite with `npm run demo:dom`; `test:cross-target` and
`test:dom` click through it on each renderer. The
[shared-components demo](https://github.com/khromov/gpuix-svelte-sveltekit-shared-components-demo)
is a whole library written this way, typechecked as DOM markup and as GPUI markup.

- Use `div` for boxes and text, `display: flex` where you need it, and `<style>` blocks with
  class rules and `:hover`. Colours as `var(--token)`, declared in a `:root` rule or set with one
  `set_css_vars` call, give both the same theme. Both read the same CSS text, with four differences
  to keep in mind: GPUI takes a bare number as pixels (`gap: 8`, `--gap: 8`,
  `set_css_vars({ gap: 8 })`) and the browser does not, so give lengths a unit;
  GPUI draws a border from `border-width` and `border-color` alone while the
  browser also needs `border-style: solid`, so write all three; `pointer-events: none` is
  inherited in the DOM and per element on GPUI, so a pass-through wrapper's interactive
  descendants need `pointer-events: auto` of their own there; and GPUI's root is a flex row,
  which `render()` gives `<body>` too.
- Avoid what only one side has, or branch on `IS_GPUIX`: the `hover=` / `active=` attributes
  and `hitbox="self"` (plain attributes in the DOM), `onauxclick` and `e.isRightClick`
  (`oncontextmenu` in the DOM), `e.value` on inputs (`e.target.value` in the DOM),
  `onlayout` / `onscrollchange` / `onfiledrop` (DOM events differ), `<virtual-list>`,
  `<anchored>`, `<markdown>`, `<code>` and `<diff>`.
- A variable declared on an element (`.card { --pad: 4px; }`, `style="--pad: 4px"`) or handed to
  a component as a style prop (`<Card --pad="4px" />`) reaches the same elements on both: that
  element, or that component, and everything inside. The one exception is the layer of a
  `Tooltip`, a `Popover` or a `Portal`. In the DOM it hangs off `<body>`, where only `:root` and
  `set_css_vars` reach it, while on GPUI it reads the variables of the place it was written in. So
  give a layer its variables in `:root`, or through the `style` a tooltip and a popover forward
  ([Styling](styling.md#variables-on-an-element)).
- Keep a `<div>` around a component given style props wherever its only neighbours are `<svg>` or
  `<text>` elements. Svelte reads a fragment (a component's markup, an `{#if}` or `{#each}` block,
  a snippet) whose own elements are all one of those two as SVG, and wraps the component in an SVG
  `<g>` there, inside which a browser paints no HTML. A `<text>` in such a fragment is an SVG
  element too and stays blank with or without style props, which is one more reason to write text
  in a `div`. A window draws all of it.
- Event handlers that only react, without reading GPUI-specific fields, work as they are.
  `e.stopPropagation()` exists on both: in the DOM it stops a mouse event from bubbling; on GPUI,
  where mouse events never bubble, it skips the key handlers still to come.
- `{@attach}` hands over a `ShadowNode` on GPUI and an `HTMLElement` in the DOM. The helpers
  accept either; your own code can tell them apart with `IS_GPUIX`.
- Type the markup in the GPUI project, whose tsconfig names the `gpuixHTML` namespace. A DOM
  project's `svelte-check` types every element as a DOM element and would flag `testid`,
  `hover=` and `GpuixEvent`, so keep shared components out of its `include`, or let it check only
  the app's own files.
- `bind:` is still refused by the compiler under the custom renderer, so it is out for a shared
  component on both sides.

The GPUI renderer also sends `set_css_vars` restyles, hit testing and focus through native code
that the DOM has no equivalent for, so the two never match pixel for pixel. Fonts, line heights
and scrollbars are the usual differences.
