# Shipping an app

An app made with `npm create gpuix-svelte` builds its standalone binary with `npm run build`. The
macOS `.app` wrapper, signing and the browser build are not scaffolded yet: the repository does
them for its own examples in [`scripts/compile.ts`](../scripts/compile.ts) and
[`scripts/web.ts`](../scripts/web.ts), and each section below says what to copy from them. All of
it needs [Bun](https://bun.com), whichever runtime you develop on.

## Build a standalone binary

Bun can compile an app into one self-contained executable that carries the Bun runtime, Svelte and
the GPUI addon. In a scaffolded project:

```bash
npm run build          # → dist/app (dist\app.exe on Windows)
```

A binary holds compiled code with no source files to watch, so its entry mounts the component
with `render` and a static import. `render_hot` is for development, where it re-imports from disk.
The scaffold's `standalone.ts` is exactly this:

```ts
import { render } from 'gpuix-svelte';
import App from './App.svelte';

render(App, { title: 'My app', width: 480, height: 640 });
```

`Bun.build` takes its plugins as options, so the build script wires up `gpuix-svelte/plugin`
itself. `load_svelte` and `load_module` compile components, `resolve_svelte` pins every `svelte`
import to the build the package bundles, and `resolve_native_cjs` gets the GPUI addon embedded.
This is the scaffold's `build.ts`, which `npm run build` runs:

```ts
/// <reference types="bun" />
// `bun build.ts` (npm run build): compiles standalone.ts into one executable for the platform it runs on.

import type { BunPlugin } from 'bun';
import { load_module, load_svelte, resolve_native_cjs, resolve_svelte } from 'gpuix-svelte/plugin';

const conditions = ['custom-renderer', 'production'];
const outfile = process.platform === 'win32' ? 'dist/app.exe' : 'dist/app';

// A `.svelte` import that misses the plugin silently becomes a file asset, so count what went through it.
let components = 0;
const plugin: BunPlugin = {
	name: 'gpuix-svelte',
	setup(build) {
		build.onResolve({ filter: /^@gpuix\/native$/ }, resolve_native_cjs);
		build.onResolve({ filter: /^svelte(\/|$)/ }, resolve_svelte(conditions));
		build.onLoad({ filter: /\.svelte\.[jt]s$/ }, load_module);
		build.onLoad({ filter: /\.svelte$/ }, (args) => {
			components++;
			return load_svelte(args);
		});
	}
};

const result = await Bun.build({
	entrypoints: ['./standalone.ts'],
	target: 'bun',
	conditions,
	define: { 'process.env.NODE_ENV': '"production"' },
	minify: true,
	plugins: [plugin],
	throw: false,
	compile: {
		outfile,
		autoloadBunfig: false,
		autoloadDotenv: false,
		...(process.platform === 'win32' && { windows: { hideConsole: true } })
	}
});

if (!result.success || components === 0) {
	for (const log of result.logs) console.error(log);
	if (components === 0) console.error('no .svelte file went through the plugin');
	process.exit(1);
}
console.log(`built ${outfile}`);
```

The result is around 80 MB: the Bun runtime, the Svelte runtime and the GPUI addon, which is 17 MB
or more on every platform. npm installs only the addon prebuilt for the host, so each platform
builds its own binary. Run the same command on macOS (arm64), Linux (x64) or Windows (x64) to get
that platform's binary.

The output is unsigned by default, and macOS blocks a downloaded unsigned copy until you allow it
under System Settings → Privacy & Security. See [Signing](#signing).

> **In the repository**, `npm run compile` builds the tic-tac-toe example the same way, and
> `npm run compile:app` additionally wraps it as `dist/Tic-tac-toe.app` with an icon.
> [`scripts/compile.ts`](../scripts/compile.ts) is where to copy the `.app` wrapping from: it
> writes the `Info.plist`, cuts the `.icns` from a PNG with `sips` and `iconutil`, and signs.

## Build a smaller binary on QuickJS

The Bun binary above is 80 MB because it carries Bun itself. The same app runs on
[QuickJS-ng](https://github.com/quickjs-ng/quickjs) instead, inside `gpuix-qjs`: a host executable
that links the GPUI renderer and the QuickJS engine together, with no Node and no Bun at runtime.
The whole thing comes to about 20 MB, nearly all of it GPUI.

```bash
npx gpuix-svelte --qjs standalone.ts                      # develop: a window, remounting on every save
npx gpuix-svelte --qjs standalone.ts --compile            # → dist/<dir name> (one executable)
npx gpuix-svelte --qjs standalone.ts --compile --app \
    --icon icon.png --id com.example.myapp                # macOS: → dist/<dir name>.app, signed
```

What is different from the Node and Bun paths:

- **The entry is the static one.** `render_hot` re-imports from disk; QuickJS runs a bundle, so the
  entry is the same `standalone.ts` the Bun build uses. In development the bundle is rebuilt on every
  save under the entry's directory and the host re-imports it, which remounts on the same window.
  The Svelte runtime sits in its own chunk and stays loaded, so state in `.svelte.ts` modules is
  reset by a reload (they are part of the app chunk) and there is no restart warning.
- **Bundling still needs Bun**, as the Bun and web builds do, because the `.svelte` files are
  compiled by Bun's bundler. Node users get one with `npm i -D bun`: the `bun` package puts the
  binary in `node_modules/.bin`, where `npx gpuix-svelte --qjs` finds it.
- **The host binary comes from the gpuix fork**, [`packages/qjs`](https://github.com/khromov/gpuix/tree/main/packages/qjs).
  Until the prebuilt `gpuix-qjs-<platform>-<arch>` packages are published, build it there with
  `cargo build --release` and point `GPUIX_QJS` at `packages/native/target/release/gpuix-qjs`.
- **The runtime is an engine, not Node.** `setTimeout`, `console`, `process.env`, `process.exit`,
  `queueMicrotask`, `performance.now` and `structuredClone` exist; `node:*` modules, `fetch`,
  `TextEncoder`, workers and SQLite do not. An app that reads files or talks to the network stays
  on Node or Bun. `@gpuix/native/host` and `gpuix-svelte` itself need nothing more than the above.
- **Two shapes of output.** `--compile` appends the bundle to a copy of the host, one file that runs
  on any of the three platforms it is built on. macOS's `codesign` refuses a Mach-O with data after
  it, so `--compile --app` instead puts the bundle beside the binary inside the `.app`, where the
  bundle signature seals it; the result is signed ad hoc, or with `CODESIGN_IDENTITY` as in
  [Signing](#signing). QuickJS has no JIT, so the hardened runtime needs none of the JIT
  entitlements the Bun build does. Notarization is the same `notarytool` flow as for the Bun `.app`.
- **Desktop only, no automation server.** The host has the window APIs (`getElementBounds`,
  `scrollTo`, `promptForPaths`, `captureScreenshot`, `GPUIX_SCREENSHOT`) but not the test renderer
  or `GPUIX_AUTOMATION`; test with `gpuix-svelte/test` under Node or Bun, which is the same
  renderer code. The Linux host builds and opens a window (tried in Docker, software Vulkan);
  Windows has not been tried yet.

> **In the repository**, `npm run demo:counter:qjs` and `npm run demo:tictactoe:qjs` run two of the
> examples this way, `npm run qjs -- <entry>` any other, and `npm run test:qjs` drives a keystroke
> and a reload through the host when `GPUIX_QJS` is set.

## Run it in a browser

The same components run on the web, because GPUI itself compiles to WebAssembly and paints a
WebGPU canvas (WebGL2 where WebGPU is missing). You get the desktop app, pixel for pixel, inside a
`<canvas>`. The scaffold has no web script yet; the whole integration is the repository's
[`scripts/web.ts`](../scripts/web.ts), which bundles the tic-tac-toe example and serves it:

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

## Signing

### macOS

The scaffold's `build.ts` leaves the binary unsigned. The repository's
[`scripts/compile.ts`](../scripts/compile.ts) has the signing step to copy: its `sign` function
runs `codesign` with the hardened runtime and entitlements when `CODESIGN_IDENTITY` names a
Developer ID Application certificate in your keychain, and its `notarize` function submits the
`.app` with `notarytool`, staples it and leaves a zip ready to ship when `NOTARY_PROFILE` names a
keychain profile. In a clone, that is `npm run compile` and `npm run compile:app`. The one-time
setup is the same wherever the script lives:

1. Create an app-specific password at https://account.apple.com → Sign-In and Security →
   App-Specific Passwords.
2. Store it under a profile name, with the team ID from your certificate:

   ```bash
   xcrun notarytool store-credentials notary --apple-id you@example.com --team-id TEAMID --password xxxx-xxxx-xxxx-xxxx
   ```

   A 403 "required agreement is missing or has expired" means the Account Holder has to accept the
   current Program License Agreement at https://appstoreconnect.apple.com/agreements. It can take
   a while to propagate after that.
3. Put both variables in a `.env` next to `package.json` (gitignore it). Bun loads it when it
   runs the script, so a plain build signs from then on:

   ```
   CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   NOTARY_PROFILE=notary
   ```

If Apple rejects a submission, the script prints the submission output and exits.
`xcrun notarytool log <submission-id> --keychain-profile notary` shows the reason.
