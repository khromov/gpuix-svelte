# Working on gpuix-svelte

Everything here is about the repository itself — the demos, the tests and the release. To build an
app with the package, start from the [README](../README.md) instead. The design of the renderer,
and the constraints any change has to respect, are written down in [CLAUDE.md](../CLAUDE.md).

## Setup

Needs Node >= 24 (26.1 for `demo:glass-ffi`) or Bun >= 1.4, on macOS (arm64), Windows (x64) or
Linux (x64). No Rust or other toolchain: `@gpuix/native` comes prebuilt from npm, and Svelte comes
from `vendor/svelte-<version>-<sha>.tgz`, a build of the unreleased custom-renderer PR.

```bash
git clone https://github.com/khromov/gpuix-svelte
cd gpuix-svelte
npm install
```

## Demos and tests

```bash
git clone https://github.com/khromov/gpuix-svelte
cd gpuix-svelte
npm install
npm run demo              # all four demos at once
npm run demo:counter      # counter — edit examples/counter/Counter.svelte and save to hot-reload
npm run demo:tictactoe    # tic-tac-toe with score tracking
npm run demo:hn           # Hacker News reader (live data, scrollable list)
npm run demo:glass        # liquid-glass control center (GPUI's blurred translucent window)
npm run demo:glass-ffi    # same app on REAL Liquid Glass — NSGlassEffectView via FFI
                          # (macOS 26+; falls back to the window blur elsewhere)
npm run demo:styling      # styling playground — which CSS text reaches GPUI and which is dropped
npm run demo:desktop      # desktop APIs — window controls, file picker and drops, live image
                          # pixels, selection, focus walking, accessibility props
npm run demo:web          # tic-tac-toe in a browser, on GPUI's WebAssembly/WebGPU build (Bun only)
npm run tutorial          # interactive onboarding guide — 12 steps with live samples and quizzes
npm run brain             # Substrate, a "second brain": notes, links, images and voice memos,
                          # searched by meaning, keyword and image content with on-device models,
                          # plus an OpenAI-compatible chat over it all. Bun only; run
                          # `npm run brain:install` first — see examples/second-brain/README.md
npm run brain:compile     # Substrate as dist/Substrate.app (macOS), models and all
npm test                  # headless renderer tests
```

New here? `npm run tutorial` (or `bun run tutorial`) opens a guided walkthrough of the renderer that
is itself a gpuix-svelte app: each step pairs an explanation and a diagram with the source of a
small component and that component running live, and ends with a quiz.

Every command has a [Bun](https://bun.com) twin under a `bun:` prefix — `npm run bun:test`,
`npm run bun:demo`, `npm run bun:demo:counter`, and so on. They run the same entry points through
Bun, which gets the `.svelte` loader as a `--preload` instead of an `--import`. Dependencies
still come from `npm install` either way; there is one lockfile, and CI runs both runtimes.

The one exception is Substrate (`npm run brain`), which is built on Bun's own APIs — `bun:sqlite`,
`Bun.spawn` IPC, `Bun.Image`, `HTMLRewriter`, `bun:ffi` — and shows what a complete application
on this renderer looks like: a hand-rolled router, `.svelte.ts` state modules that survive hot
reloads, light and dark themes as one `set_css_vars()` palette, the package's `Scroller` and
`Portal`, a background worker process for transformers.js, and OS integrations for everything GPUI
has no API for.

A demo that starts cleanly prints

```
[gpuix-svelte] created native window
[gpuix-svelte] mount complete
```

and `GPUIX_SCREENSHOT=/tmp/x.png npm run demo:counter` writes a PNG on every (re)mount — use a
single demo, since they would all overwrite the same file.

Linux runs the demos but not the tests: gpuix builds `TestGpuixRenderer` only on macOS and Windows
(it needs `render_to_image`, which the Vulkan/wgpu backend lacks), so CI on Linux only checks that
the binding loads.

`npm run test:coverage` mounts Svelte's own custom-renderer samples when `SVELTE_SAMPLES_DIR`
points at a svelte checkout's `packages/svelte/tests/custom-renderers/samples`; it skips otherwise.

## Moving the Svelte build

`npm run vendor` looks up the custom-renderer PR's head commit, downloads that commit's build from
pkg.svelte.dev into `vendor/`, repoints `package.json` and reinstalls. Run `npm test` and
`npm run bun:test` afterwards — the PR changes without notice, which is why each release of the
package ships exactly the build it was tested against.

## The consumer path

`npm run consume` packs the tarball the way a release would, scaffolds an app with
`packages/create-gpuix-svelte` (whose template is [`starter/`](../starter)), installs the tarball
into it, typechecks it and runs its headless test through the installed bin. `npm run bun:consume`
does the same with Bun, and `consume:open` opens the window instead. CI runs both.

## Releasing

PR titles must be [conventional commits](https://www.conventionalcommits.org) (`feat:`, `fix:`,
`docs:`, `chore:` …), since squash merges make the title the commit. release-please keeps a release
PR open on `main`; merging it tags the release, runs the tests and the consumer path on macOS, and
publishes `gpuix-svelte` and `create-gpuix-svelte` to npm with trusted publishing (OIDC, no token).
`npm run pack -- <dir>` builds the same tarball locally.
