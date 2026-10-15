# Styling

This page covers what CSS reaches GPUI, what gets dropped, and how theming works. In a clone of
the repo, `npm run demo:styling` shows every rule here side by side.

## What works and what does not

There is no CSS engine. The renderer parses the `style` attribute into a plain object and sends it
to GPUI, which lays everything out with flexbox (or a simple grid) in logical pixels. `<style>`
blocks work for class rules, which are compiled the same way.

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
- `<style>` rules made of classes, at most one tag, and `:hover` or `:active`: `.btn`,
  `.btn.primary`, `.a, .b`, `div`, `div.card`. They're scoped per component, like Svelte's DOM
  output. The rule with more classes wins; with equal classes, a rule with a tag beats one
  without; after that, the later rule wins. Inline `style` always wins. `class:` directives and
  dynamic class strings restyle live.
- `hover="..."` and `active="..."` attributes, for hover and press styles set directly on the
  element.
- `var(--token)` and `var(--token, fallback)` in class rules and inline styles, on any property.
  Values come from `set_css_vars({ token: '#fff' })`, and a theme switch is one call (see
  [Theming with CSS variables](#theming-with-css-variables)).
- Any CSS colour syntax: hex, `rgb()`, `hsl()`, named colours.
- `display: flex | grid` and the flexbox properties, `position: absolute`,
  `overflow: hidden | scroll | auto`, `opacity`, `cursor`, `white-space`, `text-overflow`,
  `font-*`, `text-align`, `text-decoration` and `visibility: hidden`.

**What doesn't work**

- Units other than `px` and `rem` (`em`, `vh`, `vw`), and `%` or `auto` anywhere except `width`,
  `height`, `min-*` and `max-*`. These are dropped with a warning, so `margin: 0 auto` can't center
  anything.
- Shorthands GPUI has no field for: `flex: 1` (use `flex-grow: 1`), `border: 1px solid #fff` (use
  `border-width` and `border-color`), `background: linear-gradient(...)` and `box-shadow`.
- Unitless `line-height`: `line-height: 1.5` means 1.5 px, so give it a unit.
- `display: none` has no effect. Use `{#if}`, or `visibility: hidden` to keep the box.
- Any other selector: combinators (descendant, `>`, `+`, `~`), pseudo-classes besides `:hover`
  and `:active`, pseudo-elements, `:global`, attribute selectors, `@media` and nesting. The
  compiler refuses them with a warning.
- `transform`, `transition`, `z-index` and `letter-spacing` are ignored without a warning.
- Only text properties (colour, font) inherit from a parent.
- Assume the rest of CSS is missing too. The two lists below are what GPUI does understand.

<details>
<summary>Working, standard CSS semantics</summary>

Values are logical pixels unless noted, and `rem` is 16 px, GPUI's fixed rem size. Only the listed
keywords are recognised.

- Layout: `display: flex | grid`; `flex-direction: row | column`;
  `flex-wrap: wrap | wrap-reverse | nowrap`; `flex-grow`, `flex-shrink`, `flex-basis`; `gap`,
  `row-gap`, `column-gap`.
- Alignment: `align-items: center | start | end`;
  `align-self: center | start | end | stretch | baseline`;
  `align-content: center | start | end | space-between | space-around | space-evenly | stretch | normal`;
  `justify-content: center | start | end | space-between | space-around`. The `flex-` prefixed
  forms work too. `justify-content` has no `space-evenly`.
- Sizing: `width`, `height`, `min-width`, `min-height`, `max-width`, `max-height` in px, `%` or
  `auto`.
- Spacing: `padding`, `margin` and their four sides, with 1 to 4 value shorthands.
- Position: `position: relative | absolute`; `top`, `right`, `bottom`, `left`; `inset`.
- Overflow: `overflow`, `overflow-x`, `overflow-y` as `hidden | scroll | auto`. `auto` ships as
  `scroll`, and since GPUI paints no scrollbars the two behave the same.
- Paint: `background-color`, `color`, `border-color` in any CSS colour syntax; `opacity`;
  `border-width` and its four sides; `border-radius` and its four corners, with 1 to 4 value
  shorthands.
- Text: `font-size`, `font-family`, `font-weight` (`100`–`900`, `normal`, `bold`);
  `text-align: left | center | right | start`; `line-height` in px or rem;
  `white-space: nowrap | normal`; `text-overflow: ellipsis`;
  `text-decoration: underline | line-through | none`.
- Visibility: `visibility: hidden` paints nothing, keeps the layout box and leaves the tab order.
- Interaction: `cursor` with the CSS keyword set (`pointer`, `text`, `grab`, `grabbing`, `move`,
  `crosshair`, `not-allowed`, the `*-resize` family, `copy`, `alias`, `context-menu`, `default`);
  `pointer-events: none | auto`; `user-select: none`; `:hover` and `:active` rules in `<style>`.

</details>

<details>
<summary>Working, non-standard CSS semantics</summary>

These are accepted, but they mean something different from what CSS would.

- Unitless numbers are pixels: `padding: 12`, `font-size: 18`.
- `max-content`, `min-content` and `fit-content(...)` on `width` / `height` / `min-*` / `max-*`
  read as `auto`.
- `grid-template-columns: 3` and `grid-template-rows: 2` take a number: the count of equal
  tracks. `grid-column-min` and `grid-row-min` (`min-content | max-content`) are GPUI's own
  properties for each track's minimum.
- `justify-content: between | around` are aliases for `space-between` and `space-around`.
- `position: fixed` lays out exactly like `absolute`.
- `text-overflow: ellipsis-start` truncates from the left.
- `line-clamp: N` works unprefixed, with no `display: -webkit-box` needed.
- `font-weight` also takes `thin`, `extralight`, `light`, `medium`, `semibold`, `extrabold`,
  `black` and any number from 1 to 1000.
- `hover="..."` and `active="..."` are attributes that take the same CSS text as `style` and apply
  while the pointer is over, or pressing, the element. They're an inline form of `:hover` and
  `:active`: `<div style="color: #ccc" hover="color: #fff">` equals `.x { color: #ccc }` plus
  `.x:hover { color: #fff }`. When both exist, the attribute wins.
- `selection-color` sets the colour of the text-selection highlight, the job CSS gives to
  `::selection`.
- Mouse events never bubble, and with `pointer-events` unset, an element that paints a background
  or is `position: absolute` blocks clicks to whatever is behind it. Put `hitbox="self"` on the
  clickable element, and the renderer sets `pointer-events: none` on every descendant that has no
  listener of its own, `<img>` and `<svg>` included, so badges and icons pass the click through.
  A few descendants keep their hitbox: a child with its own handler, focusable elements
  (`tabindex` or `autofocus`), scroll containers, and the elements that take input themselves
  (`input`, `textarea`, `code`, `diff`, `markdown`, `virtual-list`, `anchored`, `canvas`). A
  `pointer-events` you set yourself still wins.
- `onclick` is the primary button alone, as in the DOM. A right or middle click is `onauxclick`,
  where `e.isRightClick` tells the two apart and `e.x` / `e.y` are window coordinates, so a menu
  rendered through `<Portal>` can be placed right at them. macOS's ctrl+click arrives as an
  ordinary `onclick` with `e.modifiers.ctrl` set, so a handler that wants the platform's secondary
  click checks for it. `hitbox="self"` shields aux clicks like any other.
- Animation goes through the `motion={{ initial, animate, transition }}` prop, which animates
  `left`, `top`, `width`, `height`, `opacity` and `borderRadius` natively, with durations in
  seconds.

</details>

## Theming with CSS variables

Class rules are compiled ahead of time, but a `var()` in one resolves at runtime against a map you
control. A palette is one object, and a theme switch is one call:

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

`set_css_vars` restyles exactly the elements whose style read a variable, in one batch. A call
whose values are all already in force does nothing. `var()` works on any property, pixel-only ones
included, and inside inline `style=` too. Keys work with or without the `--`, and setting one to
`null` unsets it.

`var(--name, fallback)` uses the fallback while the variable is unset. Without a fallback, the
declaration is dropped and the name is warned about once, when the frame that read it ships.
Because the warning waits for that frame, variables set by an `$effect` like the one above (which
runs after Svelte has styled the tree) are never reported.

Substrate, a second-brain app built on this renderer, themes itself exactly this way: one palette
object per mode, handed over from its root component in an `$effect`.
