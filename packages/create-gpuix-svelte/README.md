# create-gpuix-svelte

Scaffolds a [gpuix-svelte](https://github.com/khromov/gpuix-svelte) app: Svelte components
rendered into a native, GPU-accelerated desktop window through GPUI.

```bash
npm create gpuix-svelte@latest my-app
cd my-app
npm install
npm start
```

Bun works too: `bun create gpuix-svelte my-app`. Needs Node >= 24 or Bun >= 1.4, on macOS
(arm64), Windows (x64 or arm64) or Linux (x64).

It asks whether to add a GitHub Actions release workflow (release-please cuts versions, every
platform builds, and the app updates itself from the release's manifest) and for the repository
to point the app at. `--github owner/repo` answers both without asking, `--no-github` leaves the
workflow out:

```bash
npm create gpuix-svelte@latest my-app -- --github you/my-app
```
