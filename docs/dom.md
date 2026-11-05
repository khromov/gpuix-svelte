# The same component in a browser DOM

A component written for gpuix-svelte can also be rendered by Svelte's ordinary DOM renderer, in a
Vite or SvelteKit app, without changes to its code. The package ships a DOM twin of its exports
and of its components, and a build that does not set the `custom-renderer` export condition gets
the twin. `is_gpuix()` tells a component which renderer it is on.

This is not the [WebAssembly build](shipping.md#run-it-in-a-browser), which is GPUI itself
painting a canvas in the page. Here the browser lays out and paints real DOM elements, your
`<style>` blocks apply as CSS, and the GPUI-only parts of the API become their nearest browser
equivalent or do nothing.

## Setup

Install `gpuix-svelte` next to your app's own `svelte`, and use the Svelte plugin as usual:

```js
// vite.config.js
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({ plugins: [svelte()] });
```

That is all. Vite, SvelteKit and every other browser toolchain resolve without the
`custom-renderer` condition, so `import { … } from 'gpuix-svelte'` lands on the DOM twin and
`gpuix-svelte/components/Scroller.svelte` on the DOM `Scroller`. (The desktop side always sets
the condition: the bin, `gpuix-svelte/build` and the tsconfig a scaffolded app comes with.) A
bundler that cannot read export conditions can import `gpuix-svelte/dom` directly, or alias
`gpuix-svelte` to it.

The DOM `Scroller`, `Portal`, `Tooltip` and `Popover` are compiled by your app's Svelte, so they
need Svelte 5.29 or later (they use `{@attach}`). Vite dedupes `svelte` to your app's copy; the
custom-renderer build nested inside the package is never loaded in a browser.

An entry mounts the component the same way a desktop one does:

```ts
import { render } from 'gpuix-svelte';
import App from './App.svelte';

render(App, { title: 'My app' });
```

`render()` mounts into `document.body` and sets the page title; `width` and `height` are the
page's. A second `render()` replaces the first. There is no `render_hot`: Vite's own hot reload
takes its place.

Give the page what a GPUI window gives for free, or the layout will differ: border-box sizing, no
body margin, one UI font, and `html, body { height: 100% }` so a `height: 100%` root fills the
window. GPUI's `<text>` is an unknown element to the browser and renders inline, as it does in GPUI.
The repository's [`examples/cross-target/index.html`](../examples/cross-target/index.html) is a
complete page.

## `is_gpuix()`

```svelte
<script>
  import { is_gpuix } from 'gpuix-svelte';
</script>

{#if is_gpuix()}
  <div onauxclick={menu}>…</div>
{:else}
  <div oncontextmenu={menu}>…</div>
{/if}
```

It is `true` on GPUI (a native window or the WebAssembly canvas) and `false` on the DOM twin,
decided by which module the build resolved, so it can be read at module level, before anything
is mounted.

## What the helpers do in the DOM

Same names, same signatures. Where a helper takes a node, the node an `{@attach}` hands over here
is the DOM element.

- `set_css_vars({ token: '#fff' })` sets `--token` on `:root`, so `var(--token)` in your styles
  resolves natively; `null` removes one.
- `on_window_key('keydown', handler)` listens on `window`. The event is shaped like GPUI's:
  `e.key` is spelled the GPUI way (`escape`, `enter`, `space`, `up`, lowercase letters),
  `e.modifiers` has `shift`, `ctrl`, `alt` and `cmd` (the Meta key), `e.editing` is true while an
  input, textarea or contenteditable has focus, and `e.preventDefault()` reaches the browser event.
  `render()`'s `onKeyDown` / `onKeyUp` go through it too.
- `on_selection_change(handler)` hears `selectionchange`; `e.value` is the selected text.
- `window_size` is `innerWidth` × `innerHeight`, reactive through the resize event (no polling).
  `window_insets` reads as zero, since the page already sits inside the browser's insets.
- `set_window_title(t)` sets `document.title`; `activate_window()` calls `window.focus()`;
  `toggle_fullscreen()` uses the Fullscreen API; `minimize_window()` and `zoom_window()` do
  nothing.
- `focus_element(node)`, `focused_element()`, `blur()`, `focus_next()`, `focus_previous()`,
  `focus_next_within(node)` and `focus_previous_within(node)` use the document's focus and walk
  the usual tab stops (links, buttons, fields, `tabindex`).
- `scroll_into_view(node)` is `scrollIntoView({ block: 'nearest' })`.
- `set_image(node, bytes)` shows the bytes on an `<img>` through an object URL, and
  `set_image_pixels(node, w, h, pixels, format)` draws them to a canvas first (`bgra` is swapped
  for you).
- `elements_at(x, y)` is `document.elementsFromPoint`.
- `prompt_for_paths()` resolves to `null`: a page cannot learn a file's path. `read_native()` and
  `get_native()` return `null`, as they do when there is no window.
- `register_font()` does nothing, because a `FontFace` needs the family name spelled out; use
  `@font-face`. `set_debug_overlay()`, `debug_overlay()`, `debug_overlay_stats()` and the rest
  of the overlay API return `undefined`; `set_keyboard_focus_dim()` does nothing.
- `TextSearch` and `find_ranges` are the same code. `find_ranges` works; the `highlight`
  attribute is GPUI's, so a DOM `TextSearch` counts no matches.
- `parse_css_text`, `build_style`, `to_gpui_event` and `GPUI_EVENTS` are the same code too.
- The host plumbing (`renderer`, `set_native`, `create_root`, `commit`, `dispatch`, …) and
  `render_hot` are not exported: nothing in a browser can use them.

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
  viewport and re-placed on scroll and resize. The tooltip has `role="tooltip"`; the popover
  closes on a `mousedown` outside the panel and the trigger, and on Escape.

## Writing a component for both

The DOM twin makes the imports resolve and the components exist; the component itself has to
stay inside what both renderers draw the same way. The repository's
[`examples/cross-target`](../examples/cross-target) is one such component, opened in a window by
`npm run demo:cross` and served by Vite with `npm run demo:dom`; `test:cross-target` and
`test:dom` click through it on each renderer.

- Use `div` for boxes and text, `display: flex` where you need it, and `<style>` blocks with
  class rules and `:hover`. Both renderers read the same CSS. Colours as `var(--token)` with one
  `set_css_vars` call give both the same theme.
- Avoid what only one side has, or branch on `is_gpuix()`: the `hover=` / `active=` attributes
  and `hitbox="self"` (plain attributes in the DOM), `onauxclick` and `e.isRightClick`
  (`oncontextmenu` in the DOM), `e.value` on inputs (`e.target.value` in the DOM),
  `onlayout` / `onscrollchange` / `onfiledrop` (DOM events differ), `<virtual-list>`,
  `<anchored>`, `<markdown>`, `<code>` and `<diff>`.
- Event handlers that only react, without reading GPUI-specific fields, work as they are.
  `e.stopPropagation()` exists on both, and only matters in the DOM, where mouse events bubble.
- `{@attach}` hands over a `ShadowNode` on GPUI and an `HTMLElement` in the DOM. The helpers
  accept either; your own code can tell them apart with `is_gpuix()`.
- Type the markup in the GPUI project, whose tsconfig names the `gpuixHTML` namespace. A DOM
  project's `svelte-check` types every element as a DOM element and would flag `testid`,
  `hover=` and `GpuixEvent`, so keep shared components out of its `include`, or let it check only
  the app's own files.
- `bind:` is still refused by the compiler under the custom renderer, so it is out for a shared
  component on both sides.

The GPUI renderer also sends `set_css_vars` restyles, hit testing and focus through native code
that the DOM has no equivalent for, so the two never match pixel for pixel. Fonts, line heights
and scrollbars are the usual differences.
