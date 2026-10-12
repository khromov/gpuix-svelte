# Working on gpuix-svelte

Everything here is about the repository itself — the demos, the tests and the release. To build an
app with the package, start from the [README](../README.md) instead. The design of the renderer,
and the constraints any change has to respect, are written down in [CLAUDE.md](../CLAUDE.md).

## Setup

Needs Node >= 24 (26.1 for `demo:glass-ffi`) or Bun >= 1.4, on macOS (arm64), Windows (x64) or
Linux (x64). Dependencies install with [Bun](https://bun.com), whose `bun.lock` is the lockfile;
`bun install` is the whole setup. `@gpuix/native` comes prebuilt from npm, and Svelte comes from
`vendor/svelte-<version>-<sha>.tgz`, a build of the unreleased custom-renderer PR. Scripts run
through `npm run` on either runtime.

```bash
git clone https://github.com/khromov/gpuix-svelte
cd gpuix-svelte
bun install
```

## Demos and tests

```bash
git clone https://github.com/khromov/gpuix-svelte
cd gpuix-svelte
bun install
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
npm test                  # headless renderer tests
```

New here? `npm run tutorial` (or `bun run tutorial`) opens a guided walkthrough of the renderer that
is itself a gpuix-svelte app: each step pairs an explanation and a diagram with the source of a
small component and that component running live, and ends with a quiz.

Every command has a [Bun](https://bun.com) twin under a `bun:` prefix — `npm run bun:test`,
`npm run bun:demo`, `npm run bun:demo:counter`, and so on. They run the same entry points through
Bun, which gets the `.svelte` loader as a `--preload` instead of an `--import`. Dependencies come
from `bun install` either way, and CI runs both runtimes.

Substrate, the "second brain" app that used to live in `examples/second-brain`, moved to its own
repository on 2026-10-12, where it consumes the published package like any other app.

A demo that starts cleanly prints

```
[gpuix-svelte] created native window
[gpuix-svelte] mount complete
```

and `GPUIX_SCREENSHOT=/tmp/x.png npm run demo:counter` writes a PNG on every (re)mount — use a
single demo, since they would all overwrite the same file.

The demos run on all three platforms. The tests run on macOS and Windows, where gpuix builds
`TestGpuixRenderer`; CI on Linux checks that the binding loads.

`npm run test:coverage` mounts Svelte's own custom-renderer samples when `SVELTE_SAMPLES_DIR`
points at a svelte checkout's `packages/svelte/tests/custom-renderers/samples`; it skips otherwise.

## Moving the Svelte build

`npm run vendor` looks up the custom-renderer PR's head commit, downloads that commit's build from
pkg.svelte.dev into `vendor/`, repoints `package.json` and reinstalls. Run `npm test` and
`npm run bun:test` afterwards — the PR moves on its own schedule, which is why each release of the
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
publishes `gpuix-svelte` and `create-gpuix-svelte` to npm with npm trusted publishing (OIDC, with provenance).
`npm run pack -- <dir>` builds the same tarball locally.

## Docs site

`npm run docs` renders the README and `docs/*.md` to static HTML in `dist/docs`; the `docs`
workflow publishes it to GitHub Pages on every push to `main` that touches them. A new page goes in
`PAGES` in [`scripts/docs.ts`](../scripts/docs.ts).
