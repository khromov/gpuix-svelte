`render_hot(entry, options)` is what every example calls. It mounts the component, then watches the entry's directory (recursively) and, on any `.svelte` write, re-imports the entry with a `?v=N` cache-buster and remounts onto the **same** window.

- The cache-buster is spliced into every child `.svelte` import the compiled output contains — static, side-effect and dynamic `import()` alike — or the root would be re-created against stale children.
- Plain `.ts` modules are not busted: `steps.ts` and `theme.ts` in this tutorial need a restart, while the samples reload live.
- Never `bun --hot`: it re-evaluates Svelte's runtime, so the old component belongs to a module instance the new one cannot see and `unmount()` fails. `render_hot` keeps one runtime for the life of the process.
- Native ids are monotonic across remounts, so a stale tree can never collide with the new one.

**Exercise:** open `examples/tutorial/samples/Hello.svelte`, change the greeting, save — and watch the preview on the right. You stay on this step because the tutorial keeps its index in a `globalThis` slot, exactly as `render.ts` keeps the window in one.

Two more tools for the loop: `GPUIX_SCREENSHOT=/tmp/x.png npm run tutorial` writes a PNG after every (re)mount — a window cannot be inspected from a terminal, but a PNG can — and the terminal prints `[gpuix-svelte] remount complete` on each reload.
