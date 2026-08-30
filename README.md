# gpuix-svelte

> ⚠️ **Work in progress.** Experimental — built on Svelte's unreleased
> [custom renderer API](https://github.com/sveltejs/svelte/pull/18511). Only tested on macOS for now, but will be
> compatible with macOS/Linux/Windows.

Svelte custom renderer for [GPUI](https://www.gpui.rs/) (Zed's GPU-accelerated UI framework), via
[`@gpuix/native`](https://www.npmjs.com/package/@gpuix/native). Native desktop windows from ordinary
Svelte components — no webview.

## Try it

Requires [Bun](https://bun.com). No Rust or other toolchains needed — the native binary comes
prebuilt from npm.

```bash
git clone https://github.com/khromov/gpuix-svelte
cd gpuix-svelte
bun install
bun run demo              # all four demos at once
bun run demo:counter      # counter — edit examples/counter/Counter.svelte and save to hot-reload
bun run demo:tictactoe    # tic-tac-toe with score tracking
bun run demo:hn           # Hacker News reader (live data, scrollable list)
bun run demo:glass        # liquid-glass control center (blurred translucent window)
bun run test              # headless renderer tests
```

## Use in your own project

```bash
bun add github:khromov/gpuix-svelte     # until it's on npm
bun add -d svelte@https://pkg.pr.new/svelte@18511
```

Register the `.svelte` loader in `bunfig.toml`:

```toml
preload = ["gpuix-svelte/plugin"]
```

```js
// app.js
import { render_hot } from "gpuix-svelte";

render_hot(new URL("./App.svelte", import.meta.url), {
  title: "Hello GPUI",
  width: 820,
  height: 560,
});
```

Run with both conditions flags — they are **required** (without them Svelte resolves to its server
build and `mount()` doesn't exist):

```bash
bun --conditions custom-renderer --conditions development app.js
```

See [HOWTO.txt](HOWTO.txt) for a few more details and troubleshooting notes.

## License

MIT
