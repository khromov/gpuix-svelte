# Guide

## Forms

There is no `bind:` here, so inputs report through events, and the event carries the value:

```svelte
<input value={text} onchange={(e) => (text = e.value)} onsubmit={(e) => send(e.value)} />
<textarea value={notes} onchange={(e) => (notes = e.value)}></textarea>
```

To get hold of an element, use `{@attach (node) => …}` (or `use:`). To measure it,
`get_native().getElementBounds(node.nativeId)` returns its border box (padding and border
included) as `{ x, y, width, height }` in window coordinates, and
`getScrollOffset(node.nativeId)` the scroll position of a scroll container. On Windows and Linux
each `getElementBounds` call makes GPUI draw a frame before it answers, so don't call it on a timer:
`onlayout` and `onscrollchange` (see [below](#window-and-desktop-helpers)) tell you when something
changed and cost nothing while nothing does.

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

Tab and Shift+Tab move focus through the window's tab stops, in document order and wrapping at
the ends, as in a browser. Tab never types a tab character into an `<input>` or `<textarea>`, and
Ctrl, Alt and Cmd combinations are left alone. The move happens after every key handler for that
keystroke has run, so any of them can keep it:

```svelte
<div tabindex="0" onkeydown={(e) => {
  if (e.key !== 'tab') return;
  e.preventDefault(); // keep this Tab, say to indent
  indent();
}}></div>
```

A key goes to the focused element, then to each focusable ancestor that listens, then to the
window's `on_window_key` handlers. `e.stopPropagation()` skips the ones after it, and
`e.defaultPrevented` tells a later handler that an earlier one called `preventDefault()`.
`e.keystrokeId` is the same on every event of one keystroke. `render(App, { tabNavigation: false })`
turns the default off; then `focus_next()` and `focus_previous()` are yours to call. They walk
the same order, as do the Tab moves themselves.

The order is the tab stops of the last painted frame, so a stop that an `{#if}` has just rendered
joins it once it has painted. To focus a particular new element, give it `autofocus` or call
`focus_element(node)`.

`:focus-visible` rules and the `focus-visible="..."` attribute style an element while it has
keyboard focus (not after a click), and `outline-width`, `outline-color` and `outline-offset` draw
the ring outside its border. GPUI can also dim every other focusable element to 40% opacity while
one has keyboard focus, which shows where Tab can go. gpuix-svelte leaves that off:
`render(App, { keyboardFocusDim: true })` turns it on (and `mount_headless` takes the same option),
`set_keyboard_focus_dim(enabled)` switches it at runtime (a hot reload keeps the switch), and `keyboard-focus-dim: false` in an
element's style exempts it. That style is not inherited, so it goes on the focusable element
itself.

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

They ask the window every 100 ms, but only while something reactive is reading them. A read
anywhere else (a click handler, module code) always gets a current value. Keep any `$derived`
over them inside a component: one in a `.svelte.ts` module that is first read outside an effect
keeps polling for the life of the process.

`window_insets` carries `safeArea`, `ime` and `effective` (each `{ top, right, bottom, left }`)
plus `keyboardTop`, `keyboardVisible` and `visibleHeight`. The names are camelCase, like every
other value GPUI reports. Headless tests see their real viewport size and zero insets. Before any
window exists, the size reads as 800×600.

## Title bar on GNOME

On GNOME under Wayland a gpuix window has no title bar: GNOME leaves drawing it to the app, and
GPUI draws none. So `render()` draws a simple one above your app there, with the window title (it
follows `set_window_title`) and minimise, maximise and close buttons, and leaves every other
platform alone. That is its `titlebar` option's default, `'auto'`: `titlebar: false` turns the bar
off and `titlebar: true` draws it everywhere. Your app then mounts in the box below the bar, and
`rootStyle` styles that box, so a `<Portal>` still covers the whole window. The bar can't be dragged
to move the window, since `@gpuix/native` has no window move yet; Super+drag still moves it. A
double-click maximises, and close unmounts the app and ends the process. Its colours are
`--titlebar-bg`, `--titlebar-fg`, `--titlebar-hover` and `--titlebar-close`, set through
`set_css_vars`. Running the app under X11 instead (`WAYLAND_DISPLAY` unset) gets GNOME's own title
bar, at the cost of fractional scaling and per-monitor refresh rates.

## Window and desktop helpers

All of these come from `gpuix-svelte`, and wherever they take an element they take the node an
`{@attach}` gives you. Where the call doesn't exist, they quietly do nothing: headless tests have
no window, and the browser build has no file system. The repository's
[desktop-apis example](../examples/desktop-apis) puts most of them to work in one component, which
drops into a scaffolded project as-is (in a clone, it is `npm run demo:desktop`), and
[native-0.11](../examples/native-0.11) shows what `@gpuix/native` 0.11 added (`npm run demo:native-0.11`).

- `set_window_title(title)`, `activate_window()`, `minimize_window()`, `zoom_window()` and
  `toggle_fullscreen()`.
- `prompt_for_paths({ files, directories, multiple, prompt })` opens the system picker and
  resolves to absolute paths, or to `null` on cancel and headlessly. In a browser it rejects. It
  has no file-type filter. See [While a file picker is open](#while-a-file-picker-is-open).
- `on_selection_change(handler)` hears every change to the window's text selection, a clear
  included. `e.value` is the selected text, and `undefined` after a clear. It returns its
  unsubscribe, and `render()` takes an `onSelectionChange` option for the same thing.
- `scroll_into_view(node)` scrolls the nearest scroll container or `<virtual-list>` until `node`
  shows.
- `set_image(node, bytes)` puts encoded image bytes (PNG, JPEG, WebP, GIF, SVG, …) on an `<img>`.
  `set_image_pixels(node, width, height, pixels, format)` takes
  packed straight-alpha pixels and scales them into the element's box, so upload at 2× for a sharp
  image on retina screens. `format` is `'rgba'` (the default) or `'bgra'`, GPUI's own order, which
  skips a per-pixel swizzle and is what ffmpeg's `-pix_fmt bgra` and most raw canvas buffers
  produce. The image is dropped when the element is destroyed or its `src` changes. Called from
  `{@attach}`, both wait for the element to exist.
- `register_font(bytes)` adds a TrueType or OpenType file (or collection), so `font-family` can
  name the families it declares. Text that asked for the family earlier picks it up on the next
  frame. It throws on a file GPUI can't use, and does nothing in a browser.
- `elements_at(x, y)` returns the elements painted under a window point, topmost first, like the
  DOM's `elementsFromPoint`. It skips anything clipped away or `pointer-events: none`, and returns
  nothing in a browser.

Elements also take `onfiledrop`, for files dropped from the system's file manager. `e.paths` are
absolute, and `e.x` / `e.y` is the drop point. `<virtual-list>` doesn't get it, so wrap a list in a
`div` to take drops. `onmotioncomplete` fires when a `motion` track reaches its target.

`onlayout` reports an element's border box after its first paint and again whenever its size
changes: `e.width` and `e.height`, with `e.x` / `e.y` in window coordinates. `onscrollchange`
reports a scroll container's offset as `e.scrollX` / `e.scrollY` (0 at the start, negative as the
content moves) after every scroll, including `scroll_into_view()` and `scrollTo`, where `onscroll`
hears only wheel input. Neither one takes the pointer, so neither costs a `hitbox="self"` ancestor
its clicks.

`role` and
the `aria-label`, `aria-description`, `aria-id`, `aria-expanded`, `aria-selected`,
`aria-valuetext` and `aria-level` attributes reach VoiceOver and other accessibility clients
through GPUI. A `<text>` is a label by default, and any other element needs a `role` to show up
in the accessibility tree.

### While a file picker is open

On Windows the picker runs on GPUI's UI thread, so until it closes, a native call that waits for
that thread stalls JavaScript for 2 seconds and then throws. Your timers keep running, and an
exception from a timer ends the process. The helpers here account for it while a
`prompt_for_paths()` is open on Windows. On macOS and Linux the UI thread keeps running behind the
picker, the app stays usable, and they work as usual.

- `focused_element()` returns `null`, `elements_at()` nothing and `debug_overlay()` /
  `debug_overlay_stats()` `undefined`, without asking native.
- `window_size` holds the size from when the picker opened.
- `set_image` and `set_image_pixels` wait until it closes, then upload the newest image per element.
- `Scroller` and `Popover` need nothing from you.

A read made through `get_native()` directly gets no such protection, and the same throw can hit a
call that is in flight as the last window closes. If a read can run on a timer or in an effect, wrap
it in `read_native`, which returns `null` while a picker is open on Windows or if the UI thread
can't answer, and lets any other error through:

```js
const top = read_native((native) => native.getListScrollTop(node.nativeId));
if (top) place_marker(top);
```

`register_font` isn't covered, so it can throw a timeout during a picker.

### The draw-time overlay

GPUI can show an overlay in the top-right corner with the current, 1%-worst, 10%-worst and maximum
draw times in ms, plus a frame count; `minimal` shows only the last draw. These are draw times, so
compare them with the frame budget: 8.3 ms per frame is 120 Hz.

Turn it on with `render(App, { debugFrameOverlay: 'full' })`, or for any app with `GPUIX_FPS=1`
(or `=minimal`), which takes precedence over the option. At runtime, `set_debug_overlay(mode)`,
`cycle_debug_overlay()` (hidden → minimal → full, handy for a key binding) and `debug_overlay()`
control it. `debug_overlay_stats()` and
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
