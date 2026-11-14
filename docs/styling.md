# Styling

## What works and what does not

There is no CSS engine. Each style is translated property by property into GPUI's own style
object, and GPUI lays everything out with flexbox (or a simple grid) in pixels. `<style>` blocks
work for class rules, which are translated the same way.

```svelte
<div class="btn" style="padding: 8px 16px; border-radius: 8px">Click</div>

<style>
  .btn {
    background-color: #111111;
    color: #ededed;
  }
  .btn:hover {
    background-color: #1c1c1c;
  }
</style>
```

**What works**

- Inline `style` and `style:` directives. Box shorthands (`padding: 8px 16px`, `margin`,
  `border-width`, `border-radius`, `gap`, `inset`) expand to GPUI's longhands.
- `<style>` rules made of classes, at most one tag, and `:hover`, `:active` or `:focus-visible`:
  `.btn`, `.btn.primary`, `.a, .b`, `div`, `div.card`. They're scoped per component, like Svelte's
  DOM output. The rule with more classes wins; with equal classes, a rule with a tag beats one
  without; after that, the later rule wins. Inline `style` beats every plain class rule, but a
  class `:hover`, `:active` or `:focus-visible` rule still applies on top of it while the element
  is in that state. `class:` directives and dynamic class strings restyle live.
- `hover="..."`, `active="..."` and `focus-visible="..."` attributes, for hover, press and
  keyboard-focus styles set directly on the element.
- `@media` blocks over the window's `width`, `height` and `orientation`, restyled as the window is
  resized (see [Media queries](#media-queries)).
- `var(--token)` and `var(--token, fallback)` in class rules and inline styles, on any property.
  Values come from a `:root { --token: #fff; }` rule in any component's `<style>`, from
  `set_css_vars({ token: '#fff' })`, which makes a theme switch one call, from an element that
  declares one for itself and what is inside it (`.card { --token: #fff; }`,
  `style="--token: #fff"`), and from a style prop on a component (`<Card --token="#fff" />`). See
  [Theming with CSS variables](#theming-with-css-variables).
- Any CSS colour syntax: hex, `rgb()`, `hsl()`, named colours.
- `display: flex | grid` and the flexbox properties, `position: absolute`,
  `overflow: hidden | scroll | auto`, `opacity`, `cursor`, `white-space`, `text-overflow`,
  `font-size`, `font-family`, `font-weight`, `text-align`, `text-decoration` and
  `visibility: hidden`.

**What doesn't work**

- Units other than `px` and `rem` (`em`, `vh`, `vw`), and `%` or `auto` anywhere except `width`,
  `height`, `min-*` and `max-*`. These are dropped with a warning, so `margin: 0 auto` can't center
  anything.
- Shorthands GPUI has no field for: `flex: 1` (use `flex-grow: 1` with `flex-basis: 0`, which is
  what `flex: 1` means), `border: 1px solid #fff` (use `border-width` and `border-color`),
  `font: 12px Menlo`, `background` with anything but a single colour, and `box-shadow`. A
  `background: linear-gradient(...)` paints nothing but still blocks clicks to what is behind it.
- Unitless `line-height`: `line-height: 1.5` means 1.5 px, so give it a unit.
- A bare number on a property that takes a word or a colour (`color: 123456`, `background: 0`) is
  dropped with a warning.
- `!important` is ignored: the declaration applies as if it were not there, so it can't make a class
  rule beat inline `style`. The one place it counts is on a variable in a `:root` rule, which it
  puts above `set_css_vars`.
- `display: none` has no effect. Use `{#if}`, or `visibility: hidden` to keep the box.
- Any other selector: combinators (descendant, `>`, `+`, `~`), pseudo-classes besides `:hover`,
  `:active` and `:focus-visible`, pseudo-elements, `:global`, attribute selectors, nesting, and
  every at-rule but `@media` (see [Media queries](#media-queries)). The compiler refuses them with
  a warning. `:root`, also written `:global(:root)`, is accepted for the variables it declares
  (see [Theming with CSS variables](#theming-with-css-variables)).
- `transform`, `transition`, `z-index`, `letter-spacing` and `font-style` are ignored, mostly
  without a warning.
- Only text properties inherit from a parent (colour, font, `line-height`, `text-align`,
  `white-space`, `text-overflow`, `line-clamp`, `text-decoration`), plus `user-select`,
  `selection-color` and the variables an element declares. An `<svg>` gets its parent's `color`
  from the renderer, but not the parent's `:hover` colour.
- Whitespace in the text of your markup collapses as it does in HTML, so a sentence wrapped over
  several indented lines is drawn with single spaces (from the next release, 0.6.0; before it the
  line break and the indentation are drawn too). The compiler does this, and only for text written
  in the template: a string that comes from an expression (`{message}`) is drawn as written, line
  breaks included, as is the text inside `<pre>` and `<textarea>`. A no-break space is kept, as in
  HTML. `<svelte:options preserveWhitespace />` turns the collapsing off for a component, whose
  text is then drawn exactly as written. `white-space: pre` and `pre-wrap` do not exist.
- Assume the rest of CSS is missing too.

<details>
<summary>Working, standard CSS semantics</summary>

Values are logical pixels unless noted, and `rem` is 16 px, GPUI's fixed rem size. Only the listed
keywords are recognised.

- Layout: `display: flex | grid`; `flex-direction: row | column`;
  `flex-wrap: wrap | wrap-reverse | nowrap`; `flex-grow`, `flex-shrink`, `flex-basis`; `gap`,
  `row-gap`, `column-gap`.
- Alignment: `align-items: center | start | end | stretch | baseline`;
  `align-self: center | start | end | stretch | baseline`;
  `align-content: center | start | end | space-between | space-around | space-evenly | stretch | normal`;
  `justify-content: center | start | end | space-between | space-around | space-evenly`. The
  `flex-` prefixed forms work too.
- Sizing: `width`, `height`, `min-width`, `min-height`, `max-width`, `max-height` in px, `%` or
  `auto`; `aspect-ratio` as a number or `16 / 9`.
- Spacing: `padding`, `margin` and their four sides, with 1 to 4 value shorthands.
- Position: `position: relative | absolute`; `top`, `right`, `bottom`, `left`; `inset`.
- Overflow: `overflow`, `overflow-x`, `overflow-y` as `hidden | scroll | auto`. `auto` is treated
  as `scroll`, and the two behave the same.
- Paint: `background-color` (or `background` with a single colour), `color`, `border-color` in
  any CSS colour syntax; `opacity`; `border-width` and its four sides; `border-radius` and its four
  corners, with 1 to 4 value shorthands; `border-style: solid | dashed`; `outline-width`,
  `outline-color`, `outline-offset`.
- Text: `font-size`; `font-family`, passed through as written, so give one family name;
  `font-weight` (`100`–`900`, `normal`, `bold`); `text-align: left | center | right | start`;
  `line-height` in px or rem; `white-space: nowrap | normal`; `text-overflow: ellipsis`;
  `text-decoration: underline | line-through | none`.
- Visibility: `visibility: hidden` paints nothing, keeps the layout box and leaves the tab order.
- Interaction: `cursor` as `default`, `auto`, `pointer`, `text`, `vertical-text`, `grab`,
  `grabbing`, `move`, `all-scroll`, `crosshair`, `not-allowed`, `no-drop`, the `*-resize` family,
  `copy`, `alias` and `context-menu` (`move` and `all-scroll` show the closed hand; `help`,
  `wait`, `progress`, `cell`, `zoom-in` and `zoom-out` are ignored); `pointer-events: none | auto`;
  `user-select: none | text | auto`; `:hover`, `:active` and `:focus-visible` rules in `<style>`,
  the last applying after keyboard focus only, like CSS.

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
- `justify-content` and `align-content` take `between`, `around` and `evenly` as aliases for
  `space-between`, `space-around` and `space-evenly`.
- `position: fixed` lays out exactly like `absolute`.
- `text-overflow: ellipsis-start` truncates from the left.
- `line-clamp: N` works unprefixed, with no `display: -webkit-box` needed.
- `font-weight` also takes `thin`, `extralight`, `light`, `medium`, `semibold`, `extrabold`,
  `black` (the hyphenated spellings too) and any number from 1 to 1000. A name GPUI doesn't know,
  such as `bolder`, falls back to 400.
- `hover="..."` and `active="..."` are attributes that take the same CSS text as `style` and apply
  while the pointer is over, or pressing, the element. They're an inline form of `:hover` and
  `:active`: `<div style="color: #a1a1a1" hover="color: #ededed">` equals `.x { color: #a1a1a1 }`
  plus `.x:hover { color: #ededed }`. When both exist, the attribute wins. `focus-visible="..."` is the
  same for `:focus-visible`.
- `scrollbar-color` makes GPUI paint a thumb on an `overflow: scroll` container or a
  `<virtual-list>`, and `scrollbar-width` (in px, default 6) sizes it. There is no track, so of the
  standard `thumb track` pair only the first colour applies. Without a colour GPUI paints no
  scrollbar at all, and the thumb never takes the pointer.
- A scroll area inside another one needs `pointer-events: auto`. GPUI scrolls every scroll
  container under the pointer on each wheel event, inner and outer at once, so a list inside a
  scrolling page moves a little while the page carries it away. An explicit `pointer-events: auto`
  makes the inner one occlude what is behind it, so only it takes the wheel (there is no handing
  over to the page at its ends, as `overscroll-behavior: contain` would do). Behind it, hover and
  clicks stop too.
- `keyboard-focus-dim: false` keeps an element at full opacity when the window has the dim on
  (`render(App, { keyboardFocusDim: true })`, see
  [the guide's focus section](guide.md#keyboard-shortcuts-and-focus)).
- `selection-color` sets the colour of the text-selection highlight, the job CSS gives to
  `::selection`.
- Mouse events never bubble, and an element that paints a background or is `position: absolute`
  blocks clicks to whatever is behind it. Put `hitbox="self"` on the clickable element, and clicks
  on its badges, icons and images pass straight through to it. Descendants that take input keep
  their own hitbox: a child with its own handler (other than `onlayout`, `onscrollchange`,
  `onmotioncomplete` and `onhighlight`, which take no pointer), focusable elements (`tabindex` or
  `autofocus`), scroll containers, and the input-taking elements (`button`, `input`, `textarea`,
  `code`, `diff`, `markdown`, `virtual-list`, `anchored`). A `pointer-events` you set yourself still wins.
- `onclick` is the primary button alone, as in the DOM. A right or middle click is `onauxclick`,
  where `e.isRightClick` tells the two apart and `e.x` / `e.y` are window coordinates, so a menu
  rendered through `<Portal>` can be placed right at them. macOS's ctrl+click arrives as an
  ordinary `onclick` with `e.modifiers.ctrl` set, so a handler that wants the platform's secondary
  click checks for it. `hitbox="self"` shields aux clicks like any other.
- Animation goes through the `motion={{ initial, animate, transition }}` prop, which animates
  `left`, `top`, `right`, `bottom`, `width`, `height`, `opacity` and `borderRadius` natively, with
  durations in seconds.

</details>

## Theming with CSS variables

Class rules are compiled ahead of time, but a `var()` in one resolves at runtime. A variable can
be declared in four places, and reaches as far from each as it does in a browser:

- A `:root` rule, in any component's `<style>`: the whole app.
- `set_css_vars()`, from JavaScript: the whole app, over what `:root` says. This is how a theme is
  switched ([A light and a dark palette](#a-light-and-a-dark-palette)).
- An element, in a class rule or its inline `style`: that element and everything inside it
  ([Variables on an element](#variables-on-an-element)).
- A style prop on a component, `<Card --accent="#ff3e00" />`: everything the component renders
  ([Style props](#style-props)).

The usual start is a `:root` rule that every component reads:

```svelte
<div class="card">
  <text class="badge">new</text>
</div>

<style>
  :root {
    --surface: #111111;
    --ink: #ededed;
    --border: #242424;
  }
  .card {
    background-color: var(--surface);
    color: var(--ink);
    border-width: 1px;
    border-color: var(--border);
  }
  .card:hover {
    border-color: var(--ink);
  }
  .badge {
    padding: var(--badge-pad, 2px 6px);
  }
</style>
```

`var()` works on any property, pixel-only ones included, and inside inline `style=` too.
`var(--name, fallback)` uses the fallback while the variable is unset. Without a fallback, the
declaration is dropped and a warning names the variable once.

A `:root` rule follows the browser's rules wherever a window can:

- The variables exist once the component's file is imported, mounted or not. Where two files
  declare the same one, the file imported later wins, and a component's own rule wins over those of
  the components it imports.
- A variable may read another (`--accent-ink: var(--accent)`). One that reads an unset variable
  with no fallback, or that is part of a cycle, counts as unset itself.
- `@media` around the rule works as around any other (see [Media queries](#media-queries)), so
  `@media (max-width: 700px) { :root { --gap: 8px; } }` changes `--gap` as the window is resized.
- `:global(:root)` means the same.
- Under `render_hot`, an edit to the rule shows on save, like any other style.

What a browser would honour and a window can't is refused when the component compiles, with a
warning naming the file:

- A property that is not a variable (`:root { color: red; }`). In a browser it styles `<html>`,
  and a window has no element above your app's own root, so style that one or pass `rootStyle`.
- `:root` with anything attached (`:root.dark`, `:root:hover`), and `@media` queries a window has
  no answer for, such as `prefers-color-scheme`. Switch a palette with `set_css_vars` instead, or
  put the class on an element of your own, which can declare variables like any other.
- A variable declared for a state (`.card:hover { --tint: #fff; }`, and the same under `:active`
  and `:focus-visible`). GPUI applies those three states itself and tells nobody, so the elements
  inside could not follow. The rule's other declarations still apply.

### A light and a dark palette

`set_css_vars()` sets variables from JavaScript, so a palette is one object per mode and a switch
is one call. The component below is a whole app's theme: every colour in its styles is a variable,
both palettes name the same ones, and what does not change with the mode sits in a `:root` rule.
It runs as it is in a window and in the [DOM build](dom.md), which is what draws it on this page:

```svelte demo palette
<script>
  import { set_css_vars } from 'gpuix-svelte';

  const PALETTES = {
    dark: {
      paper: '#0c0a09',
      panel: '#1c1917',
      raised: '#292524',
      edge: '#44403c',
      ink: '#f5f5f4',
      dim: '#a8a29e',
      brand: '#fb923c',
      'on-brand': '#0c0a09'
    },
    light: {
      paper: '#f5f5f4',
      panel: '#ffffff',
      raised: '#e7e5e4',
      edge: '#d6d3d1',
      ink: '#1c1917',
      dim: '#57534e',
      brand: '#c2410c',
      'on-brand': '#ffffff'
    }
  };
  const DEPLOYS = [
    { name: 'web', state: 'Live', when: '2 min ago' },
    { name: 'api', state: 'Building', when: 'now' },
    { name: 'docs', state: 'Live', when: 'yesterday' }
  ];

  let mode = $state('dark');

  $effect(() => set_css_vars(PALETTES[mode]));
</script>

<div class="app">
  <div class="bar">
    <div class="title">Deployments</div>
    <div class="btn" onclick={() => (mode = mode === 'dark' ? 'light' : 'dark')}>
      {mode === 'dark' ? 'Light' : 'Dark'} mode
    </div>
  </div>
  <div class="panel">
    {#each DEPLOYS as deploy (deploy.name)}
      <div class="row">
        <div class="name">{deploy.name}</div>
        <div class="state" class:busy={deploy.state !== 'Live'}>{deploy.state}</div>
        <div class="when">{deploy.when}</div>
      </div>
    {/each}
  </div>
</div>

<style>
  :root {
    --radius: 10px;
    --row-pad: 10px 14px;
  }
  .app {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    gap: 12px;
    padding: 16px;
    border-radius: var(--radius);
    background-color: var(--paper);
    color: var(--ink);
  }
  .bar {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .title {
    font-size: 16px;
    font-weight: 600;
  }
  .btn {
    padding: 6px 12px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    user-select: none;
    background-color: var(--brand);
    color: var(--on-brand);
  }
  .panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-width: 1px;
    border-style: solid;
    border-color: var(--edge);
    border-radius: var(--radius);
    background-color: var(--panel);
  }
  .row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: var(--row-pad);
  }
  .row:hover {
    background-color: var(--raised);
  }
  .name {
    flex-grow: 1;
    font-weight: 500;
  }
  .state {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    background-color: var(--raised);
  }
  .state.busy {
    background-color: var(--brand);
    color: var(--on-brand);
  }
  .when {
    width: 80px;
    font-size: 12px;
    text-align: right;
    color: var(--dim);
  }
</style>
```

`set_css_vars()` restyles only the elements that use a variable, all in one frame, and a call that
changes nothing does nothing. Keys work with or without the `--`. Setting the palette from an
`$effect` like the one above is fine: the check for unset variables runs after your effects have,
so one the effect sets is never reported.

A value set this way wins over a `:root` rule's, because the DOM build writes it to `<html>`'s
inline style, which a browser ranks above a rule. Setting it to `null` (or `''`) takes it away
again, and the `:root` value, if there is one, shows through. So a `:root` rule can hold the
defaults and `set_css_vars` only what a theme changes. A variable declared `!important` in `:root`
is the exception, there as in a browser: `set_css_vars` can't override it.

### Variables on an element

A variable declared on an element, in a class rule or its inline `style`, belongs to that element
and to everything inside it, child components included. There it outranks `:root` and
`set_css_vars()`, an `!important` declaration in `:root` too, and where two elements around a
reader declare the same variable, the nearer one wins. That is a browser's inheritance, so the DOM
build draws the same thing. The cards below borrow `--panel`, `--ink` and `--raised` from the
palette above and set a `--tint` of their own:

```svelte demo scoped
<script>
  const TINTS = ['#fb923c', '#38bdf8', '#4ade80'];

  let tint = $state(TINTS[1]);
  let muted = $state(true);
</script>

<div class="cards">
  <div class="card">
    <div class="tag">:root</div>
    <div class="note">Nothing around this card declares a tint.</div>
  </div>
  <div class="card" class:muted>
    <div class="tag">class rule</div>
    <div class="btn" onclick={() => (muted = !muted)}>{muted ? 'Remove' : 'Add'} .muted</div>
  </div>
  <div class="card" style:--tint={tint}>
    <div class="tag">inline style</div>
    <div class="swatches">
      {#each TINTS as colour (colour)}
        <div class="swatch" style:--tint={colour} onclick={() => (tint = colour)}></div>
      {/each}
    </div>
  </div>
</div>

<style>
  :root {
    --tint: #f472b6;
  }
  .muted {
    --tint: #a8a29e;
  }
  .cards {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 12px;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    width: 180px;
    padding: 12px;
    border-width: 1px;
    border-style: solid;
    border-color: var(--tint);
    border-radius: 10px;
    background-color: var(--panel);
    color: var(--ink);
  }
  .tag {
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    background-color: var(--tint);
    color: #0c0a09;
  }
  .note {
    font-size: 13px;
  }
  .btn {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    user-select: none;
    background-color: var(--raised);
  }
  .swatches {
    display: flex;
    flex-direction: row;
    gap: 8px;
  }
  .swatch {
    width: 20px;
    height: 20px;
    border-radius: 10px;
    cursor: pointer;
    background-color: var(--tint);
  }
</style>
```

- A `class:` directive, a `style:--tint={value}` that changes and an `@media` block around the
  rule all restyle the elements inside that read the variable, and only those.
- A variable that reads another (`--edge: var(--tint)`) is worked out on the element that declares
  it. An element further in that declares its own `--tint` does not change what `--edge` is there,
  in a window or in a browser.
- Keep an app's palette in `:root` and `set_css_vars()` all the same. In the DOM build the layer
  of a `Tooltip`, a `Popover` or a `Portal` hangs off `<body>`, outside the element that declared
  the variable, so only those two reach it there. In a window the layer reads the variables of the
  place it was written in.

### Style props

Svelte's [style props](https://svelte.dev/docs/svelte/custom-properties) hand variables to a
component from outside, without a prop for each. A component reads its colours from variables:

```svelte
<!-- Tag.svelte -->
<script>
  let { children } = $props();
</script>

<div class="tag">{@render children()}</div>

<style>
  .tag {
    padding: 2px 10px;
    border-radius: 999px;
    background-color: var(--tint, #a8a29e);
    color: var(--tint-ink, #0c0a09);
  }
</style>
```

And whoever uses it sets them per instance:

```svelte
<script>
  import Tag from './Tag.svelte';

  let { failed } = $props();
</script>

<Tag>queued</Tag>
<Tag --tint="#4ade80">passed</Tag>
<Tag --tint={failed ? '#f87171' : '#a8a29e'} --tint-ink="#ffffff">checks</Tag>
```

The variables reach everything the component renders: its own elements, the components inside
it and the markup you pass it as children. A value can be any expression and restyles the
component as it changes, and `null` or `''` takes the variable away again. A style prop outranks
a declaration on an element around the component, and loses to one on an element inside it.

In a browser Svelte holds them on a `<svelte-css-wrapper style="display: contents">` element
around the component. A window gets no element for that wrapper at all, so a style prop never
changes layout: the component's elements stay the flex items, or the rows of a `<virtual-list>`,
that they are without one.

The shipped components take them like any other: `<Scroller --scroller-thumb="#fb923c">` colours
one scroller's thumb. A `Tooltip`'s or a `Popover`'s layer is the exception in the DOM build, for
the reason above, so give one of those its variables through `style`
(`style="--tooltip-surface: #fb923c"`), which both renderers put on the layer itself.

## Media queries

Nothing native evaluates CSS, so `@media` is answered by gpuix-svelte from the window's size. A
block applies while its query holds, nests like any other at-rule (inner blocks need every query on
the way down), and keeps its place in the source order, so a rule under `@media` wins over an
equal rule written before it and loses to one written after it, as in a browser:

```svelte
<style>
  .cards { display: flex; flex-direction: row; gap: 16px; }
  @media (max-width: 700px) {
    .cards { flex-direction: column; gap: 8px; }
  }
  @media (min-width: 1200px) and (orientation: landscape) {
    .cards { gap: 24px; }
  }
</style>
```

What a query may say:

- `width` and `height`, as `min-width: 600px`, `max-width: 599px`, `width: 600px`, or the range
  syntax (`width >= 600px`, `600px <= width < 900px`), in `px`, `rem` or `em` (both 16 px) or a
  unitless `0`.
- `orientation: portrait | landscape` (a square window is portrait).
- `and` between features, a comma between alternatives, `not` or `only` in front, and the media
  types `screen` and `all`; `print` and the other types never match.

Anything else (`prefers-color-scheme`, `hover`, `pointer`, a `vw` length, `or`) has no answer in a
window. As in a browser, such an alternative in a comma list never matches while the others still
count; a block none of whose alternatives can be answered is refused with a warning. In the DOM
build the same block is CSS the browser evaluates. A query no size can change is settled when the
component compiles: `@media screen` applies as if it were not there, `@media print` drops its
rules. The window is read through the one poll `window_size` uses, every 100 ms while any element
depends on a query, and the dependent elements are restyled only when a query's answer changes.
`media_query('(max-width: 700px)')` in the [Guide](guide.md#media-queries) answers the same
question from JavaScript.

## Seeing it for yourself

The repository's [styling playground](../examples/styling-playground) renders each style string
next to what GPUI made of it, in three groups: reads like CSS, looks like CSS but is not, and
GPUI-only. It is one ordinary component,
[`StylingPlayground.svelte`](../examples/styling-playground/StylingPlayground.svelte), so copy it
into a project made with `npm create gpuix-svelte` and point `app.ts` at it, or run
`npm run demo:styling` in a clone of the repository.
