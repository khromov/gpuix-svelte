A component for GPUI looks like a component for the browser, with a smaller vocabulary. Only GPUI's tags exist — `div`, `text`, `img`, `svg`, `input`, `textarea`, `code`, `markdown`, `virtual-list` and a few more — and anything else (`span`, `p`, `button`, `h1`) is rendered as a `div` with a one-time warning in the console. Text goes straight inside a `div`.

Three habits to pick up on day one:

- **Always set `color`.** GPUI paints text black by default, which vanishes on a dark background. Text properties (`color`, `font-*`) inherit from parents; nothing else does.
- **The root fills the window.** The renderer mounts into a root styled `display: flex; width: 100%; height: 100%`, so your outermost `div` is a flex child of the window and usually repeats those two sizes.
- **`class` needs a `<style>` block.** There is no global stylesheet; a class only means something when the same component defines it (step 5).

The card on the right is `samples/Hello.svelte`, shown as source *and* running live below it. Every step from here on works that way, and the source is highlighted as HTML because GPUI's highlighter has no Svelte grammar.
