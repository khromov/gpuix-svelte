# Rust embed

One binary that is the whole app: Rust `main()` owns the process, an embedded Deno
([rustyscript](https://crates.io/crates/rustyscript), Deno's runtime as a crate) runs the
bundled gpuix-svelte view, `@gpuix/native` loads through Deno's Node-API, and the view calls
Rust closures directly. No addon of your own, no FFI, no child process.

```bash
npm run demo:rust-embed      # bundles ui/ with Bun, cargo builds rust/, runs the binary
```

What is where:

- `rust/src/main.rs` registers `rust_handle` and `rust_poll` with `register_function`, loads
  `dist/embed/boot.mjs` and lets `load_module` run the event loop until the window closes.
  `rust/build.rs` exports the `napi_*` symbols from the executable
  (`deno_napi::print_linker_flags`), which the addon resolves against at load.
- `bundle.ts` builds `ui/main.ts` into `dist/embed/app.mjs` with `@gpuix/native` left
  external and copied beside it with its `.node`, and writes `boot.mjs`, which installs the
  Node globals the embedding lacks (`process`, with this host's platform and arch, and
  `Buffer`) before importing the app.
- `ui/App.svelte` calls `rust.functions.rust_handle(msg)` for a reply and polls
  `rust_poll()` for what a Rust thread queued, since the embedding runs JS only from its
  own event loop.

`rust/Cargo.lock` is committed on purpose: the crates.io rustyscript pins a `deno_ast`
whose swc does not compile against serde 1.0.220+, so the lock holds serde 1.0.219 and the
few crates that would pull `serde_core` in.
