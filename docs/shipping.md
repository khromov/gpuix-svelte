# Shipping an app

How the repo's own examples are turned into a standalone binary, a signed macOS app and a web page.
These are scripts in the repository rather than commands in the package — copy
[`scripts/compile.ts`](../scripts/compile.ts) or [`scripts/web.ts`](../scripts/web.ts) and point them
at your own entry. Both need [Bun](https://bun.com).

## Build a standalone binary

Bun can compile an app into one self-contained executable carrying the Bun runtime, Svelte and the
GPUI addon. In a clone of the repo:

```bash
npm run compile        # tic-tac-toe → dist/tictactoe (dist\tictactoe.exe on Windows)
npm run compile:app    # macOS: additionally wraps it as dist/Tic-tac-toe.app
```

A binary carries compiled code rather than source files, so its entry mounts the component with
`render` and a static import (`render_hot` is for development, where it re-imports from disk)
([`examples/tic-tac-toe/standalone.ts`](../examples/tic-tac-toe/standalone.ts)):

```ts
import { render } from 'gpuix-svelte';
import App from './App.svelte';

render(App, { title: 'My app', width: 480, height: 640 });
```

`Bun.build` takes its plugins as options, so the build script wires up `gpuix-svelte/plugin`
itself: `load_svelte` / `load_module` compile components, `resolve_svelte` pins every `svelte`
import to the build the package bundles, and `resolve_native_cjs` embeds the GPUI addon. A
complete `build.ts` for a project made with `npm create gpuix-svelte`, run with `bun build.ts`:

```ts
import type { BunPlugin } from 'bun';
import { load_module, load_svelte, resolve_native_cjs, resolve_svelte } from 'gpuix-svelte/plugin';

const conditions = ['custom-renderer', 'production'];

const plugin: BunPlugin = {
  name: 'gpuix-svelte',
  setup(build) {
    build.onResolve({ filter: /^@gpuix\/native$/ }, resolve_native_cjs);
    build.onResolve({ filter: /^svelte(\/|$)/ }, resolve_svelte(conditions));
    build.onLoad({ filter: /\.svelte\.[jt]s$/ }, load_module);
    build.onLoad({ filter: /\.svelte$/ }, load_svelte);
  }
};

const result = await Bun.build({
  entrypoints: ['./standalone.ts'],
  target: 'bun',
  conditions,
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  plugins: [plugin],
  compile: { outfile: './dist/app', autoloadBunfig: false, autoloadDotenv: false }
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
```

The result is ~80 MB — the Bun runtime, the Svelte runtime and the 17 MB GPUI addon. It is built
for the machine it runs on: run the same command on macOS (arm64), Linux (x64) or Windows (x64) to
get that platform's binary. There is no cross-compiling, since npm only installs the addon prebuilt
for the host.

The output is unsigned by default, and macOS blocks a downloaded unsigned copy until it is allowed
under System Settings → Privacy & Security. See [Signing](#signing).

## Run it in a browser

The same components run on the web, because GPUI itself compiles to WebAssembly and paints a
WebGPU canvas. What you get is the desktop app, pixel for pixel, inside a `<canvas>`:

```bash
npm run demo:web                  # → http://localhost:4173
npm run demo:web -- --production  # minified, Svelte's production runtime
```

[`examples/tic-tac-toe/web.ts`](../examples/tic-tac-toe/web.ts) is the entry, and it is the same two lines as the desktop one — the
component, the renderer and your styles are unchanged. Only the plumbing differs:

- **Built with Bun.** `@gpuix/native` ships the wasm and points its `browser` field at it, and the
  loader imports the binary with `with { type: 'file' }`, an attribute Bun's bundler reads.
- **The page must be cross-origin isolated.** GPUI's wasm uses shared memory, so whatever serves it
  has to send `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`, and serve `.wasm` as `application/wasm`.
  `scripts/web.ts` does this, so serve the page over HTTP.
- **The page sizes the canvas.** It fills the page, styled by CSS in `index.html`; `title`,
  `width` and `height` apply to desktop windows.
- **It is a 19.9 MB download** uncompressed, so serve it with compression.

## Signing

### macOS

`compile` signs when `CODESIGN_IDENTITY` names a Developer ID Application certificate in your
keychain; `compile:app` also notarizes and staples the bundle when `NOTARY_PROFILE` names a
`notarytool` keychain profile, and leaves `dist/Tic-tac-toe.zip` ready to ship. One-time setup:

1. Create an app-specific password at https://account.apple.com → Sign-In and Security →
   App-Specific Passwords.
2. Store it under a profile name, with the team ID from your certificate:

   ```bash
   xcrun notarytool store-credentials notary --apple-id you@example.com --team-id TEAMID --password xxxx-xxxx-xxxx-xxxx
   ```

   A 403 "required agreement is missing or has expired" means the Account Holder has to accept the
   current Program License Agreement at https://appstoreconnect.apple.com/agreements; it can take a
   while to propagate after that.
3. Put both variables in a `.env` at the repo root — gitignored, and Bun loads it when it runs the
   script — so plain `npm run compile:app` signs from now on:

   ```
   CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   NOTARY_PROFILE=notary
   ```

If Apple rejects a submission the script prints the submission output and exits;
`xcrun notarytool log <submission-id> --keychain-profile notary` has the reason.
