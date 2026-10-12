# Components

The two components that ship in the package, and GPUI's native `<anchored>` popover element.

Two `.svelte` files ship in the package and compile through your loader like your own:

```svelte
<script>
  import Scroller from 'gpuix-svelte/components/Scroller.svelte';
  import Portal from 'gpuix-svelte/components/Portal.svelte';
</script>
```

**`Scroller`** — GPUI paints no scrollbar, so this is a scroll column with a drawn thumb: it
measures its painted bounds and scroll offset, draws the thumb in a gutter and drags it on an
overlay (GPUI doesn't capture the pointer, so a move with no button held counts as the release).
Props: `gap` and `pad` for the content column, `grow` (its `flex-grow`), `scroll={false}` to clip
without a thumb, `follow` to keep the bottom in view while content grows (a streaming reply), and
`testid`. Colours come from `var(--scroller-thumb)` and `var(--scroller-thumb-hover)`, with greys
as fallbacks.

A plain scroll column still lays out and paints every child on every frame, on screen or not, so a
long list gets slow in proportion to its length. `virtual` renders GPUI's native `<virtual-list>`
instead: every direct child is one row (wrap each item in a `div` with `width: 100%`, since rows
size to their content and the list has no `gap`), GPUI builds and paints only the rows near the viewport, `estimate` is the
height hint for rows it has not measured yet, and `follow` becomes the list's own tail-following.
The thumb then works in rows rather than pixels, from `getListScrollTop` and the `visibleRange`
event, and a drag scrolls with `scrollToItem`. In Substrate, a second-brain app built on this
renderer, a timeline of 50 cards went from ~24 ms to ~1.4 ms per frame.

**`Portal`** — paint order is document order, so a modal, toast or menu had to be the root's last
child. `<Portal>` renders from wherever the overlay is needed and still paints on top: the renderer
hangs only the native node off the root, so Svelte's `{#if}` blocks and teardown are untouched. The
wrapper covers the window without a hitbox; its children position against the window and stay
clickable:

```svelte
{#if confirming}
  <Portal>
    <div class="scrim" onclick={() => (confirming = false)}>
      <div class="dialog" onclick={() => {}}>…</div>
    </div>
  </Portal>
{/if}
```

Later portals paint over earlier ones. For a popover beside a trigger, GPUI's native `<anchored>`
element positions its child relative to the element it is rendered in. It sizes to its content,
so it is no use for a scrim; its props:

| prop | values | default |
|---|---|---|
| `position` | `{ x, y }` in window coordinates; overrides the trigger | — |
| `side` | `top` `right` `bottom` `left` — the trigger edge to hang off | `bottom` |
| `align` | `start` `center` `end` along that side | `start` |
| `anchor` | `topLeft` `topCenter` `topRight` `rightCenter` `bottomRight` `bottomCenter` `bottomLeft` `leftCenter`; derived from `side` + `align` when unset | — |
| `gap` | px between trigger and child | `0` |
| `offset` | `{ x, y }` px, applied after positioning | `{ x: 0, y: 0 }` |
| `fit` | `snap` keeps it inside the window; `switch` flips the anchor instead | `snap` |
| `snapMargin` | px kept from the window edge when snapping | `8` |
| `deferred` | paint in a later layer, above everything drawn so far | `true` |
| `priority` | order among deferred layers; higher paints later | `1` |
| `occlude` | block hit testing on what lies beneath | `true` |
