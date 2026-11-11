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
npm run demo:cross        # one component on both renderers: here in a GPUI window, and
npm run demo:dom          # here in a browser DOM through Vite (-- --build-only writes dist/dom)
npm run tutorial          # interactive onboarding guide: 12 steps with live samples and quizzes
npm run typecheck         # tsc, then svelte-check for the GPUI markup and again for the DOM components
npm test                  # typecheck, then every test suite except automation-live and coverage
npm run lint              # ESLint; not part of `npm test`, so run it before pushing
npm run check:svelte      # every component through the Svelte MCP server's autofixer (needs network)
npm run parity            # @gpuix/native methods nothing here calls; run it after a native bump
```

New here? `npm run tutorial` opens a guided walkthrough of the renderer that is itself a
gpuix-svelte app. Each step pairs an explanation and a diagram with the source of a small
component, most of them running live, and ends with a quiz.

Every test script, and every demo apart from the Bun-only `demo:web` and the Vite-run `demo:dom`,
has a Bun twin under a `bun:` prefix: `npm run bun:test`, `npm run bun:demo`, `npm run bun:demo:counter`, and so on. The
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
headless renderer (`test:bundle`, `test:compile`, `test:update`, `test:launcher`, `test:dom`, `test:docs`) run anywhere, and so do
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
rebuilds whenever the README, `docs/`, `homepage/`, the DOM versions of the components or the script itself changes
(reload the page to see it).

A fenced block whose info string is `svelte demo <name>` is also a live demo. The block is the
whole source of a component: on GitHub it reads as a code sample, on the site it renders as the
code with the component running above it, in the DOM ([details](dom.md)), so the two can't drift. The
build writes each one to `dist/docs-demos/<page>-<name>.svelte` and bundles them with Vite into
`dist/docs/demos.js`, the same way `demo:dom` builds the cross-target example
([`scripts/vite-dom.ts`](../scripts/vite-dom.ts) holds the plugins): `gpuix-svelte` and
`gpuix-svelte/components/*.svelte` resolve to the DOM versions of the components, exactly as in a consumer's Vite app,
and only the pages that have a demo load the bundle. Write a demo in the subset both renderers
draw the same way ([Rendering in the DOM](dom.md#writing-a-component-for-both)) and colour it with
the tokens the page defines for them, `--paper`, `--ink`, `--panel`, `--raised` and `--dim`, plus
the components' own `--tooltip-*`, `--popover-*` and `--scroller-*`. Keep `set_css_vars` for a demo
that is about theming: it writes `:root`, which the whole page reads. A demo that does not compile
fails `npm run docs`; `npm run test:docs` builds the site and mounts every demo from the built
bundle under happy-dom, so one that throws at mount fails there, and CI's Linux job runs it.

The social preview images are screenshots: `npm run og` retakes `homepage/og.png` from the
homepage's `#og` view, and `npm run og:docs` retakes `docs/assets/og-docs.png` from the built
overview page. Both need Chrome installed (or `CHROME` pointing at a Chromium). Rerun them after
changing the hero or the docs template, and keep the `og:image:alt` text in step.

`npm run shots` retakes every other screenshot: the example windows in `homepage/assets/shots/`
(each app launched through `gpuix-svelte/automation`, driven to the state its image shows and
captured by GPUI at 2×), tic-tac-toe on the wasm build in headless Chrome, and the README's
`.github/resources/demos.png` (the fresh counter, tic-tac-toe and Hacker News captures and
`glass.png`, with CSS window chrome on a dark background), and then runs `og` and `og:docs`,
since both show what changed. It needs macOS or Windows for the windows, Bun for the web build
and Chrome for the rest; `-- --only hn,demos` redoes a subset. `glass.png` is the one capture it
leaves alone, since the control center needs a desktop behind it, and the hero's wallpapers in
`homepage/assets/wall/` are plain images it never touches. Run it after restyling an example; an
`<img>`'s `width`/`height` (and a carousel tile's `--a`) only change if a window's size did.
