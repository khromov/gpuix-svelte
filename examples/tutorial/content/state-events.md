Runes work unchanged: `$state`, `$derived`, `$effect`, `$props`. What differs is the path an event takes to your handler, and the path the result takes back to the screen.

1. GPUI hit-tests the click and calls the native callback with `{ elementId, eventType, x, y, … }`.
2. `dispatch()` finds the shadow node by id and runs the handlers registered on **that element only** — events never bubble (step 8).
3. Your handler mutates state. The renderer then calls `flushSync()` so Svelte's effects run *now*, and `commit()` ships the resulting mutations as one `applyBatch` — inside the same frame as the click.

Only the events GPUI knows can fire: `click`, `mousedown` / `mouseup` / `mousemove`, `mouseenter` / `mouseleave`, `keydown` / `keyup` (these need focus: `tabindex` or `autofocus`), `focus` / `blur`, `scroll`, and `change` / `submit` on inputs. Svelte lowercases the attribute name and the renderer maps it back to GPUI's camelCase (`onmouseenter` → `mouseEnter`); unknown names are dropped silently.

The payload is the event object: `e.x`, `e.y`, `e.button`, `e.key`, `e.modifiers.cmd`, and `e.target` is the shadow node (`e.target.nativeId` is its GPUI id).

Try the counter on the right, then hover the **+** button: `hover="…"` is applied by GPUI itself, with no round trip to JavaScript.
