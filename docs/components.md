# Components

The four components that ship in the package, and GPUI's native `<anchored>` popover element.

Four `.svelte` files ship in the package and compile through your loader like your own:

```svelte
<script>
  import Scroller from 'gpuix-svelte/components/Scroller.svelte';
  import Portal from 'gpuix-svelte/components/Portal.svelte';
  import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
  import Popover from 'gpuix-svelte/components/Popover.svelte';
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

Later portals paint over earlier ones.

**`Tooltip`** — a hover tip beside its trigger, on the native `<anchored>` below. It shows after
`delay` ms of hover and stays open while the pointer crosses onto the tip, with an 80 ms grace for
the gap. The tip takes no clicks: they land on whatever lies beneath it. Props: `content` (a string
or a snippet), `side` (default `top`), `align` (`center`), `gap` (`6`), `delay` (`300`), `open` to
force it shown or hidden (`null`, the default, leaves it to hover) and `testid` (the tip gets
`<testid>-tip`). Colours come from `var(--tooltip-surface)` and `var(--tooltip-ink)`.

A decorative trigger (text, an icon, a badge) needs nothing more: the wrapper hears the hover
through `hitbox="self"`. A trigger with a listener of its own keeps its hitbox and hides the
wrapper's, so it spreads the handlers the `children` snippet is passed:

```svelte
<Tooltip content="Save (⌘S)">
  {#snippet children(hover)}
    <div class="btn" {...hover} onclick={save}>Save</div>
  {/snippet}
</Tooltip>
```

**`Popover`** — a controlled panel beside its trigger. You own `open` and the trigger toggles it;
`onclose` fires on a press outside both the panel and the trigger (any button) and on Escape. A
press on the trigger is left to the trigger's own click, so it closes without reopening. Props:
`open`, `onclose`, `content` (the panel's snippet), `side` (`bottom`), `align` (`start`), `gap`
(`4`), `position` (`{ x, y }` in window coordinates instead of the trigger: an `onauxclick`'s
`e.x`/`e.y` puts a context menu at the cursor) and `testid` (the panel gets `<testid>-panel`).
Colours come from `var(--popover-surface)`, `var(--popover-border)` and `var(--popover-ink)`.

```svelte
<Popover open={menu} onclose={() => (menu = false)}>
  <div class="btn" onclick={() => (menu = !menu)}>Menu</div>
  {#snippet content()}
    <div class="item" onclick={rename}>Rename</div>
  {/snippet}
</Popover>
```

Both wrap the trigger in a box that hugs it, at the start of whatever space the parent gives them,
and hang the layer off that box.

For anything else beside a trigger, GPUI's native `<anchored>` element positions its child
relative to the element it is rendered in: it hangs off its parent's box, zero-sized and out of
flow. It sizes to its content, so it is no use for a scrim. Its own `style` styles the layer, and
it hears only `click`, `mouseenter`, `mouseleave` and `filedrop`, so `onmousedownoutside` goes on
a child. Two native quirks, as of 0.10: give `<anchored>` itself a background (`#00000001` will
do) or GPUI paints an opaque `#1a1a1a` behind it, and `align="center"` lands half the layer's own
width (or height) short of centre, which is why the components hang theirs from a zero-sized box
that flex puts on the trigger's edge, with the `anchor` corner named explicitly. Its props:

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
