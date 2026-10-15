Beyond `div` and text, GPUI ships a handful of elements that would take a lot of JavaScript to rebuild. They are ordinary tags in your markup, and every attribute that is not `style` / `class` / `hover` / `active` is forwarded to the native side **verbatim** — name, case and value — so objects and booleans pass straight through.

- **`<input>` / `<textarea>`**: `value`, `placeholder`, `readOnly`, `minRows` / `maxRows`. Native editing with caret, selection and IME; `onchange` fires on every edit with the text in `event.value`, `onsubmit` on Enter (a `<textarea>` without `onsubmit` takes Enter as a newline). `bind:value` is a compile error under the custom renderer, so write `value={text} onchange={(e) => (text = e.value)}`.
- **`<code code language showLineNumbers theme>`**: syntax highlighting for JS/TS (JSX and TSX too), Rust, Python, Go, JSON, Bash, TOML, YAML, HTML, CSS, C and Markdown. It paints no surface of its own — style it — and never wraps. A `language` it does not know renders as plain text, and there is no Svelte grammar, which is why the `.svelte` sources here use `html`.
- **`<markdown source theme>`**: GitHub-flavoured markdown with tables and task lists; `onlinkclick` hands you `event.value`. Every explanation in this tutorial is one.
- **`<img src objectFit>`**: a filesystem path, a `data:` URL, or an `http(s)` URL GPUI fetches in the background — give it a width and a height so nothing jumps when it lands.
- **`<svg source>`** (or `src`): a monochrome icon tinted by the element's `color`.
- **`<virtual-list>`**: builds rows only near its viewport; needs a bounded height, and since it scrolls nothing above it may.
- **`<diff patch wordDiff>`**: a unified git patch with per-file collapsing.
- **`<anchored side align gap>`**: hangs its child off its parent's box and paints it above everything else, kept inside the window. Give the element itself a background, even `#00000001`, or GPUI paints an opaque `#1a1a1a` behind it. The shipped `Tooltip` and `Popover` components are built on it.

`div` and text, in contrast, keep only `autoFocus`, `tabIndex`, `testId`, `motion`, `highlight`, `role` and the `aria-label` / `-description` / `-id` / `-expanded` / `-selected` / `-valuetext` / `-level` props. Everything else is dropped.
