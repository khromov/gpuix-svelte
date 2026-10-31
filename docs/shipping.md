# Shipping an app

An app made with `npm create gpuix-svelte` turns into something you can hand to people with one
command:

```bash
npm run build
```

For a project created as `my-app`, on macOS that is `dist/my-app.app`, an application bundle
with its icon that opens from Finder or the Dock. On Windows it is `dist/my-app.exe`, with the
icon and version info in its file properties. On Linux it is the executable `dist/my-app`.
Each is self-contained: the Bun runtime, Svelte and the GPUI addon are inside, so the machine it
runs on needs nothing installed.

The build needs [Bun](https://bun.com) 1.4 or later, whichever runtime you develop on, because Bun
is the compiler. Everything else comes with the operating system.

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

Everything under `app` is optional, and the window ignores it; it exists for the build.

| Field         | Used for                                                              | Default                                      |
| ------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `name`        | The `.app` name, the Dock and menu bar, the Windows product name      | the window `title`, else `package.json`'s `name` |
| `identifier`  | The bundle identifier, which signing and macOS's per-app state key on | `local.<slug>` (the name lowercased, with dashes); set a reverse-DNS one before you sign |
| `version`     | `CFBundleShortVersionString` on macOS, the file version on Windows    | `package.json`'s `version`                   |
| `icon`        | The `.icns` on macOS, the `.ico` on Windows                           | the gpuix-svelte icon                        |
| `copyright`   | `NSHumanReadableCopyright` and the Windows copyright field            | none                                         |
| `publisher`, `description` | Windows file properties                                   | the app's name                               |

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

await build({ entry: './standalone.ts' });
```

It reads the `app` options and the `title` from `standalone.ts`'s source, so they have to be
written out: each value a string, either in place or in a top-level `const`
(`icon` can also be `new URL('./icon.png', import.meta.url)`). A value under `app` that is only
known at runtime, such as `version: pkg.version`, fails the build with an error naming it; leave it
out and the default covers it. A `title` worked out at runtime is skipped, so the name then comes from
`package.json`. The entry needs exactly one `render()` call at its top level. Then the build bundles
the entry with Bun's compiler, checks that the GPUI addon made it in, and packages the executable
for the platform it is running on.
`outdir` moves the output (`dist` by default), and the returned object names the `output` to ship,
the `binary` inside it, the resolved `app` metadata, and whether it was `signed` and `notarized`.

Some things to know:

- **One platform per build.** npm installs only the GPUI addon for the machine you are on, so run
  `npm run build` on macOS (Apple Silicon), Windows (x64) and Linux (x64) in turn, for instance in a
  GitHub Actions matrix over `macos-latest`, `windows-latest` and `ubuntu-latest`.
- **It is about 110 MB, and about 130 MB on Windows.** That is Bun's runtime plus Svelte plus the
  addon, which is 17 MB or more on every platform.
- **Logs.** A double-clicked app has no terminal, so `console.log` output goes nowhere. To see it
  on macOS or Linux, start the executable from a shell: `dist/my-app.app/Contents/MacOS/my-app` or
  `dist/my-app`. The Windows `.exe` is a GUI program, so a shell neither waits for it nor shows
  its output; redirect it instead: `dist\my-app.exe > log.txt 2>&1`.
- **Linux.** The executable loads `libxcb`, `libxkbcommon` and `libxkbcommon-x11` from the system,
  which desktop installs have and a minimal container lacks. Nothing registers it with the desktop:
  a `.desktop` file and an icon under `~/.local/share` are yours to add, or a package's.
- **Unsigned by default.** macOS blocks a downloaded, unsigned app until the person allows it under
  System Settings → Privacy & Security, and Windows SmartScreen warns about an unsigned `.exe`. For
  anything you distribute, see the next section.

## Signing and notarizing on macOS

`build()` signs and notarizes when two environment variables are set. Put them in a `.env` next to
`package.json` (and gitignore it); Bun loads it when it runs `build.ts`, so a plain `npm run build`
signs from then on:

```
CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
NOTARY_PROFILE=notary
```

With `CODESIGN_IDENTITY` set to a Developer ID Application certificate in your keychain, the build
signs the `.app` with the hardened runtime and the entitlements Bun's JIT and the GPUI addon need.
With `NOTARY_PROFILE` as well, it submits the app to Apple with `notarytool`, waits, staples the
ticket and leaves `dist/my-app.zip` next to the `.app` as the file to distribute. Give the app a real
`identifier` first; the default `local.<slug>` is a placeholder.

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

If Apple rejects a submission, the build prints the submission output and fails.
`xcrun notarytool log <submission-id> --keychain-profile notary` shows the reason.

On Windows, sign the `.exe` afterwards with `signtool` if you have a certificate.

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

`PORT` picks a different port. To build your own app, copy that script into your project and
point it at an entry like [`examples/tic-tac-toe/web.ts`](../examples/tic-tac-toe/web.ts), which
makes the same two calls as the desktop one. The component, the renderer and your styles stay the
same. Only the plumbing differs:

- **It's built with Bun.** `@gpuix/native` ships the wasm and exposes it through its `browser`
  export condition, and its loader imports the binary with `with { type: 'file' }`, an import
  attribute that Bun's bundler reads.
- **The page must be cross-origin isolated.** GPUI's wasm uses shared memory, so whatever serves
  it has to send `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`, and serve `.wasm` as `application/wasm`.
  `scripts/web.ts` does all of this. Serve the page over HTTP so those headers arrive.
- **The page sizes the canvas.** The canvas fills the page, styled by the CSS in `index.html`.
  `title`, `width` and `height` apply only to desktop windows.
- **The browser has no `process`.** Bun doesn't shim it for a browser bundle, so a bare
  `process.env.X` in your app code throws a `ReferenceError` there.
- **It's a 19.9 MB download** uncompressed, so serve it with compression.

## In the repository

`npm run compile` builds the tic-tac-toe example the same way a scaffolded app is built:
[`scripts/compile.ts`](../scripts/compile.ts) is the same `build()` call, and
[`examples/tic-tac-toe/standalone.ts`](../examples/tic-tac-toe/standalone.ts) carries the `app`
options. The implementation is [`src/build.ts`](../src/build.ts) (the Bun compile) and
[`src/app-bundle.ts`](../src/app-bundle.ts) (the plist, icons, signing and notarization).

## Addendum: Remote Desktop hosts

On a Windows Server 2019 session host with no GPU, a window's title bar has been reported not to
respond to the mouse over Remote Desktop, and turning DirectComposition off may not be enough by
itself: the report of it helping came from a build that also carried a native title-bar patch.
Set this before the first `render()`; without DirectComposition a window can't be see-through, so
`transparent` and `windowBackground` stop showing what is behind it:

```js
if (process.env.SESSIONNAME?.startsWith('RDP-')) process.env.GPUI_DISABLE_DIRECT_COMPOSITION = '1';
```
