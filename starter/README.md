# gpuix-svelte starter

The smallest project that consumes `gpuix-svelte` from npm: a counter in a native GPUI window.
Copy this directory anywhere and:

```bash
npm install          # gpuix-svelte brings its own Svelte build — do not add svelte yourself
npm start            # opens the window; edit App.svelte and save to hot-reload
npm test             # headless: mounts App.svelte, clicks through GPUI's real hit testing
npm run typecheck    # tsc --noEmit against the package's TypeScript sources
```

Every script runs through the `gpuix-svelte` bin, which starts Node (or Bun, under
`bun run start` / `gpuix-svelte --bun app.ts`) with the module conditions Svelte's custom
renderer needs and the `.svelte` loader installed. Spelled out:

```bash
node --conditions custom-renderer --conditions development --import tsx --import gpuix-svelte/register app.ts
bun  --conditions custom-renderer --conditions development --preload gpuix-svelte/plugin app.ts
```

`bunfig.toml` carries the same preload for ad-hoc `bun file.ts` runs.

## Files

- `app.ts` — the entry: `render_hot` opens the window and remounts `App.svelte` on every save.
- `App.svelte` — the component. Styling is a `<style>` block of class rules; see the package
  README for what CSS reaches GPUI.
- `test.ts` — a headless test through `gpuix-svelte/test`; plain script, exits 1 on failure.
  macOS and Windows only — the headless renderer is not built for Linux.
- `svelte.d.ts` — declares `*.svelte` modules for `tsc`.
- `tsconfig.json` — `allowImportingTsExtensions` and `nodenext`, because the package ships
  `.ts` sources, and a `paths` entry so `tsc` finds the Svelte that is nested inside the package.

Needs Node >= 24 or Bun >= 1.4.
