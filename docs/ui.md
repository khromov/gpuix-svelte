# UI toolkit

> [!NOTE]
> **Not released yet.** `gpuix-svelte-ui` ships alongside the next gpuix-svelte release (0.6.0),
> which is the first with the [DOM build](dom.md) it needs.

`gpuix-svelte-ui` is a set of components written once for both renderers: a native window through
gpuix-svelte, and a browser DOM through Vite or SvelteKit. Buttons, fields, choices, menus, dialogs,
toasts, a few layout and feedback pieces, a router for the screens of an app, and the theme behind
them. Every component on this page
runs live, in the DOM; `npm run demo:ui` in the repository opens the same showcase in a GPUI window,
and `npm run demo:ui-dom` serves it as a page.

## Setup

```sh
npm install gpuix-svelte gpuix-svelte-ui
```

```svelte
<script>
  import { Button, Card, apply_theme } from 'gpuix-svelte-ui';

  $effect(() => apply_theme('dark'));
</script>

<Card title="Hello">
  <Button variant="primary" onclick={() => console.log('clicked')}>Click me</Button>
</Card>
```

Every component reads its colours from `--ui-*` tokens, and `apply_theme()` puts a palette in force
on either renderer: through `set_css_vars` on GPUI, as custom properties on `:root` in a browser.
Call it from an `$effect` at the root, before anything paints, so no token is missing on the first
frame. The components themselves resolve through the package's own exports, so
`gpuix-svelte-ui/components/Button.svelte` is the same file as `Button` from the barrel.

In a GPUI app nothing else is needed. A page wants a stylesheet with what a window gives for
free: `* { box-sizing: border-box }`, a font, and `body { margin: 0 }` (`render()` sets the last
one; see [`packages/ui/showcase/index.html`](../packages/ui/showcase/index.html)). A prerendered SvelteKit
page can carry the palette before any effect runs:

```svelte
<svelte:head>
  {@html `<style>${theme_rule(DARK)}</style>`}
</svelte:head>
```

The components are typed as GPUI markup, so an app that ships to both targets typechecks them
with the GPUI project's `tsconfig`, as [DOM](dom.md#writing-a-component-for-both) explains;
`svelte-check` on a SvelteKit side types them as DOM markup, which they pass too.

## Theme

`apply_theme(palette)` takes `'dark'`, `'light'` or a `Palette` of your own. `DARK` and `LIGHT`
are the two it ships, and `theme.palette` is the one in force, reactive, for the odd place that
needs a value in JavaScript (`TextField` hands GPUI's input a theme object rather than CSS).

| Token | What it colours |
| --- | --- |
| `bg`, `panel`, `raised`, `raised-hover` | the window, cards and dialogs, badges and hovered rows |
| `border`, `border-strong` | hairlines and control outlines |
| `ink`, `muted` | text |
| `accent`, `accent-ink`, `accent-wash`, `on-accent` | the brand colour, its legible text, a translucent wash, text on it |
| `success`, `warning`, `danger`, each with a `-wash` | tones for badges, toasts and progress |

Each is a `--ui-<token>` custom property, so your own markup can read `var(--ui-accent)` next to
the components, and `theme_vars(palette)` is the full map should you want to set them yourself.
The same call sets the tokens gpuix-svelte's own `Tooltip`, `Popover` and `Scroller` read.

The button below switches the palette, and since the tokens are global, every sample on this
page follows it.

```svelte demo theme
<script>
  import { Button, Badge, apply_theme, theme } from 'gpuix-svelte-ui';

  let dark = $state(true);
  $effect(() => apply_theme(dark ? 'dark' : 'light'));
</script>

<div class="row">
  <Button onclick={() => (dark = !dark)}>{dark ? 'Light' : 'Dark'} theme</Button>
  <Badge tone="accent">{theme.palette.appearance}</Badge>
  <div class="note">accent is {theme.palette.accent}</div>
</div>

<style>
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .note { font-size: 13px; color: var(--ui-muted); }
</style>
```

## Buttons, badges and keys

`Button` is a focusable box: Enter and Space press it, `variant` is `default`, `primary`, `ghost`
or `danger`, `size` is `md` or `sm`, and `disabled` takes it out of the tab order. `label` names a
button whose content is an icon. It spreads `onmouseenter` / `onmouseleave`, which is what lets a
`Tooltip` wrap it. `Badge` takes a `tone` (`neutral`, `accent`, `success`, `warning`, `danger`),
`Kbd` draws a key cap, and `Icon` draws one of the toolkit's glyphs (`check`, `close`,
`chevron-down`, `plus`, `search`, …) or any SVG markup through `source`.

```svelte demo buttons
<script>
  import { Button, Badge, Icon, Kbd, Tooltip } from 'gpuix-svelte-ui';

  let count = $state(0);
</script>

<div class="row">
  <Button>Default</Button>
  <Button variant="primary">Primary</Button>
  <Button variant="ghost">Ghost</Button>
  <Button variant="danger">Danger</Button>
  <Button disabled>Disabled</Button>
  <Button size="sm" label="Search"><Icon name="search" size={14} /></Button>
</div>
<div class="row">
  <Button size="sm" onclick={() => count--}>−</Button>
  <Badge tone="accent">{count}</Badge>
  <Button size="sm" onclick={() => count++}>+</Button>
  <Tooltip content="A tooltip on a button">
    {#snippet children(hover)}
      <Button {...hover} size="sm">Hover me</Button>
    {/snippet}
  </Tooltip>
  <Kbd>⌘K</Kbd>
</div>

<style>
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
</style>
```

## Cards, layout and feedback

`Card` holds a `title`, `description`, `actions` snippet at the right of the title, the body and a
`footer` snippet. `Stack` is a flex box with its spacing as props (`direction`, `gap`, `align`,
`justify`, `wrap`, `pad`), in the names both renderers know (`start` and `end`, not
`flex-start`). `Separator` is a hairline, with an optional `label`. `Progress` draws `value` out of
`max`; `Spinner`, `Skeleton` and `Avatar` are the small feedback pieces, and `Avatar` shows
initials from `name` until it has a `src`.

```svelte demo cards
<script>
  import { Avatar, Badge, Button, Card, Progress, Separator, Skeleton, Spinner, Stack } from 'gpuix-svelte-ui';

  let progress = $state(35);
</script>

<Card title="Export" description="Three files, about a minute.">
  {#snippet actions()}
    <Badge tone="success">running</Badge>
    <Spinner size={16} />
  {/snippet}
  <Progress value={progress} label="Progress" show_value />
  <Separator label="who" />
  <Stack direction="row" gap={10} align="center">
    <Avatar name="Ada Lovelace" />
    <Stack gap={6} grow={1}>
      <Skeleton width="55%" />
      <Skeleton width="85%" height={12} />
    </Stack>
  </Stack>
  {#snippet footer()}
    <Button size="sm" onclick={() => (progress = Math.min(100, progress + 20))}>Advance</Button>
  {/snippet}
</Card>
```

## Fields

`TextField` and `TextArea` wrap a real input: `value` in, `onchange(value)` on every edit, and
`onsubmit(value)` on Enter. `label`, `hint` and `error` go around the box, `error` also colouring
it. They are controlled, so keep `value` in your state. On GPUI the input is native and draws its
text from the palette `apply_theme` set; a `TextArea` grows from `rows` up to `max_rows` there,
and Enter inserts a newline unless `onsubmit` is set.

`Select` is a trigger and a list in a `Popover`: `options` are `{ value, label, disabled?,
description? }`, `value` is the chosen one or `null`, and arrows, Enter and Escape work on the
trigger.

```svelte demo fields
<script>
  import { Select, TextArea, TextField, toast } from 'gpuix-svelte-ui';

  let name = $state('');
  let notes = $state('');
  let fruit = $state(null);
  const FRUITS = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'cherry', label: 'Cherry', disabled: true },
    { value: 'durian', label: 'Durian', description: 'An acquired taste' }
  ];
</script>

<div class="column">
  <TextField value={name} onchange={(v) => (name = v)} onsubmit={(v) => toast(`Hello, ${v || 'stranger'}`)} label="Name" placeholder="Your name" hint="Enter shows a toast" error={name.length > 12 ? 'Keep it under 13 characters' : null} />
  <TextArea value={notes} onchange={(v) => (notes = v)} label="Notes" placeholder="A few lines" rows={2} />
  <Select options={FRUITS} value={fruit} onchange={(v) => (fruit = v)} label="Fruit" placeholder="Pick one" />
  <div class="note">{name ? `${name}, ` : ''}{fruit ? `picked ${fruit}` : 'nothing picked yet'}.</div>
</div>

<style>
  .column { display: flex; flex-direction: column; gap: 12px; max-width: 360px; }
  .note { font-size: 13px; color: var(--ui-muted); }
</style>
```

## Choices and ranges

`Toggle` and `Checkbox` take `checked` and `onchange(checked)`, with a `label` (and a
`description` under a checkbox). `RadioGroup` and `Tabs` take `options` / `items` of
`{ value, label, disabled? }` with `value` and `onchange(value)`; arrow keys move the selection
and skip a disabled entry, and only the selected tab is a tab stop. `Slider` takes `value`, `min`,
`max`, `step` and `onchange`: drag it, click the track, or use the arrows, Home and End; `format`
prints the readout beside its `label`.

```svelte demo choices
<script>
  import { Checkbox, RadioGroup, Slider, Tabs, Toggle } from 'gpuix-svelte-ui';

  let on = $state(true);
  let terms = $state(false);
  let plan = $state('pro');
  let tab = $state('overview');
  let volume = $state(40);
</script>

<div class="column">
  <Toggle checked={on} onchange={(v) => (on = v)} label="Notifications" />
  <Checkbox checked={terms} onchange={(v) => (terms = v)} label="Accept the terms" description="Required before you can continue." />
  <RadioGroup
    options={[
      { value: 'free', label: 'Free', description: 'For trying it out' },
      { value: 'pro', label: 'Pro', description: 'Everything, for one person' },
      { value: 'team', label: 'Team', disabled: true }
    ]}
    value={plan}
    onchange={(v) => (plan = v)}
    label="Plan"
  />
  <Tabs items={[{ value: 'overview', label: 'Overview' }, { value: 'activity', label: 'Activity' }, { value: 'billing', label: 'Billing', disabled: true }]} value={tab} onchange={(v) => (tab = v)} />
  <Slider value={volume} onchange={(v) => (volume = v)} label="Volume" format={(v) => `${v}%`} />
  <div class="note">{on ? 'Notified' : 'Quiet'}, {terms ? 'terms accepted' : 'terms pending'}, plan {plan}, tab {tab}, volume {volume}.</div>
</div>

<style>
  .column { display: flex; flex-direction: column; gap: 14px; max-width: 360px; }
  .note { font-size: 13px; color: var(--ui-muted); }
</style>
```

## Menus, dialogs and toasts

`Menu` is a `Popover` with `items`: `{ label, onselect, disabled?, danger?, shortcut? }`, or
`{ separator: true }`. You own `open`, the trigger toggles it, and an item that runs closes it, as
does a press outside or Escape. `position` opens it at a point instead of beside the trigger, for
a context menu.

`Dialog` paints a scrim and a panel in a `Portal`: `open`, `onclose`, `title`, `description`, the
body and an `actions` snippet; `size` is `sm`, `md` or `lg`. Escape, the close button and a click
on the scrim call `onclose`, unless `dismissable` is false.

`toast('Saved')` or `toast({ title, description, tone, duration, action })` queues a toast from
anywhere, and a `<Toaster>` rendered once, at any `position`, shows the queue. A toast goes by
itself after `duration` ms (4000 by default; `null` keeps it) or when dismissed, and
`dismiss_toast(id)` / `clear_toasts()` do that from code.

```svelte demo overlays
<script>
  import { Button, Dialog, Menu, Toaster, toast } from 'gpuix-svelte-ui';

  let menu = $state(false);
  let dialog = $state(false);
  let last = $state('nothing yet');
</script>

<div class="row">
  <Menu
    open={menu}
    onclose={() => (menu = false)}
    items={[
      { label: 'Rename', shortcut: '⌘R', onselect: () => (last = 'Rename') },
      { label: 'Duplicate', onselect: () => (last = 'Duplicate') },
      { separator: true },
      { label: 'Delete', danger: true, onselect: () => (last = 'Delete') }
    ]}
  >
    <Button onclick={() => (menu = !menu)}>Actions</Button>
  </Menu>
  <Button variant="primary" onclick={() => (dialog = true)}>Open dialog</Button>
  <Button onclick={() => toast({ title: 'Export finished', description: '12 files written.', tone: 'success', action: { label: 'Open', onclick: () => (last = 'Open') } })}>Toast</Button>
  <div class="note">Last: {last}</div>
</div>

<Dialog open={dialog} onclose={() => (dialog = false)} title="Delete this project?" description="This cannot be undone.">
  <div class="note">Escape, the close button, Cancel or a click outside closes it.</div>
  {#snippet actions()}
    <Button onclick={() => (dialog = false)}>Cancel</Button>
    <Button variant="danger" onclick={() => { dialog = false; last = 'Deleted'; toast({ title: 'Project deleted', tone: 'danger' }); }}>Delete</Button>
  {/snippet}
</Dialog>
<Toaster />

<style>
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .note { font-size: 13px; color: var(--ui-muted); }
</style>
```

## Screens and routing

`Router` switches between screens by path, with a history stack behind it. In a window the stack
is in memory, and a hot reload keeps the current screen; in a page the stack is the browser's, so
the address bar, back and forward and deep links work (`mode="history"`, the default, or
`mode="hash"` for a static host that cannot rewrite every URL to `index.html`; `mode="memory"`
leaves the URL alone). The table maps patterns to components, with `:param` segments and a `*`
fallback, and a screen receives `params` and `query` props; `screen(snippet)` puts a snippet in
the table instead, for an app small enough to keep its screens in one file. Every navigation
mounts the screen fresh, so state that should survive a round trip lives in a module or in the
hidden `state` a navigation can carry.

```svelte
<script>
  import { Router } from 'gpuix-svelte-ui';
  import Home from './Home.svelte';
  import Item from './Item.svelte';
  import NotFound from './NotFound.svelte';
</script>

<Router routes={{ '/': Home, '/items/:id': Item, '*': NotFound }} initial="/">
  {#snippet layout(content, route)}
    <Sidebar current={route.path} />
    {@render content()}
  {/snippet}
</Router>
```

- `<Link href="/items/3">` navigates on click. It is a real `<a>` in a page, so a modified click
  opens a new tab, and a focusable box in a window. Its content snippet gets `{ active }`, true
  on that screen and the ones below it (`exact` limits it to the path itself).
- `navigate(path, { replace, state })`, `back()` and `forward()` do the same from code;
  `router.path`, `router.params`, `router.query`, `router.state`, `router.can_go_back` and
  `router.can_go_forward` are reactive wherever they are read.
- `href('/items/:id', { id: 3 })` builds a path with its params typed from the pattern, plus an
  optional query object.
- `before((to, from) => …)` runs before every navigation, a Link, `navigate()`, the keyboard and
  the browser's buttons alike: `false` cancels it, a string redirects it. It returns the unsubscribe.
- ⌘[ and ⌘] (Alt+Left and Alt+Right elsewhere) go back and forward unless a text field has
  focus; `shortcuts={false}` turns that off.

One `Router` per app: the store behind it is global, which is what lets a `Link` anywhere, a
menu item or a keyboard shortcut navigate without a reference to the router.

```svelte demo router
<script>
  import { Badge, Button, Link, Router, back, forward, href, router, screen } from 'gpuix-svelte-ui';
</script>

{#snippet home()}
  <div class="note">Home. Pick a link, then use the buttons.</div>
{/snippet}
{#snippet items()}
  <div class="row">
    <div class="note">Items:</div>
    {#each [1, 2, 3] as id}
      <Link href={href('/items/:id', { id })}><Badge>#{id}</Badge></Link>
    {/each}
  </div>
{/snippet}
{#snippet item({ params })}
  <div class="note">Item {params.id}, with params typed from its pattern.</div>
{/snippet}
{#snippet lost()}
  <div class="note">Nothing at {router.path}.</div>
{/snippet}

<div class="row">
  <Link href="/">{#snippet children({ active })}<Badge tone={active ? 'accent' : 'neutral'}>Home</Badge>{/snippet}</Link>
  <Link href="/items">{#snippet children({ active })}<Badge tone={active ? 'accent' : 'neutral'}>Items</Badge>{/snippet}</Link>
  <Link href="/elsewhere">{#snippet children({ active })}<Badge tone={active ? 'accent' : 'neutral'}>Elsewhere</Badge>{/snippet}</Link>
  <Button size="sm" disabled={!router.can_go_back} onclick={back}>Back</Button>
  <Button size="sm" disabled={!router.can_go_forward} onclick={forward}>Forward</Button>
</div>
<div class="screen">
  <Router routes={{ '/': screen(home), '/items': screen(items), '/items/:id': screen(item), '*': screen(lost) }} mode="memory" shortcuts={false} />
</div>
<div class="note">router.href is {router.href}</div>

<style>
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .screen { display: flex; flex-direction: column; min-height: 40px; margin: 10px 0; padding: 10px 12px; border-radius: 8px; background: var(--ui-raised); }
  .note { font-size: 13px; color: var(--ui-muted); }
</style>
```

## Responsive layouts

Both renderers answer `@media` queries over the window's width and height
([Styling](styling.md#media-queries)), and `media_query()` answers the same from JavaScript
([Guide](guide.md#media-queries)). The toolkit adds named breakpoints: `BREAKPOINTS` is
`{ sm: 480, md: 768, lg: 1024, xl: 1280 }`, `min_width('md')` is `media_query('(min-width: 768px)')`
and `max_width('md')` is everything narrower. Resize the browser to see both halves of this
sample agree:

```svelte demo responsive
<script>
  import { Badge, Card, max_width } from 'gpuix-svelte-ui';

  const narrow = max_width('md');
</script>

<div class="cards">
  {#each ['One', 'Two', 'Three'] as title}
    <div class="cell"><Card {title}>A card that stacks under 768 px.</Card></div>
  {/each}
</div>
<div class="row">
  <Badge tone={narrow.current ? 'warning' : 'success'}>{narrow.current ? 'stacked' : 'side by side'}</Badge>
</div>

<style>
  .cards { display: flex; flex-direction: row; gap: 12px; }
  .cell { display: flex; flex-direction: column; flex-grow: 1; flex-basis: 0; }
  @media (max-width: 767px) {
    .cards { flex-direction: column; }
  }
  .row { display: flex; margin-top: 10px; }
</style>
```

## Writing your own

The helpers the components are built on are exported, so a component of your own can be
cross-target the same way (see [DOM](dom.md#writing-a-component-for-both) for the rules):

- `own_hitbox` spreads `hitbox="self"` on GPUI and nothing in the DOM, for a clickable box with
  painted children.
- `test_id(id)` spreads `testid` on GPUI and `data-testid` in the DOM, which is what every
  component's `testid` prop becomes.
- `aria_checked(checked)` spreads the state attribute each renderer's accessibility tree reads.
- `key_of(e)` spells a key event's key the GPUI way on both renderers (`enter`, `space`, `up`),
  and `activates(e)` says whether it presses a button.
- `bounds_of(node)`, `pointer_x(e)` and `still_pressed(e)` read a box, a pointer and a held
  button in one coordinate space, for drags; `focus_node(node)` focuses whatever an `{@attach}`
  handed over.
- `MONO` is a monospace family each side has (`var(--ui-mono)` in CSS).

Every component takes a `testid`, and the derived ids are documented on each prop
(`<testid>-input`, `<testid>-panel`, `<testid>-<value>`), so a headless test on GPUI
([Testing](testing.md)) and a DOM test find the same things: the repository's `test/ui.ts` and
`test/ui-dom.ts` click through the whole showcase that way.
