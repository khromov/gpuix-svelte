gpuix-svelte is a **custom renderer** for Svelte. Your components compile exactly as they would for the browser, but instead of creating DOM nodes they build a tree that [GPUI](https://www.gpui.rs/) — the GPU-accelerated UI framework behind the Zed editor — lays out and paints in a real desktop window. There is no DOM, no webview and no browser anywhere in the process.

The pieces, left to right in the diagram below:

- **Svelte's compiler** runs with the unreleased `customRenderer` option, so every component imports `gpuix-svelte/renderer` instead of touching `document`.
- **`renderer.ts`** keeps a JavaScript *shadow tree* shaped the way Svelte expects (comments, fragments, sibling walking) and projects it onto GPUI's flat, id-based tree.
- **`@gpuix/native`** is a prebuilt Rust addon. Each frame's changes ship as one `applyBatch(json)` call.
- **GPUI** does the layout (flexbox, in logical pixels) and paints with Metal on macOS, DirectX on Windows and Vulkan on Linux.

The window you are looking at is exactly this: `examples/tutorial/Tutorial.svelte` rendered through that pipeline. The explanation you are reading is a native `<markdown>` element, the code on the right is a native `<code>` element, and from step 3 on every sample also runs live underneath its source.

Use **Next** or the **→** key to move on. Each step ends with a quiz; your score collects in the footer.
