# gpuix-svelte starter

The smallest project that consumes `gpuix-svelte` from npm: a counter in a native GPUI window.
`npm create gpuix-svelte@latest` copies it into a new directory; then:

```bash
npm install          # gpuix-svelte brings its own Svelte build
npm start            # opens the window; edit App.svelte and save to hot-reload
npm test             # headless: mounts App.svelte, clicks through GPUI's real hit testing
npm run typecheck    # tsc --noEmit, then svelte-check over App.svelte against GPUI's element types
npm run build        # dist/app (dist/app.exe on Windows), one executable for this platform; needs Bun
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
- `App.svelte` — the component. Styling is a `<style>` block of class rules; see
  [docs/styling.md](https://github.com/khromov/gpuix-svelte/blob/main/docs/styling.md) for what
  CSS reaches GPUI.
- `standalone.ts` and `build.ts` — `npm run build` compiles `standalone.ts` into one executable
  with Bun. It is built for the machine it runs on, so build on macOS, Windows and Linux in turn
  (a CI matrix, say) to ship all three.
- `test.ts` — a headless test through `gpuix-svelte/test`; plain script, exits 1 on failure.
  Runs on macOS and Windows, where the headless renderer is built.
- `svelte.d.ts` — declares `*.svelte` modules for `tsc`.
- `tsconfig.json` — `nodenext`, and a `paths` entry so `tsc` finds the Svelte that is nested
  inside the package.
  `svelteOptions.namespace` and the `gpuix-svelte/html` type entry make the editor and
  svelte-check type `App.svelte`'s markup as GPUI elements rather than DOM ones.
- `AGENTS.md` — instructions for coding agents, pointing at the docs' `llms.txt`; `CLAUDE.md`
  imports it for Claude Code.
- `svelte.config.js` — editor and svelte-check only: switches off Svelte's DOM a11y advice.

Needs Node >= 24 or Bun >= 1.4.
