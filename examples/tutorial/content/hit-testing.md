Pointer input is where GPUI differs most from the DOM, and where most first bugs come from.

- **Events do not bubble.** A `click` handler runs only on the element GPUI hit. Put `onclick` on the element that paints the button, not on a wrapper around it.
- **A painted child occludes its parent.** Any child with a non-transparent `background-color` or with `position: absolute` takes the hit for its own area (a border or `position: relative` alone does not), and since nothing bubbles the parent never hears about it. Put `hitbox="self"` on the clickable element and the renderer gives every decorative descendant `pointer-events: none` for you (a nested element with its own pointer handler, an input or a scroll container keeps its hitbox) — the *broken* button on the right lacks it, the *fixed* one has it.
- **The pointer is captured only by an element that listens for both `mousedown` and `mousemove`.** Put `mousedown`, `mousemove` and `mouseup` on the element the user grabs, as the scrollbar thumbs here do, and its moves and release keep arriving after the pointer leaves it, even outside the window. An overlay shown on the press does not work: it never arms capture. Still treat a move whose `pressedButton` is `null` as a release that was lost.
- **A left mousedown starts a text selection**, and every later move extends it across whatever text lies in between. Put `user-select: none` on drag handles, sliders and toolbars.
- `hover="…"` and `active="…"` need no JavaScript at all; reach for `mouseenter` / `mouseleave` only when you need the state.

Click both badges on the right and compare the counters.
