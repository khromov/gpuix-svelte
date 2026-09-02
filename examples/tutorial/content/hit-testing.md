Pointer input is where GPUI differs most from the DOM, and where most first bugs come from.

- **Events do not bubble.** A `click` handler runs only on the element GPUI hit. Put `onclick` on the element that paints the button, not on a wrapper around it.
- **A painted child occludes its parent.** Any child with a `background-color`, a border, or `position: absolute` takes the hit for its own area, and since nothing bubbles the parent never hears about it. Put `hitbox="self"` on the clickable element and the renderer gives every decorative descendant `pointer-events: none` for you (a nested element with its own handler, an input or a scroll container keeps its hitbox) — the badge in the *broken* button on the right lacks it, the *fixed* one has it.
- **The pointer is not captured on mousedown.** A drag that leaves the element stops receiving `mousemove`. Put `mousemove` / `mouseup` on every surface the pointer may cross (or show a window-sized `position: absolute` overlay for the drag's duration, as the scrollbar thumbs here do), and treat a move whose `pressedButton` is `null` as the release that happened somewhere else.
- **A left mousedown starts a text selection**, and every later move extends it across whatever text lies in between. Put `user-select: none` on drag handles, sliders and toolbars.
- `hover="…"` and `active="…"` need no JavaScript at all; reach for `mouseenter` / `mouseleave` only when you need the state.

Click both badges on the right and compare the counters.
