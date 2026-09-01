`{#each}`, keyed `{#each}` and `{#if}` compile to the same code as in the browser — and that code leans on DOM ideas GPUI does not have: comment nodes as anchors, document fragments, walking `nextSibling`. The renderer's job is to make that work over a tree that only knows elements and text.

It keeps a **shadow tree** in JavaScript. Every node Svelte creates lives there, but only some are *projected* into GPUI:

- **Elements and non-blank text** get a native id and a `createElement` mutation.
- **Comments, fragments and whitespace-only text** never do. They are ordering-only: an `{#if}` anchor or the newline between two tags must not take a slot in a flex row with a `gap`. The rule holds both ways — text that becomes `''` at runtime gives its id back.
- Ids are allocated **lazily**, when a node first becomes reachable from the root. Svelte renders offscreen constantly, and eager creation would leak a native node per abandoned render.
- `remove()` never destroys anything immediately. Svelte often removes and re-inserts the same node in consecutive statements, so detached nodes are reaped at `commit()` if they are still detached.

Keyed lists reorder with `insertBefore`; unkeyed ones update in place. Try **shuffle** on the right and watch each id stay with its row.
