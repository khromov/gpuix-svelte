# Rust host

The inversion of `rust-interop`: an existing Rust app keeps its `main`, its state and its
loop, and gets a GPUI window by spawning the gpuix-svelte UI as a child. The Rust process is
the model, the Svelte component is the view, and JSON lines on the child's stdin/stdout are
the bus. `rust/src/main.rs` is the whole Rust side (serde for the messages, nothing else);
`ui/` is the view, which holds no state of its own.

```bash
npm run demo:rust-host       # cargo build on first run, then the host spawns the UI
npm run bun:demo:rust-host
```

To ship, compile `ui/main.ts` with `gpuix-svelte/build` and have the host spawn that binary
from beside itself. Closing the window ends the child, the host sees EOF and exits.
