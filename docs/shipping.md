# Shipping an app

> [!NOTE]
> **Partly unreleased.** The `archive` option, the `beforeArchive` hook, notarizing with an Apple
> ID on CI and the scaffolder's release workflow described below ship in the next gpuix-svelte
> release (0.5.0), together with [in-app updates](updating.md). The current release on npm, 0.4.1,
> builds and signs the app but has none of those.

An app made with `npm create gpuix-svelte` builds into something you can hand to people with one
command:

```bash
npm run build
```

For a project created as `my-app`, on macOS that is `dist/my-app.app`, an application bundle
with its icon that opens from Finder or the Dock. On Windows it is `dist/my-app.exe`, with the
icon and version info in its file properties. On Linux it is the executable `dist/my-app`.
Each carries the Bun runtime, Svelte and the GPUI addon. On Linux the machine also needs the
system libraries `libxcb`, `libxkbcommon` and `libxkbcommon-x11`, which desktop installs have.

The build needs [Bun](https://bun.com) 1.4 or later, whichever runtime you develop on, because Bun
is the compiler. Notarizing on macOS also needs the Xcode Command Line Tools, for `notarytool`.

## What the app is called, and its icon

The build reads the name, identifier, version and icon from the same place the window gets its
title: the `render()` call in `standalone.ts`, under `app`:

```ts
import { render } from 'gpuix-svelte';
import App from './App.svelte';

render(App, {
	title: 'My App',
	width: 640,
	height: 480,
	app: {
		identifier: 'com.example.my-app',
		icon: './icon.png'
	}
});
```

Everything under `app` is optional, and it exists for the build. The window takes only two things
from it: `name` when there is no `title`, and `identifier` as its app id on Linux.

| Field         | Used for                                                              | Default                                      |
| ------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `name`        | The `.app` name, the Dock and menu bar, the Windows product name      | the window `title`, else `package.json`'s `name` |
| `identifier`  | The bundle identifier, which signing and macOS's per-app state key on; the window's app id on Linux | `local.<slug>` (the name lowercased, with dashes) in the build, no app id on the window; set a reverse-DNS one before you sign |
| `version`     | `CFBundleShortVersionString` on macOS, the file version on Windows    | `package.json`'s `version`                   |
| `icon`        | The `.icns` on macOS, the `.ico` on Windows; not used on Linux, where the `.desktop` file names the icon (the path is still checked) | the gpuix-svelte icon |
| `copyright`   | `NSHumanReadableCopyright` and the Windows copyright field            | none                                         |
| `publisher`, `description` | Windows file properties                                   | the app's name                               |
| `update`      | `{ manifest, publicKey? }`, where the built app checks for updates; see [Updating](updating.md) | none |

`icon` is a square PNG, 1024 × 1024 for macOS's largest size; until you set one, the app wears the
gpuix-svelte icon. A relative path is read from `standalone.ts`'s directory. The build cuts
every size the platform wants from it with tools the platform has: `sips` and `iconutil` on macOS,
.NET's `System.Drawing` through PowerShell on Windows. Windows file properties take numbers only,
so a `1.0.0-beta.1` is written there as `1.0.0`; on macOS it goes into
`CFBundleShortVersionString` as written and `CFBundleVersion` gets its numbers, `1.0.0`.

If `name` is not set, the window title doubles as the app name. The reverse holds too: with a
`name` and no `title`, the window takes the name.

## What `npm run build` does

`build.ts` in the scaffold is one call:

```ts
import { build } from 'gpuix-svelte/build';

await build({ entry: './standalone.ts', archive: process.argv.includes('--archive') });
```

It reads the `app` options and the `title` from `standalone.ts`'s source, so they have to be
written out: each value a string, either in place or in a top-level `const`
(`icon` can also be `new URL('./icon.png', import.meta.url)`). A value under `app` that is only
known at runtime, such as `version: pkg.version`, fails the build with an error naming it; leave it
out and the default covers it. A `title` worked out at runtime is skipped, so the name then comes
from `package.json`. The entry needs exactly one `render()` call at its top level. Then the build
bundles the entry with Bun's compiler, checks that the GPUI addon made it in, and packages the
executable for the platform it is running on.

`entry` and `outdir` (`dist` by default) are resolved from the working directory, so run `build.ts`
from the project root. The returned object names the `output` to ship, the `binary` inside it, the
resolved `app` metadata, and whether it was `signed` and `notarized`. `archive: true`
(`bun build.ts --archive` in a scaffolded app) also writes the archive to distribute,
`<slug>-<version>-<platform>.zip`, and the fragment an update manifest is made
from. [Updating](updating.md) covers that, including a GitHub workflow that builds and uploads every
platform on each release.

Good to know:

- **One platform per build.** npm installs only the GPUI addon for the machine you are on, so run
  `npm run build` on macOS (Apple Silicon), Windows (x64 or arm64) and Linux (x64) in turn. The
  starter's release workflow does that in a GitHub Actions matrix.
- **It is 110 to 155 MB:** about 110 MB on macOS, 115 MB on Windows arm64, 130 MB on Windows x64
  and 155 MB on Linux. That is Bun's runtime plus Svelte plus the addon, which is 17 MB or more on
  every platform and 50 MB on Linux.
- **Logs.** A double-clicked app has no terminal, so `console.log` output goes nowhere. To see it
  on macOS or Linux, start the executable from a shell: `dist/my-app.app/Contents/MacOS/my-app` or
  `dist/my-app`. The Windows `.exe` is a GUI program, so a shell neither waits for it nor shows
  its output; redirect it instead: `dist\my-app.exe > log.txt 2>&1`.
- **Linux.** Nothing registers the executable with the desktop: a `.desktop` file and an icon
  under `~/.local/share` are yours to add, or a package's. Name the file after `identifier`
  (`com.example.my-app.desktop`), because the window reports that as its Wayland app id and X11
  `WM_CLASS`, which is how the desktop connects the two.
- **Unsigned by default.** macOS blocks a downloaded, unsigned app until the person allows it under
  System Settings → Privacy & Security, and Windows SmartScreen warns about an unsigned `.exe`. For
  anything you distribute, see the next section.

## Signing and notarizing on macOS

`build()` signs and notarizes when two environment variables are set. Put them in a `.env` next to
`package.json` (a new app's `.gitignore` already lists it); Bun loads it when it runs `build.ts`,
so a plain `npm run build` signs from then on:

```
CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
NOTARY_PROFILE=notary
```

With `CODESIGN_IDENTITY` set to a Developer ID Application certificate in your keychain, the build
signs the `.app` with the hardened runtime and the entitlements Bun's JIT and the GPUI addon need.
With `NOTARY_PROFILE` as well, it submits the app to Apple with `notarytool`, waits, staples the
ticket and leaves a zip next to the `.app` as the file to distribute: `dist/my-app.zip`, or with
`--archive` the versioned archive itself. Give the app a real `identifier` first; the default
`local.<slug>` is a placeholder.

The one-time setup for the notary profile:

1. Create an app-specific password at https://account.apple.com → Sign-In and Security →
   App-Specific Passwords.
2. Store it under a profile name, with the team ID from your certificate:

   ```bash
   xcrun notarytool store-credentials notary --apple-id you@example.com --team-id TEAMID --password xxxx-xxxx-xxxx-xxxx
   ```

   A 403 "required agreement is missing or has expired" means the Account Holder has to accept the
   current Program License Agreement at https://appstoreconnect.apple.com/agreements. It can take
   a while to propagate after that.

If Apple rejects a submission, the build fails and prints what `notarytool` returned.
`xcrun notarytool log <submission-id> --keychain-profile notary` shows the reason.

On a CI runner there is no keychain profile; set `APPLE_ID`, `APPLE_PASSWORD` (the app-specific
password) and `APPLE_TEAM_ID` instead of `NOTARY_PROFILE`, keep `CODESIGN_IDENTITY` set, and import
the certificate into a keychain first. The starter's release workflow does both from secrets; see
[Updating](updating.md#on-github).

On Windows, sign the `.exe` with `signtool` if you have a certificate. Do it before the archive
is made, since the archive's hash goes into the update manifest: `build()`'s `beforeArchive`
callback runs on the packaged output at that point and gets the `binary` path.

## Run it in a browser

The same components run on the web, because GPUI itself compiles to WebAssembly and paints a
WebGPU canvas (WebGL2 where WebGPU is missing). You get the desktop app, pixel for pixel, inside a
`<canvas>`. The whole integration is the repository's [`scripts/web.ts`](../scripts/web.ts),
which bundles the tic-tac-toe example and serves it:

```bash
npm run demo:web                  # in a clone of the repository → http://localhost:4173
npm run demo:web -- --production  # minified, Svelte's production runtime
npm run demo:web -- --build-only  # writes dist/web and stops
```

`PORT` picks a different port. To build your own app, copy that script into your project, change
its plugin import to `gpuix-svelte/plugin`, and point its paths at an entry like
[`examples/tic-tac-toe/web.ts`](../examples/tic-tac-toe/web.ts), which makes the same two calls as
the desktop one, and at a page like the example's `index.html` (the build writes only the bundle
and the wasm; the page is yours). The component, the renderer and your styles stay the same. Only
the plumbing differs:

- **It's built with Bun.** `@gpuix/native` ships the wasm and exposes it through its `browser`
  export condition, and its loader imports the binary with `with { type: 'file' }`, an import
  attribute that Bun's bundler reads.
- **The page must be cross-origin isolated.** GPUI's wasm uses shared memory, so whatever serves
  it has to send `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`, and serve `.wasm` as `application/wasm`.
  `scripts/web.ts` does all of this. Browsers only honour those headers over HTTPS (or on
  `localhost`), and `file://` can't work at all.
- **The page sizes the canvas.** The canvas fills the page, styled by the page's CSS. `title`,
  `width` and `height` apply only to desktop windows.
- **The browser has no `process`.** Bun doesn't shim it for a browser bundle, so a bare
  `process.env.X` in your app code throws a `ReferenceError` there.
- **It's about a 20 MB download** uncompressed, almost all of it the wasm, so serve it with
  compression.

## In the repository

`npm run compile` builds the tic-tac-toe example the same way a scaffolded app is built:
[`scripts/compile.ts`](../scripts/compile.ts) is the same `build()` call, and
[`examples/tic-tac-toe/standalone.ts`](../examples/tic-tac-toe/standalone.ts) carries the `app`
options. The implementation is [`src/build.ts`](../src/build.ts) (the Bun compile) and
[`src/app-bundle.ts`](../src/app-bundle.ts) (the plist, icons, signing and notarization).

## Addendum: Remote Desktop hosts

On a Windows Server 2019 session host with no GPU, a window's title bar has been reported not to
respond to the mouse over Remote Desktop. Turning DirectComposition off may help, but the report
of it helping came from a build that also carried a native title-bar patch, so it is not
confirmed. Set this before the first `render()`; without DirectComposition a window can't be
see-through, so `transparent` and `windowBackground` stop showing what is behind it:

```js
if (process.env.SESSIONNAME?.startsWith('RDP-')) process.env.GPUI_DISABLE_DIRECT_COMPOSITION = '1';
```
