# Styling

What CSS reaches GPUI, what is dropped, and how theming works. `npm run demo:styling` in a clone
of the repo shows every rule here side by side.

## What works and what does not

There is no CSS engine. The `style` attribute is parsed into a plain object and sent to GPUI,
whose layout is flexbox in logical pixels. `<style>` blocks work for class rules, compiled the
same way.

```svelte
<div class="btn" style="padding: 8px 16px; border-radius: 8px">Click</div>

<style>
  .btn { background-color: #313244; color: #cdd6f4; }
  .btn:hover { background-color: #45475a; }
</style>
```

**What works**

- Inline `style` and `style:` directives. Box shorthands (`padding: 8px 16px`, `margin`,
  `border-width`, `border-radius`, `gap`, `inset`) expand to GPUI's longhands.
- `<style>` rules made of classes, at most one tag, and `:hover` / `:active`: `.btn`,
  `.btn.primary`, `.a, .b`, `div`. Scoped per component like Svelte's DOM output. Specificity is
  class count, then source order; inline `style` always wins. `class:` directives and dynamic
  class strings restyle live.
- `hover="..."` and `active="..."` attributes: `:hover` and `:active` styles set directly on the element.
- `var(--token)` and `var(--token, fallback)` in class rules and inline styles, on any property.
  Values come from `set_css_vars({ token: '#fff' })`; a theme switch is one call — see
  [Theming with CSS variables](#theming-with-css-variables).
- Any CSS colour syntax: hex, `rgb()`, `hsl()`, named colours.
- `display: flex | grid` and the flexbox properties, `position: absolute`, `overflow: hidden | scroll`,
  `opacity`, `cursor`, `white-space`, `text-overflow`, `font-*`, `text-align`, `text-decoration`,
  `visibility: hidden`.

**What doesn't work**

- Units other than `px` (`rem`, `em`, `vh`), and `%` or `auto` outside `width` / `height` /
  `min-*` / `max-*`. Dropped with a warning, so `margin: 0 auto` never centers.
- Shorthands GPUI has no field for: `flex: 1` (use `flex-grow: 1`), `border: 1px solid #fff` (use
  `border-width` + `border-color`), `background: linear-gradient(...)`, `box-shadow`.
- `line-height: 1.5` means 1.5 px. Always give it a unit.
- `display: none` does nothing. Use `{#if}`, or `visibility: hidden` to keep the box.
- Other selectors: descendant combinators, `:global`, attribute selectors, `@media`, nesting.
  Refused at compile time with a warning.
- `transform`, `transition`, `z-index`, `letter-spacing` are silently ignored.
  Only text properties (colour, font) inherit from a parent.
- Probably a lot of other things from CSS.

<details>
<summary>Working, standard CSS semantics</summary>

Values are logical pixels unless noted. Only the listed keywords are recognised.

- Layout: `display: flex | grid`; `flex-direction: row | column`; `flex-wrap: wrap | wrap-reverse | nowrap`;
  `flex-grow`, `flex-shrink`, `flex-basis`; `gap`, `row-gap`, `column-gap`.
- Alignment: `align-items: center | start | end`; `align-self: center | start | end | stretch | baseline`;
  `align-content: center | start | end | space-between | space-around | space-evenly | stretch | normal`;
  `justify-content: center | start | end | space-between | space-around` (the `flex-` prefixed forms too;
  no `space-evenly` for `justify-content`).
- Sizing: `width`, `height`, `min-width`, `min-height`, `max-width`, `max-height` in px, `%` or `auto`.
- Spacing: `padding`, `margin` and their four sides, with 1 to 4 value shorthands.
- Position: `position: relative | absolute`; `top`, `right`, `bottom`, `left`; `inset`.
- Overflow: `overflow`, `overflow-x`, `overflow-y` as `hidden | scroll`.
- Paint: `background-color`, `color`, `border-color` in any CSS colour syntax; `opacity`;
  `border-width` and its four sides; `border-radius` and its four corners, with 1 to 4 value shorthands.
- Text: `font-size`, `font-family`, `font-weight` (`100`–`900`, `normal`, `bold`);
  `text-align: left | center | right | start`; `line-height` in px; `white-space: nowrap | normal`;
  `text-overflow: ellipsis`; `text-decoration: underline | line-through | none`.
- Visibility: `visibility: hidden` paints nothing, keeps the layout box and leaves the tab order.
- Interaction: `cursor` with the CSS keyword set (`pointer`, `text`, `grab`, `grabbing`, `move`,
  `crosshair`, `not-allowed`, the `*-resize` family, `copy`, `alias`, `context-menu`, `default`);
  `pointer-events: none | auto`; `user-select: none`; `:hover` and `:active` rules in `<style>`.

</details>

<details>
<summary>Working, non-standard CSS semantics</summary>

Accepted, but not what CSS would mean by it.

- Unitless numbers are pixels: `padding: 12`, `font-size: 18`.
- `grid-template-columns: 3` and `grid-template-rows: 2` take a count of equal tracks, not a track list.
  `grid-column-min` and `grid-row-min` (`min-content | max-content`) set each track's minimum; neither
  is a CSS property.
- `justify-content: between | around` are aliases for `space-between` and `space-around`.
- `position: fixed` lays out exactly like `absolute`; there is no viewport to fix to.
- `text-overflow: ellipsis-start` truncates from the left.
- `line-clamp: N` works unprefixed, without `display: -webkit-box`.
- `font-weight` also takes `thin`, `extralight`, `light`, `medium`, `semibold`, `extrabold`, `black`
  and any number from 1 to 1000.
- `hover="..."` and `active="..."` are attributes that take the same CSS text as `style` and apply
  only while the pointer is over, or pressing, the element. CSS cannot write a `:hover` rule inline;
  here `<div style="color: #ccc" hover="color: #fff">` is the same as `.x { color: #ccc }` plus
  `.x:hover { color: #fff }`. If both exist, the attribute wins.
- `selection-color` sets the text-selection highlight; CSS has no equivalent.
- With `pointer-events` unset, an element that paints a background or is `position: absolute` blocks
  clicks to whatever is behind it, and mouse events never bubble. Put `hitbox="self"` on the
  clickable element: the renderer then gives every descendant without a listener of its own
  (`<img>` and `<svg>` included; inputs, scroll containers and focusable elements excepted)
  `pointer-events: none`, so badges and icons pass the click through, while a child with its own
  handler keeps its hitbox. Setting `pointer-events` yourself still wins.
- `onclick` is the primary button alone, as in the DOM. A right or middle click is `onauxclick`,
  where `e.isRightClick` tells the two apart and `e.x` / `e.y` are window coordinates, so a menu
  rendered through `<Portal>` can be placed straight at them. macOS's ctrl+click is *not* routed
  there — it arrives as an ordinary `onclick` with `e.modifiers.ctrl`, so a handler that wants the
  platform's secondary click has to check for it. `hitbox="self"` shields aux clicks like any other.
- Animation goes through the `motion={{ initial, animate, transition }}` prop (`left`, `top`, `width`,
  `height`, `opacity`, `border-radius`), not `transition`.

</details>

`npm run demo:styling` shows all of these side by side.

## Theming with CSS variables

Class rules are compiled ahead of time, but a `var()` in one resolves at runtime against a map you
control, so a palette is one object and a theme switch is one call:

```svelte
<script>
  import { set_css_vars } from 'gpuix-svelte';

  const LIGHT = { surface: '#fbf7ef', ink: '#2a251f', border: '#e2d8c4' };
  const DARK = { surface: '#231f1b', ink: '#ece3d3', border: '#36302a' };
  let { dark } = $props();

  $effect(() => set_css_vars(dark ? DARK : LIGHT));
</script>

<div class="card">…</div>

<style>
  .card { background-color: var(--surface); color: var(--ink); border-color: var(--border); }
  .card:hover { border-color: var(--ink); }
  .badge { padding: var(--badge-pad, 2px 6px); }
</style>
```

`set_css_vars` restyles exactly the elements whose style read a variable, in one batch, and a call
whose values are all already in force is a no-op. A `var()` works on any property, pixel-only ones
included, and inside inline `style=` too. `var(--name, fallback)` uses the fallback while the
variable is unset; without one the declaration is dropped, and the name is warned about once when
the frame that read it ships — the `$effect` above runs after Svelte has styled the tree, so
variables it defines are never reported. Keys are accepted with or without the `--`. Substrate
(`examples/second-brain/lib/theme.ts`) is the worked example: one palette object per mode, handed
over from `App.svelte` in an `$effect`.
