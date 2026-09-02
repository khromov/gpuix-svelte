There is no CSS engine. The `style` attribute is parsed as CSS *text* and turned into a plain object GPUI can deserialize — camelCase keys, bare numbers for lengths. That gives you flexbox, colours, borders, radii, fonts, opacity and cursors, with rules worth memorising:

- **Lengths are logical pixels.** `12px` becomes `12`; `rem`, `em` and `vh` are dropped with a warning. `%` and `auto` survive only on `width`, `height`, `min-*` and `max-*` — so `margin: 0 auto` never centers and `border-radius: 50%` is not a circle.
- **Box shorthands expand** (`padding: 8px 16px`, `margin`, `border-width`, `border-radius`, `gap`, `inset`). Other shorthands have no field to land in: write `flex-grow: 1` not `flex: 1`, and `border-width` + `border-color` not `border`.
- **A bad value costs the frame.** A key GPUI knows, handed a string it cannot parse, throws inside `applyBatch` and the whole batch is lost. The renderer type-checks every value first and drops offenders with a one-time warning instead of shipping them.
- **`hover="…"` and `active="…"`** are attributes carrying the same CSS text, applied natively. `<style>` blocks work for class rules — `.btn`, `.btn.primary`, `.btn:hover`, one tag — scoped per component; descendant selectors, `:global` and `@media` are refused at compile time.
- **`var(--token)` is the theme.** A rule that reads one resolves at runtime against `set_css_vars({ token: '#fff' })`, on any property and with `var(--token, fallback)` for a default, so a palette is one object and switching it restyles every element that read a variable in one batch.
- `line-height` is pixels too (`1.5` means 1.5 px), `display: none` does nothing (use `{#if}`), and `transform`, `transition`, `z-index`, `text-decoration` are silently ignored.

Watch the terminal while this step is open: `samples/Styled.svelte` contains one declaration that is dropped on purpose. `npm run demo:styling` shows a whole wall of these side by side.
