# Components

Four components ship in the package: `Scroller`, `Portal`, `Tooltip` and `Popover`. They're
plain `.svelte` files and compile like your own components:

```svelte
<script>
  import Scroller from 'gpuix-svelte/components/Scroller.svelte';
  import Portal from 'gpuix-svelte/components/Portal.svelte';
  import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
  import Popover from 'gpuix-svelte/components/Popover.svelte';
</script>
```

## Scroller

GPUI's own scrollbar (`scrollbar-color`, see [Styling](styling.md)) can't be dragged, so
`Scroller` is a scroll column that draws its own thumb in a gutter, follows the wheel and lets you
drag the thumb.

Props:

- `gap` (default `8`, in px) and `pad` (default `'0'`, CSS padding text) for the content column.
- `grow` (default `1`), the scroller's `flex-grow`.
- `scroll={false}` clips the content and draws no thumb.
- `follow` keeps the bottom in view while content grows, as in a streaming reply.
- `virtual` and `estimate` make it a [virtual list](#virtual-lists).
- `testid` goes on the scroll column. The thumb gets `<testid>-thumb` and the drag overlay
  `<testid>-overlay`.

Colours come from `var(--scroller-thumb)` and `var(--scroller-thumb-hover)`, with greys as
fallbacks.

### Virtual lists

A plain scroll column lays out and paints every child on every frame, on screen or off, so a long
list slows down in proportion to its length. With `virtual`, `Scroller` renders GPUI's native
`<virtual-list>`, and GPUI lays out and paints only the rows near the viewport. Svelte still
creates every row; only the layout and paint are skipped.

- Every direct child is one row. Wrap each item in a `div` with `width: 100%`, since rows size to
  their content, and space rows with padding inside them: `gap` applies only to the plain column.
- `estimate` (default `80`) is the height hint for rows GPUI hasn't measured yet.
- `follow` becomes the list's own tail-following.
- `pad` pads the box around the list, so it does not scroll with the rows. No gutter is reserved,
  so the thumb paints over the rows' right edge. `scroll={false}` is ignored.
- Nothing reports a change in row count, so the thumb re-reads the list's position every 250 ms
  (100 ms with `follow`).

## Portal

Paint order is document order, so a modal, toast or menu would otherwise have to be the root's
last child. `<Portal>` renders from wherever the overlay is needed and still paints on top. Svelte
sees it where you wrote it, so `{#if}` blocks and teardown work as usual. The wrapper covers the
window without taking clicks itself, and its children position against the window and stay
clickable:

```svelte
{#if confirming}
  <Portal>
    <div class="scrim" onclick={() => (confirming = false)}>
      <div class="dialog">…</div>
    </div>
  </Portal>
{/if}
```

A portal mounted later paints over one mounted earlier, so a portal that re-shows through `{#if}`
moves to the top. `Tooltip` and `Popover` paint above every portal, because `<anchored>` draws in
a deferred layer.

## Tooltip

A hover tip beside its trigger, built on `<anchored>`. It shows after `delay` ms of hover and stays
open while the pointer crosses onto the tip, with an 80 ms grace for the gap. The tip takes no
clicks, so they land on whatever lies beneath it.

Props:

- `content`: a string or a snippet.
- `side` (default `top`), `align` (default `center`), `gap` (default `6`) and `delay` (default
  `300`).
- `open` forces the tip shown or hidden. `null`, the default, leaves it to hover.
- `style`: inline CSS for one tip, which wins over the tip's own rules
  (`style="padding: 8px 12px; border-radius: 0; background-color: #1e66f5"`).
- `testid` goes on the wrapper around the trigger. The tip gets `<testid>-tip`.

Colours come from `var(--tooltip-surface)` and `var(--tooltip-ink)`, which you set for the whole
app with `set_css_vars`.

A decorative trigger (text, an icon, a badge) needs nothing more. A trigger with a handler of its
own, such as a button, takes the hover for itself, so spread the handlers the `children` snippet
receives onto it:

```svelte
<Tooltip content="Save (⌘S)">
  {#snippet children(hover)}
    <div class="btn" {...hover} onclick={save}>Save</div>
  {/snippet}
</Tooltip>
```

## Popover

A controlled panel beside its trigger. You own `open`, and the trigger toggles it. `onclose` fires
on a press outside both the panel and the trigger (any mouse button) and on Escape. A press on the
trigger is left to the trigger's own click, so it closes the panel without reopening it.

Props:

- `open`, `onclose`, and `content` (the panel's snippet).
- `side` (default `bottom`), `align` (default `start`) and `gap` (default `4`).
- `position`: `{ x, y }` in window coordinates to hang the panel from in place of the trigger. An
  `onauxclick`'s `e.x` / `e.y` puts a context menu at the cursor. A press inside the trigger's box
  never counts as outside, so a large trigger that only has `onauxclick` needs an `onclick` that
  closes the menu.
- `style`: inline CSS for the panel, as with `Tooltip`. Use it for padding, radius, border or
  surface.
- `testid` goes on the wrapper around the trigger. The panel gets `<testid>-panel`.

Colours come from `var(--popover-surface)`, `var(--popover-border)` and `var(--popover-ink)`.

```svelte
<Popover open={menu} onclose={() => (menu = false)}>
  <div class="btn" onclick={() => (menu = !menu)}>Menu</div>
  {#snippet content()}
    <div class="item" onclick={rename}>Rename</div>
  {/snippet}
</Popover>
```

`Tooltip` and `Popover` both wrap the trigger in a box that hugs it, at the start of whatever space
the parent gives them, and hang their layer off that box.

## `<anchored>`

For anything else that should sit beside a trigger, GPUI's native `<anchored>` element positions
its child relative to the element it's rendered in. It hangs off its parent's box, zero-sized and
out of flow. Its layer sizes to its content, unless `fill="window"` makes it cover the window, which
is how to build a scrim. Its own `style` styles the layer. It hears only `click`, `mouseenter`,
`mouseleave` and `filedrop`, so `onmousedownoutside` goes on a child.

Two GPUI quirks, as of `@gpuix/native` 0.11:

- Give `<anchored>` itself a background (`transparent` will do), or GPUI paints an opaque
  `#1a1a1a` behind it.
- `align="center"` lands half the layer's own width (or height) short of centre. That's why the
  components hang their layer from a zero-sized box that flex places on the trigger's edge, with
  the `anchor` corner named explicitly.

Its props. Pass numbers and booleans as expressions (`gap={6}`, `deferred={false}`): a quoted
string reaches native as a string and reads as `0` or `true`.

| prop | values | default |
|---|---|---|
| `position` | `{ x, y }` in window coordinates; overrides the trigger | — |
| `side` | `top` `right` `bottom` `left` — the trigger edge to hang off | `bottom` |
| `align` | `start` `center` `end` along that side | `start` |
| `anchor` | `topLeft` `topCenter` `topRight` `rightCenter` `bottomRight` `bottomCenter` `bottomLeft` `leftCenter`; derived from `side` + `align` when unset | — |
| `gap` | px between trigger and child | `0` |
| `offset` | `{ x, y }` px, applied after positioning | `{ x: 0, y: 0 }` |
| `fit` | `snap` keeps it inside the window; `switch` flips the anchor | `snap` |
| `snapMargin` | px kept from the window edge when snapping | `8` |
| `deferred` | paint in a later layer, above everything drawn so far | `true` |
| `priority` | order among deferred layers; higher paints later | `1` |
| `occlude` | block hit testing on what lies beneath | `true` |
| `fill` | `window` covers the whole window and follows a resize; ignores the placement props | — |
