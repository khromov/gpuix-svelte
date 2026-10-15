# Shipping an app

Two scripts in the repository turn its examples into a standalone binary, a signed macOS app and a
web page: [`scripts/compile.ts`](../scripts/compile.ts) and [`scripts/web.ts`](../scripts/web.ts).
Copy one and point it at your own entry. An app made with `npm create gpuix-svelte` already has a
`build.ts` for the binary. Both scripts need [Bun](https://bun.com).

## Build a standalone binary

Bun can compile an app into one self-contained executable that carries the Bun runtime, Svelte and
the GPUI addon. In a clone of the repo:

```bash
npm run compile        # tic-tac-toe → dist/tictactoe (dist\tictactoe.exe on Windows)
npm run compile:app    # macOS: additionally wraps it as dist/Tic-tac-toe.app
```

A binary holds compiled code with no source files to watch, so its entry mounts the component
with `render` and a static import. `render_hot` is for development, where it re-imports from disk.
The entry looks like
[`examples/tic-tac-toe/standalone.ts`](../examples/tic-tac-toe/standalone.ts):

```ts
import { render } from 'gpuix-svelte';
import App from './App.svelte';

render(App, { title: 'My app', width: 480, height: 640 });
```

`Bun.build` takes its plugins as options, so the build script wires up `gpuix-svelte/plugin`
itself. `load_svelte` and `load_module` compile components, `resolve_svelte` pins every `svelte`
import to the build the package bundles, and `resolve_native_cjs` gets the GPUI addon embedded. A
project made with `npm create gpuix-svelte` ships this as `build.ts`, behind `npm run build`:

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

## Run it in a browser

The same components run on the web, because GPUI itself compiles to WebAssembly and paints a
WebGPU canvas (WebGL2 where WebGPU is missing). You get the desktop app, pixel for pixel, inside a
`<canvas>`:

```bash
npm run demo:web                  # → http://localhost:4173
npm run demo:web -- --production  # minified, Svelte's production runtime
npm run demo:web -- --build-only  # writes dist/web and stops
```

`PORT` picks a different port.
[`examples/tic-tac-toe/web.ts`](../examples/tic-tac-toe/web.ts) is the entry, and it makes the same
two calls as the desktop one. The component, the renderer and your styles stay the same. Only the
plumbing differs:

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

`npm run compile` signs the binary when `CODESIGN_IDENTITY` names a Developer ID Application
certificate in your keychain. `npm run compile:app` also notarizes and staples the bundle when
`NOTARY_PROFILE` names a `notarytool` keychain profile, and leaves `dist/Tic-tac-toe.zip` ready to
ship. The one-time setup:

1. Create an app-specific password at https://account.apple.com → Sign-In and Security →
   App-Specific Passwords.
2. Store it under a profile name, with the team ID from your certificate:

   ```bash
   xcrun notarytool store-credentials notary --apple-id you@example.com --team-id TEAMID --password xxxx-xxxx-xxxx-xxxx
   ```

   A 403 "required agreement is missing or has expired" means the Account Holder has to accept the
   current Program License Agreement at https://appstoreconnect.apple.com/agreements. It can take
   a while to propagate after that.
3. Put both variables in a `.env` at the repo root. It's gitignored, and Bun loads it when it runs
   the script, so a plain `npm run compile:app` signs from then on:

   ```
   CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   NOTARY_PROFILE=notary
   ```

If Apple rejects a submission, the script prints the submission output and exits.
`xcrun notarytool log <submission-id> --keychain-profile notary` shows the reason.
