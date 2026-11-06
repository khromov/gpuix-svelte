# Rust interop

Four ways for a gpuix-svelte app to exchange messages with existing Rust code, none of
which touch `@gpuix/native`. `rust/` is a tiny cargo workspace: `hello-core` is the "existing
code" (a command interpreter that knows nothing about JS), and the other crates are the
same four lines of glue each transport needs.

| transport | crate | JS → Rust | Rust → JS | runtimes | adding an existing Rust app |
| --- | --- | --- | --- | --- | --- |
| Child process | `hello-stdio` (binary) | a line on stdin | a line on stdout, any time | Node, Bun, compiled binary | **Easiest.** Keep the binary and its `main`; add a stdin/stdout loop (or use the CLI it already has). No crate-type, dependency or build changes, and it can stay in its own repo |
| C ABI | `hello-ffi` (cdylib) | `bun:ffi` / `node:ffi` call | Bun: threadsafe `JSCallback`; Node: polled queue | Bun; Node 26 with `--experimental-ffi` | **Moderate.** The app becomes a `cdylib` (no `main`), and every exposed function needs a hand-written `unsafe extern "C"` wrapper with explicit string ownership and a `free` the JS side must call |
| Node-API | `hello-napi` (napi-rs) | `require()`d function | `ThreadsafeFunction` | Node, Bun | **Moderate, least code.** `cdylib`, two dependencies and a three-line `build.rs`, then `#[napi]` on the functions to expose: strings, numbers, objects and callbacks convert for you. macOS needs the `dynamic_lookup` link flags |
| WebAssembly | `hello-wasm` (wasm32) | bytes in linear memory | imported `emit()`; the host drives any clock | Node, Bun, browser build | **Hardest.** Everything the app depends on must compile for `wasm32`: no threads, files, sockets or native crates. I/O is byte copies into linear memory unless you add wasm-bindgen |

```bash
npm run demo:rust            # builds rust/ with cargo on first run, then opens the window
npm run bun:demo:rust
npm run test:rust-interop    # the same app headless: four replies per click, a push from each
```

Needs a Rust toolchain (`rustup`, with the `wasm32-unknown-unknown` target). `CARGO` points
at a cargo not on PATH.
