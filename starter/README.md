# gpuix-svelte starter

The smallest project that consumes `gpuix-svelte` from npm: a counter in a native GPUI window.
`npm create gpuix-svelte@latest` copies it into a new directory; then:

```bash
npm install          # gpuix-svelte brings its own Svelte build
npm start            # opens the window; edit App.svelte and save to hot-reload
npm test             # headless: mounts App.svelte, clicks through GPUI's real hit testing
npm run typecheck    # tsc --noEmit, then svelte-check over App.svelte against GPUI's element types
npm run build        # the app for this platform: a .app on macOS, an .exe on Windows, a binary on Linux; needs Bun
```

`npm start` and `npm test` run through the `gpuix-svelte` bin, which starts Node (or Bun, under
`bun run start` / `npx gpuix-svelte --bun app.ts`) with the module conditions Svelte's custom
renderer needs and the `.svelte` loader installed. Spelled out:

```bash
node --conditions custom-renderer --conditions development --import gpuix-svelte/register app.ts
bun  --conditions custom-renderer --conditions development --preload gpuix-svelte/plugin app.ts
```

## Files

- `app.ts` — the entry: `render_hot` opens the window and remounts `App.svelte` on every save.
- `App.svelte` — the component. Styling is a `<style>` block of class rules; see
  [docs/styling.md](https://github.com/khromov/gpuix-svelte/blob/main/docs/styling.md) for what
  CSS reaches GPUI.
- `standalone.ts` and `build.ts` — `npm run build` compiles `standalone.ts` into the platform's
  app with Bun: `dist/<name>.app` on macOS, `dist/<slug>.exe` on Windows, `dist/<slug>` on Linux
  (the slug is the name lowercased, with dashes). The name, identifier, version and icon are the
  `app` options `standalone.ts` hands `render()`; the icon is the gpuix-svelte one until `icon`
  names your own PNG. It is built for the machine it runs on, so build on macOS, Windows and Linux
  in turn to ship all three; the release workflow below does that. `bun build.ts --archive` also
  writes the archive to distribute and the fragment an update manifest is made from.
- `.github/workflows/release.yml`, `release-please-config.json`, `.release-please-manifest.json` —
  on GitHub, release-please keeps a release PR open from your conventional commits; merging it
  builds the app on every platform and uploads the archives and an `update.json`. Uncomment the
  `update` line in `standalone.ts` and the app checks that manifest through `check_for_update()`
  from `gpuix-svelte/update` (`App.svelte` shows the banner). See
  [docs/updating.md](https://github.com/khromov/gpuix-svelte/blob/main/docs/updating.md).
- `test.ts` — a headless test through `gpuix-svelte/test`; plain script, exits 1 on failure.
  Runs on macOS and Windows, where the headless renderer is built.
- `svelte.d.ts` — declares `*.svelte` modules for `tsc`.
- `tsconfig.json` — `nodenext`, and a `paths` entry so `tsc` finds the Svelte that is nested
  inside the package. `svelteOptions.namespace` and the `gpuix-svelte/html` type entry make the
  editor and svelte-check type `App.svelte`'s markup as GPUI elements rather than DOM ones.
- `AGENTS.md` — instructions for coding agents, pointing at the docs' `llms.txt`; `CLAUDE.md`
  imports it for Claude Code.
- `svelte.config.js` — editor and svelte-check only: switches off Svelte's DOM a11y advice.
- `bunfig.toml` — preloads the `.svelte` loader for Bun. A plain `bun file.ts` still needs the two
  `--conditions` flags above, so go through the bin.

Needs Node >= 24 or Bun >= 1.4.
