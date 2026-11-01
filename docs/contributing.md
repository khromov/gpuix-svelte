# Working on gpuix-svelte

To build an app with the package, start from the [README](../README.md). The renderer's design,
and the constraints any change has to respect, are written down in [CLAUDE.md](../CLAUDE.md).

## Setup

You need both runtimes: Node 24 or later (`.nvmrc` pins 26, and `demo:glass-ffi` needs 26.1) and
Bun 1.4 or later, on macOS (arm64), Windows (x64 or arm64) or Linux (x64). Bun installs the
dependencies (`bun.lock` is the lockfile), and every script body runs on Node through `npm run`,
the `bun:` twins included. `@gpuix/native` comes prebuilt from npm, and Svelte comes from
`vendor/svelte-<version>-<sha>.tgz`, a build of the unreleased custom-renderer PR.

```bash
git clone https://github.com/khromov/gpuix-svelte
cd gpuix-svelte
nvm use
bun install
```

On Linux, install `libxcb1`, `libxkbcommon0` and `libxkbcommon-x11-0` first, and
`mesa-vulkan-drivers` plus `xvfb` on a machine without a display.

## Demos and tests

```bash
npm run demo              # four demos at once: counter, tic-tac-toe, Hacker News, liquid glass
npm run demo:counter      # counter; edit examples/counter/Counter.svelte and save to hot-reload
npm run demo:tictactoe    # tic-tac-toe with score tracking
npm run demo:hn           # Hacker News reader (live data, scrollable list)
npm run demo:glass        # liquid-glass control center (blurred on macOS, transparent elsewhere)
npm run demo:glass-ffi    # the same app on real Liquid Glass: NSGlassEffectView via FFI, macOS 26+
                          # (older macOS gets the window blur, other platforms plain transparency)
npm run demo:styling      # styling playground: which CSS text reaches GPUI and which is dropped
npm run demo:desktop      # desktop APIs: window controls, file picker and drops, live image
                          # pixels, selection, focus walking, accessibility props
npm run demo:native-0.11  # what @gpuix/native 0.11 added: focus-visible, focus dim, Tab,
                          # onlayout/onscrollchange, new styles, register_font, elements_at
npm run demo:web          # tic-tac-toe in a browser, on GPUI's WebAssembly/WebGPU build (Bun only)
npm run tutorial          # interactive onboarding guide: 12 steps with live samples and quizzes
npm run typecheck         # tsc, then svelte-check
npm test                  # typecheck, then every test suite except automation-live and coverage
npm run lint              # ESLint; not part of `npm test`, so run it before pushing
npm run check:svelte      # every component through the Svelte MCP server's autofixer (needs network)
npm run parity            # @gpuix/native methods nothing here calls; run it after a native bump
```

New here? `npm run tutorial` opens a guided walkthrough of the renderer that is itself a
gpuix-svelte app. Each step pairs an explanation and a diagram with the source of a small
component, most of them running live, and ends with a quiz.

Every test script, and every demo apart from the Bun-only `demo:web`, has a Bun twin under a
`bun:` prefix: `npm run bun:test`, `npm run bun:demo`, `npm run bun:demo:counter`, and so on. The
twins run the same entry points on Bun, which takes the `.svelte` loader as a `--preload`. CI runs
both runtimes.

A demo that starts cleanly prints

```
[gpuix-svelte] created native window
[gpuix-svelte] mount complete
```

and `GPUIX_SCREENSHOT=/tmp/x.png npm run demo:counter` writes a PNG after every mount and remount
on macOS and Windows (the Linux addon can't take screenshots, so it logs that instead). Use a
single demo for that, since several would all write to the same file.

The demos run on all three platforms. Most tests run only on macOS and Windows, where gpuix builds
the headless renderer, so on Linux `npm test` fails right after `typecheck`. The suites that need no
headless renderer (`test:bundle`, `test:compile`, `test:update`) run anywhere, and so do
`test:automation-live` (a real window; under Xvfb on CI), `consume` and `bun:consume` (which skip
the headless test on Linux). CI's Linux job runs those plus `typecheck` and `lint`.

`npm run test:coverage` mounts Svelte's own custom-renderer samples when `SVELTE_SAMPLES_DIR`
points at a svelte checkout's `packages/svelte/tests/custom-renderers/samples`. Without it, the
script skips.

The headless renderer and every window crash under Claude Code's Bash sandbox, so run tests and
demos with it disabled.

## Moving the Svelte build

`npm run vendor` looks up the custom-renderer PR's head commit, downloads that commit's build from
pkg.svelte.dev into `vendor/`, repoints `package.json` and reinstalls. Run `npm test` and
`npm run bun:test` afterwards. Each release of the package ships exactly the build it was tested
against.

## The consumer path

`npm run consume` packs the tarball the way a release would and scaffolds an app with
`packages/create-gpuix-svelte` (whose template is [`starter/`](../starter)). It then installs the
tarball into that app, typechecks it and runs its headless test through the installed bin (on
Linux it only typechecks). `npm run bun:consume` does the same with Bun and also builds the app's
standalone binary. `consume:open` and `bun:consume:open` start the app instead of testing it, so
you can look at its window. CI runs both passes.

## Releasing

PR titles must be [conventional commits](https://www.conventionalcommits.org) (`feat:`, `fix:`,
`docs:`, `chore:` …), because a squash merge makes the title the commit. release-please keeps a
release PR open on `main`. Merging it tags the release, runs the tests and the consumer path on
macOS, publishes `gpuix-svelte` and `create-gpuix-svelte` to npm through npm trusted publishing
(OIDC, with provenance), builds the tic-tac-toe example on every platform with `--archive` and
uploads the archives and a signed `update.json` to the GitHub release (see
[Updating](updating.md)). `npm run pack -- <dir>` builds the same tarball locally.

## Docs site

`npm run docs` renders the README and `docs/*.md` to static HTML in `dist/docs`, along with a
markdown copy of each page, an `llms.txt` index and an `llms-full.txt` for coding agents. It also
copies the homepage (`homepage/`) to the root, so the README renders as `overview.html`. The
`docs` workflow publishes it to GitHub Pages on every push to `main` that touches any of them. A
new page needs an entry in `PAGES` in [`scripts/docs.ts`](../scripts/docs.ts). `npm run docs:serve`
builds it the same way, then serves it at http://127.0.0.1:4321 and opens it in your browser, and
rebuilds whenever the README, `docs/`, `homepage/` or the script itself changes (reload the page to
see it).

The social preview images are screenshots: `npm run og` retakes `homepage/og.png` from the
homepage's `#og` view, and `npm run og:docs` retakes `docs/assets/og-docs.png` from the built
overview page. Both need Chrome installed (or `CHROME` pointing at a Chromium). Rerun them after
changing the hero or the docs template, and keep the `og:image:alt` text in step.
