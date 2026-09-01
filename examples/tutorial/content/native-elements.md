Beyond `div` and text, GPUI ships a handful of elements that would take a lot of JavaScript to rebuild. They are ordinary tags in your markup, and every attribute that is not `style` / `class` / `hover` / `active` is forwarded to the native side **verbatim** — name, case and value — so objects and booleans pass straight through.

- **`<input>` / `<textarea>`**: `value`, `placeholder`, `readOnly`, `minRows` / `maxRows`. Native editing with caret, selection and IME; `onchange` fires on every edit with the text in `event.value`, `onsubmit` on Enter. `bind:value` is a compile error under the custom renderer, so write `value={text} onchange={(e) => (text = e.value)}`.
- **`<code code language showLineNumbers theme>`**: tree-sitter highlighting for JS/TS, Rust, Python, Go, JSON, Bash, TOML, YAML, HTML, CSS, C and Markdown. It paints no surface of its own — style it — never wraps, and an unknown `language` is an error, which is why the `.svelte` sources here use `html`.
- **`<markdown source theme>`**: GitHub-flavoured markdown with tables and task lists; `onlinkclick` hands you `event.value`. Every explanation in this tutorial is one.
- **`<img src objectFit>`**: a filesystem path or a `data:` URL — not `http(s)`.
- **`<svg source>`** (or `src`): a monochrome icon tinted by the element's `color`.
- **`<virtual-list>`**: builds rows only near its viewport; needs a bounded height, and since it scrolls nothing above it may.
- **`<diff patch wordDiff>`**: a unified git patch with per-file collapsing.

`div` and text, in contrast, keep only four props: `autoFocus`, `tabIndex`, `testId` and `motion`. Everything else is dropped.
