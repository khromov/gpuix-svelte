# Guide

## Forms

There is no `bind:` here, so inputs report through events, and the event carries the value:

```svelte
<input value={text} onchange={(e) => (text = e.value)} onsubmit={(e) => send(e.value)} />
<textarea value={notes} onchange={(e) => (notes = e.value)}></textarea>
```

To get hold of an element, use `{@attach (node) => …}` (or `use:`). To measure it,
`get_native().getElementBounds(node.nativeId)` returns `{ x, y, width, height }`, and
`getScrollOffset(node.nativeId)` the scroll position of a scroll container.

In a `<textarea>`, Enter inserts a newline unless the element has `onsubmit`. With `onsubmit`,
Enter submits and Shift+Enter inserts the newline. In an `<input>`, Enter always submits.

## Text search

`div` and `text` take a `highlight` prop, which GPUI paints natively behind matching text, and they
report the match count through `onhighlight`. `TextSearch` keeps that state for a find bar:

```svelte
<script lang="ts">
  import { TextSearch } from 'gpuix-svelte';
  const search = new TextSearch({ color: '#f9e2af55', active_color: '#f9e2af' });
</script>

<input value={search.query} onchange={(e) => (search.query = e.value)} onsubmit={search.next} />
<text>{search.total ? search.active + 1 : 0}/{search.total}</text>
<div highlight={search.spec} onhighlight={search.on_highlight}>{body}</div>
```

You can set `query`, `case_sensitive` and `whole_word` at any time. `total` is the match count,
and `active` is the current match. `next()` and `prev()` wrap around, and `go_to(i)` ignores an
index outside the matches. An empty query makes `spec` `null`, which clears the highlight. Besides
the colours, the constructor takes a `radius` for the highlight's corners.

`find_ranges(text, query, { case_sensitive, whole_word })` does the same matching in JS and
returns the `[start, end)` pairs that `highlight={{ ranges }}` takes. Use it for text that is not
on screen, such as a virtual list's offscreen rows, when a count has to cover the whole list.

## Keyboard shortcuts and focus

`keydown` on an element needs that element focused (`tabindex="0"` or `autofocus`). A key reaches
the focused element *and* every focusable ancestor that listens. For app shortcuts, listen on the
window:

```svelte
<script>
  import { on_window_key, blur, focus_element } from 'gpuix-svelte';
  let search;

  $effect(() =>
    on_window_key('keydown', (e) => {
      if (e.modifiers.cmd && e.key === 'k') return focus_element(search);
      if (e.key === 'escape') return e.editing ? blur() : close();
    })
  );
</script>

<input {@attach (node) => (search = node)} />
```

`on_window_key` hears a key whatever has focus and returns an unsubscribe function, so returning
it from an `$effect` cleans up for you. `render()` takes `onKeyDown` and `onKeyUp` options that do
the same and survive remounts. A text field still receives the keys typed into it, and `e.editing`
tells your handler that a field has focus, so it can step aside.

`blur()` hands focus back from a field to the window, and `focus_element(node)` focuses an
element. `focused_element()` returns the focused element. `focus_next_within(node)` and
`focus_previous_within(node)` cycle through the tab stops inside one element, wrapping there.

Tab reaches `keydown` as an ordinary key and moves focus only if you wire it up.
`focus_next()` and `focus_previous()` walk every tab stop in the window in document order and wrap
at the ends:

```js
on_window_key('keydown', (e) => {
  if (e.key === 'tab') e.modifiers.shift ? focus_previous() : focus_next();
});
```

Both walk the tab stops of the last painted frame, so a stop that an `{#if}` has just rendered
joins the order once it has painted. To focus a particular new element, give it `autofocus` or
call `focus_element(node)`.

## Window size and insets

`window_size` and `window_insets` are reactive wherever a template, `$derived` or `$effect` reads
them:

```svelte
<script>
  import { window_size, window_insets } from 'gpuix-svelte';
  const columns = $derived(window_size.width < 600 ? 1 : 2);
</script>

<div style:padding-top="{window_insets.safeArea.top}px">
  {columns} column(s) at {window_size.width}×{window_size.height}
</div>
```

GPUI has no resize event, so they ask the window every 100 ms, but only while something reactive
is reading them. A read anywhere else (a click handler, module code) always gets a current value.
Keep any `$derived` over them inside a component: one in a `.svelte.ts` module that is first read
outside an effect keeps polling for the life of the process.

`window_insets` carries `safeArea`, `ime` and `effective` (each `{ top, right, bottom, left }`)
plus `keyboardTop`, `keyboardVisible` and `visibleHeight`. The names are camelCase, like every
other value GPUI reports. Headless tests see their real viewport size and zero insets. Before any
window exists, the size reads as 800×600.

## Window and desktop helpers

All of these come from `gpuix-svelte`, and wherever they take an element they take the node an
`{@attach}` gives you. Where the call doesn't exist, they quietly do nothing: headless tests have
no window, and the browser build has no file system. The repository's
[desktop-apis example](../examples/desktop-apis) puts most of them to work in one component, which
drops into a scaffolded project as-is (in a clone, it is `npm run demo:desktop`).

- `set_window_title(title)`, `activate_window()`, `minimize_window()`, `zoom_window()` and
  `toggle_fullscreen()`.
- `prompt_for_paths({ files, directories, multiple, prompt })` opens the system picker and
  resolves to absolute paths, or to `null` on cancel and headlessly. In a browser it rejects. It
  has no file-type filter.
- `on_selection_change(handler)` hears every change to the window's text selection, a clear
  included. `e.value` is the selected text, and `undefined` after a clear. It returns its
  unsubscribe, and `render()` takes an `onSelectionChange` option for the same thing.
- `scroll_into_view(node)` scrolls the nearest scroll container or `<virtual-list>` until `node`
  shows.
- `set_image(node, bytes)` puts encoded image bytes (PNG, JPEG, WebP, GIF, SVG, …) on an `<img>`
  without going through a data URL. `set_image_pixels(node, width, height, rgba)` takes packed
  straight-alpha RGBA and scales it into the element's box, so upload at 2× for a sharp image on
  retina screens. The image is dropped when the element is destroyed or its `src` changes. Called
  from `{@attach}`, both wait for the element to exist.

Elements also take `onfiledrop`, for files dropped from the system's file manager. `e.paths` are
absolute, and `e.x` / `e.y` is the drop point. `<virtual-list>` doesn't get it, so wrap a list in a
`div` to take drops. `onmotioncomplete` fires when a `motion` track reaches its target. `role` and
the `aria-label`, `aria-description`, `aria-id`, `aria-expanded`, `aria-selected`,
`aria-valuetext` and `aria-level` attributes reach VoiceOver and other accessibility clients
through GPUI. A `<text>` is a label by default, and any other element needs a `role` to show up
in the accessibility tree.

### The draw-time overlay

GPUI can show an overlay in the top-right corner with the current, 1%-worst, 10%-worst and maximum
draw times in ms, plus a frame count; `minimal` shows only the last draw. These are draw times, so
compare them with the frame budget: 8.3 ms per frame is 120 Hz.

Turn it on with `render(App, { debugFrameOverlay: 'full' })`, or for any app without touching code
with `GPUIX_FPS=1` (or `=minimal`), which takes precedence over the option. At runtime,
`set_debug_overlay(mode)`, `cycle_debug_overlay()` (hidden → minimal → full, handy for a key
binding) and `debug_overlay()` control it. `debug_overlay_stats()` and
`reset_debug_overlay_stats()` read and clear the same numbers for a script or a headless bench, and
they keep recording while the overlay is hidden. A hot reload keeps whatever mode is showing.

## State that survives hot reload

`render_hot` remounts the root every time you save a `.svelte` file, so component state resets. A
`.svelte.ts` module loads once and is not reloaded, which makes it the place for state that
should outlive a reload: the current route, the theme, an app object.

```ts
// state.svelte.ts
export const app = $state({ route: '/', theme: 'system' });
```

The flip side: editing a `.svelte.ts` file, or any other `.ts` or `.js` module, needs a restart.
`render_hot` prints a reminder the first time one changes under the watched directory.
