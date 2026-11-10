# Accessibility

GPUI builds an accessibility tree from the elements gpuix-svelte gives it, and that tree is what a
screen reader such as VoiceOver reads. This page covers what reaches it, what GPUI has no way to
express yet and what to do instead, and the keyboard patterns that make custom controls usable
without a pointer. [Testing](testing.md#accessibility) shows how to assert on the tree.

## What reaches a screen reader

- Text is a label wherever it sits, so a `role="button"` div is named by the text inside it. The
  exception is text beside other text: when an `{#if}`, an `{#each}` or a component splits a
  sentence into several text nodes, they stay unlabelled, because a label would break what GPUI
  selects, copies and searches as one run. A `<text>` element around the sentence labels it whole.
- `input` and `textarea` are text fields, and `img` is an image labelled by its `alt`.
- `button` is a button, named by the text inside it.
- Any other element shows up only with a `role`. The ARIA role names work: `button`, `heading`,
  `switch`, `checkbox`, `radio`, `link`, `listbox` and `option`, `menu` and `menuitem`, `dialog`,
  `tablist` and `tab`, `slider`, `progressbar`, `status`, `alert`, `region`, `group` and the rest.
  `none` and `presentation` keep the element out of the tree, and a name GPUI doesn't know does
  the same.
- These attributes go with the role: `aria-label`, `aria-description`, `aria-valuetext`,
  `aria-expanded`, `aria-selected`, `aria-level` and `aria-id`. Written as strings, they arrive
  as the type GPUI reads, so `aria-expanded="true"` is a boolean and `aria-level="2"` a number.

```svelte
<div role="heading" aria-level="2">Settings</div>
<div role="button" tabindex="0" aria-expanded={open} onclick={toggle}>Advanced</div>
```

## What GPUI doesn't have yet

Every other `aria-*` attribute is dropped. Each row is something a browser has and the closest a
GPUI window gets:

| In a browser | In a GPUI window |
| --- | --- |
| `aria-checked`, `aria-pressed` | `aria-valuetext="on"` or `"off"`, which a switch or checkbox reports as its value, though still with no checked state |
| `aria-disabled` | Nothing announces it. `tabindex="-1"` at least takes the control out of the Tab order |
| `aria-hidden` | `role="none"` keeps one element out of the tree, but its text stays in |
| `aria-labelledby`, `aria-describedby`, `aria-controls` | The words themselves, in `aria-label` or `aria-description` |
| `aria-live`, and `role="status"` or `alert` announcing a change | The role is in the tree, but GPUI sets no live region, so don't count on a change being announced |
| `aria-modal`, `inert` | Keep Tab inside the dialog yourself (below) |
| `aria-haspopup` | `aria-expanded` on the button that opens the menu |
| `aria-keyshortcuts` | `aria-description="Shortcut: T"` |
| `aria-valuenow`, `aria-valuemin`, `aria-valuemax` | `aria-valuetext` with the value written out |

## Keyboard and focus

[Keyboard shortcuts and focus](guide.md#keyboard-shortcuts-and-focus) covers Tab, the focus
helpers and `:focus-visible`. Write a button as `<button onclick={save}>Save</button>`: it is a
`div` with nothing drawn for it, plus what a browser's button has for free. It has the `button`
role, it is a tab stop, and Enter and Space call `onclick` (once per press, and not when an
`onkeydown` of yours called `preventDefault()`). `disabled` takes the tab stop away and keeps
clicks and keys from `onclick`. A `role` or `tabindex` of your own wins. It still needs a
`:focus-visible` rule so the keyboard can see where it is. In a browser the same tag is a real
button, and `render()` takes the browser's own border, padding, background and font off it with a
`:where(button)` rule, which any rule of yours outranks; a page that mounts the component some
other way (SvelteKit, say) needs that reset in its own CSS.

A control built from a `div` needs those three things by hand: `role`, `tabindex="0"`, and Enter
and Space doing what a click does (GPUI calls them `enter` and `space`).

A menu or a dialog takes focus when it opens and gives it back when it closes. `autofocus` on the
first control focuses it as it mounts. Note what had focus before opening, and focus that again
after closing:

```svelte
<script>
  import { focus_element, focused_element, focus_next_within, focus_previous_within } from 'gpuix-svelte';

  let open = $state(false);
  let opener = null;
  let dialog = null;

  function show() {
    opener = focused_element();
    open = true;
  }

  function hide() {
    open = false;
    focus_element(opener);
  }

  // There is no aria-modal, so Tab cycles inside the dialog instead of reaching the page behind it.
  function trap(e) {
    if (e.key !== 'tab') return;
    e.preventDefault();
    if (e.modifiers.shift) focus_previous_within(dialog);
    else focus_next_within(dialog);
  }
</script>

{#if open}
  <Portal>
    <div role="dialog" aria-label="Rename" onkeydown={trap} {@attach (node) => (dialog = node)}>
      <input autofocus />
      <div role="button" tabindex="0" onclick={hide}>Done</div>
    </div>
  </Portal>
{/if}
```

The dialog needs no `tabindex`: a key pressed in the field reaches every ancestor listening for it.
A long list reads best as one tab stop: `tabindex="0"` on the selected row and `-1` on the rest,
with the arrow keys calling `focus_element()` and `scroll_into_view()` on the next row. A `Tooltip`
opens on keyboard focus when its trigger spreads the snippet's focus handlers
([Tooltip](components.md#tooltip)).

## Components shared with the DOM

The browser has the attributes in the table above, and GPUI's markup types reject them, so a
component that runs on both renderers branches on `IS_GPUIX`:

```svelte
<script>
  import { IS_GPUIX } from 'gpuix-svelte';
  let { on } = $props();
  const state = $derived(IS_GPUIX ? { 'aria-valuetext': on ? 'on' : 'off' } : { 'aria-checked': on });
</script>

<div role="switch" tabindex="0" {...state}>Wi-Fi</div>
```

`autofocus` differs too. GPUI focuses the element as it mounts, while Svelte in a browser moves
focus only when nothing else has it, and the button that opened a menu always does. So in the
browser a menu or dialog also focuses its first control from an attachment, once its layer is in
the document: `queueMicrotask(() => focus_element(node))`. The
[shared components demo](https://github.com/khromov/gpuix-svelte-sveltekit-shared-components-demo)
does all of this in `src/lib/gpui.ts`, and tests it on both renderers.
