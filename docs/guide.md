# Guide

Input, focus, window helpers and state. Everything here is exported from `gpuix-svelte` unless
noted.

## Forms

`bind:` is refused by the compiler under a custom renderer. Inputs report through events, and the
payload carries the value, since there is no DOM element to read:

```svelte
<input value={text} onchange={(e) => (text = e.value)} onsubmit={(e) => send(e.value)} />
<textarea value={notes} onchange={(e) => (notes = e.value)}></textarea>
```

To get hold of an element use `{@attach (node) => …}` (or `use:`); `node.nativeId` is what
`get_native()`'s methods take, for `getElementBounds()` (`{ x, y, width, height }`) and
`getScrollOffset()`.

In a `<textarea>`, Enter inserts a newline unless it has `onsubmit`; then Enter submits and
Shift+Enter is the newline. In an `<input>`, Enter always submits.

## Keyboard shortcuts and focus

`keydown` on an element needs that element focused (`tabindex="0"` or `autofocus`), and a key
reaches the focused element *and* every focusable ancestor that listens. For app shortcuts, listen
on the window instead:

```svelte
<script>
  import { on_window_key, blur, focus_element } from 'gpuix-svelte';
  let search;

  $effect(() =>
    on_window_key('keydown', (e) => {
      if (e.modifiers.cmd && e.key === 'k') return focus_element(search);
      if (e.key === 'escape' && !e.editing) close();
    })
  );
</script>

<input {@attach (node) => (search = node)} />
```

The handler fires whatever has focus and returns its unsubscribe, which is why returning it from
an `$effect` is the natural place; `render()` takes `onKeyDown` / `onKeyUp` for the same thing. A
text field keeps receiving the keys typed into it, and `e.editing` says one has focus, so a handler
can step aside. `blur()` hands focus back from a field and `focus_element(node)` focuses one;
`focused_element()` returns the focused shadow node, and `focus_next_within(node)` /
`focus_previous_within(node)` cycle the tab stops inside one element, wrapping there.

## Window size and insets

`window_size` and `window_insets` from `gpuix-svelte` are reactive wherever a template, `$derived`
or `$effect` reads them:

```svelte
<script>
  import { window_size, window_insets } from 'gpuix-svelte';
  const columns = $derived(window_size.width < 600 ? 1 : 2);
</script>

<div style:padding-top="{window_insets.safeArea.top}px">
  {columns} column(s) at {window_size.width}×{window_size.height}
</div>
```

GPUI has no resize event, so they poll native every 100 ms, and only while something reactive
reads them: the first read starts the poll and it stops once the last component reading it is
destroyed. A read anywhere else (a click handler, module code) is one fresh native call.
`window_insets` carries `safeArea`, `ime` and `effective` (each `{ top, right, bottom, left }`)
plus `keyboardTop`, `keyboardVisible` and `visibleHeight`, camelCase like every other value that
comes from native. The headless test renderer reports its real viewport size and zero insets;
before any window exists the size reads as 800×600.

## Window and desktop helpers

All of these come from `gpuix-svelte`, take shadow nodes (from `{@attach}`) where they take an
element, and are no-ops where the renderer lacks the call — the headless test renderer has no
window, the browser build no file system. `examples/desktop-apis` (`npm run demo:desktop`) uses
every one of them.

- `set_window_title(title)`, `activate_window()`, `minimize_window()`, `zoom_window()`,
  `toggle_fullscreen()`.
- `prompt_for_paths({ files, directories, multiple, prompt })` opens the system picker and resolves
  to absolute paths, or `null` on cancel (and headlessly). It rejects in a browser. There is no
  file-type filter.
- `on_selection_change(handler)` hears every change of the window's text selection, a clear
  included; `e.value` is the selected text. It returns its unsubscribe, and `render()` takes
  `onSelectionChange` for the same thing.
- `scroll_into_view(node)` scrolls the nearest scroll container or `<virtual-list>` until `node`
  shows.
- `set_image(node, bytes)` puts encoded image bytes (PNG, JPEG, WebP, GIF, SVG, …) on an `<img>`
  without a data URL, and `set_image_pixels(node, width, height, rgba)` packed straight-alpha RGBA,
  scaled into the element's box, so upload 2× for retina. Native forgets them when the element is
  destroyed or its `src` changes. Called from `{@attach}`, they wait for the element to exist.

Elements also take `onfiledrop` (Finder drops; `e.paths` are absolute, `e.x` / `e.y` the drop
point; not on `<virtual-list>`, wrap it) and `onmotioncomplete` (a `motion` track reached its
target). `role` and the `aria-label`, `aria-description`, `aria-id`, `aria-expanded`,
`aria-selected`, `aria-valuetext` and `aria-level` attributes reach VoiceOver and other
accessibility clients through GPUI; `<text>` is a label by default, and an element needs a `role`
to appear at all.

GPUI's draw-time overlay sits top right: current, 1% and 10% worst and max draw ms, plus a frame
count (`minimal` shows the last draw only). Draw time is not fps; 8.3 ms is 120 Hz. Turn it on with
`render(App, { debugFrameOverlay: 'full' })`, or on any app without touching code with `GPUIX_FPS=1`
(or `=minimal`), which wins over the option. At runtime `set_debug_overlay(mode)`,
`cycle_debug_overlay()` (hidden → minimal → full, for a key binding) and `debug_overlay()` drive it,
and `debug_overlay_stats()` / `reset_debug_overlay_stats()` read and clear the same numbers for a
script or a headless bench; they are recorded while the overlay is hidden too. A hot reload keeps
whatever mode is showing.

## State that survives hot reload

`render_hot` remounts the root on every `.svelte` save, so component state resets. A `.svelte.ts`
runes module is loaded once per process and never cache-busted, which makes it the place for state
that should outlive a reload — the current route, the theme, an app object:

```ts
// state.svelte.ts
export const app = $state({ route: '/', theme: 'system' });
```

The flip side: editing a `.svelte.ts` (or any `.ts`) file needs a restart; `render_hot` prints a
reminder when one changes under the watched directory.
