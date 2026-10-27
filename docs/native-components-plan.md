# Plan: Rust component libraries in gpuix-svelte

Internal design note, not a docs page. Status and decisions as of 2026-10-24.

## Goal

Render components from Rust GPUI libraries, [Ely](https://git.zacharyzhang.com/ZacharyZhang-NY/Ely-GPUI-Components)
first and any other later, from Svelte markup: `<ely-button variant="primary" onclick>`
or `import { Button } from '@gpuix-svelte/ely'`, with the same `style`, events,
children and headless tests as every other element.

## Constraints nothing here can engineer around

- **Rust has no stable ABI and no reflection.** A GPUI component is a Rust type
  compiled against one exact gpui. Ely pins `gpui-pre =0.3.8` from crates.io;
  gpuix builds its own fork from the `zed` submodule. A library is usable only
  if it compiles against the fork, via a `gpui-pre` shim crate re-exporting the
  fork under `[patch.crates-io]`. Every exposed component needs a small Rust
  adapter mapping JSON props to its builder; a macro can shrink it, nothing can
  derive it (Ely has no component manifest).
- **One addon per process.** Node never unloads a `.node`, and GPUI's
  platform, device and window live inside it. Two libraries means one binary
  that links both, so one `cargo build` that lists both.
- **Someone runs `cargo`.** Consumers who want Rust components build an addon,
  or install a prebuilt one somebody else built. The toolchain is a one-line
  install plus the Metal toolchain on macOS; the cold build of gpui is minutes
  and GBs, then seconds incremental.

## Decisions

| Question | Decision |
|---|---|
| Distribution | The **app-native crate is the primitive**; prebuilt packs are sugar. `create-gpuix-svelte --native` scaffolds `native/`, and `@gpuix-svelte/ely` ships a CI-built `.node` for the zero-Rust case. |
| Upstream | Changes to `@gpuix/native` live on `khromov/gpuix` branch `feat/native-plugins`; an issue draft (`../gpuix/ISSUE.md`) goes to remorses/gpuix. No PR. |
| Svelte API | Both. Raw tags (`<ely-button>`) are the contract, typed through a `gpuixHTML.IntrinsicElements` augmentation; `.svelte` wrappers generated from the manifest sit on top. |
| Theming | Ely's theme is the source. `set_theme_mode('dark')` flips it natively and the pack exports Ely's tokens as `--ely-*` CSS vars for the app's own `<style>` rules. |

## Layers

```
Svelte markup  <ely-button variant="primary" onclick>  /  <Button> wrapper
      │  createElement(id,'ely-button') · setCustomProp · setEventListener   (unchanged protocol)
gpuix-svelte   renderer.ts: tag + event tables from the binary's manifest, not hand-kept
      │  NAPI_RS_NATIVE_LIBRARY_PATH (or bin flag) picks the addon
addon (.node)  app-native crate: gpuix-native (rlib) + packs + libraries, one cargo build
      │  register_element_factory / register_app_init / listElementTypes
@gpuix/native  custom_elements: CustomElementFactory → CustomElement (render, set_prop, events)
      │
GPUI fork      zed/crates/gpui  ←  gpui-pre shim  ←  Ely / GPUI Component
```

### Native (on the gpuix branch)

`custom_elements` is public along with `custom_surface`, `wire_standard_events`,
`GpuixView`, `EventCallback`, `emit_event_full` and `point_to_xy`.
`register_element_factory(make)` and `register_app_init(init)` are
process-global and are called from the pack's `#[module_init]`, before the
first `GpuixRenderer`; `with_defaults()` appends registered factories after the
built-ins, `run_app_inits(cx)` runs beside `input::init(cx)` at every app start
(embedded macOS, Windows/Linux, web, `TestGpuixRenderer`). `listElementTypes()`
returns `{ elementType, props, events }` per custom type by probing a throwaway
instance. `packages/native-plugin-example` is the pattern: a `cdylib` with
`napi-build`, `gpuix-native` + `gpui` by path, a `<badge>` type, and
`codegen-units = 1` / fat LTO so gpuix-native's `#[napi]` constructor statics
survive linking.

### A pack crate (`gpuix-ely`)

An rlib of adapters, one `CustomElementFactory` per Ely component, plus
`pub fn register()` calling the two hooks and `ely_gpui_component::init(cx)`.
Each adapter:

- maps `set_prop` JSON to the builder (`variant`, `size`, `disabled`, `label`);
  accepts both `true` and `"true"`, since Svelte sends static attributes as text;
- wraps the component in `custom_surface()` so `style`, `hover`/`active`,
  bounds, `role`/`aria-*` and the standard mouse events work;
- forwards `ctx.children` into container components (Card, Dialog, Stack) and
  takes a `label` prop for leaf components whose content is a string;
- for stateful components (inputs, selects, switches) follows the `<input>`
  adapter: controlled `value`/`checked` prop in, `change` event out through
  `emit_event_full`, listed in `supported_events`;
- gets the theme from Ely's global, so it needs no per-element colour props.

A `gpuix_adapter!` macro for the leaf-component shape (props → builder calls,
one click event) is worth writing once there are ten adapters, not before.

### The app-native crate (scaffolded)

```
native/
  Cargo.toml      gpuix-native + gpui by path or git, gpuix-ely, [patch.crates-io] gpui-pre = { path = "gpui-pre-shim" }
  gpui-pre-shim/  crate named gpui-pre, version 0.3.8, `pub use gpui::*`
  build.rs        napi_build::setup()
  src/lib.rs      #[module_init] fn register() { gpuix_ely::register(); my_elements::register(); }
```

`npm run native:build` is `napi build --platform --release` into
`native/gpuix-app.<platform>.node`; `npm run native:check` is `cargo check`.
The scaffold's `.github/workflows/native.yml` builds darwin-arm64, linux-x64
and win32-x64 on push and uploads them as artifacts, so a consumer who is not
changing Rust downloads instead of installing cargo locally.

### gpuix-svelte changes

1. **Manifest-driven tables.** `renderer.ts` replaces `GPUI_TAGS`,
   `INTERACTIVE_TAGS` and `GPUI_EVENTS` with a registry seeded from
   `listElementTypes()` on the loaded native (falling back to the current
   constants when the method is missing, native < 0.12). An unknown tag no
   longer degrades to `div` when the binary knows it, and an event the manifest
   lists reaches `to_gpui_event`. `test.ts` seeds the same registry from
   `TestGpuixRenderer`'s binary, so the example plugin's `<badge>` is testable
   headlessly with the existing helpers.
2. **Picking the addon.** `bin/gpuix-svelte.js` gets `--native <path>` and reads
   `"gpuix-svelte": { "native": "native/gpuix-app.node" }` from the app's
   `package.json`, and sets `NAPI_RS_NATIVE_LIBRARY_PATH` for the child. The
   `.node` is a build-time input for `scripts/compile.ts` too, which must embed
   that file instead of `@gpuix/native`'s prebuild (`resolve_native_cjs`).
3. **Types.** A pack ships `elements.d.ts` augmenting
   `gpuixHTML.IntrinsicElements`; `scripts/elements-dts.ts` generates it from a
   manifest JSON the pack's build emits, with prop types from a hand-kept
   `schema.json` beside the adapters (the native manifest has names only).
4. **Wrappers.** `@gpuix-svelte/ely` ships `.svelte` wrappers generated from
   the same schema: typed props, `children` snippet mapped to the tag's
   children, `onclick`/`onchange` spread through. Hand-written where the
   component needs it (Dialog with `open` state, Select with items).
5. **Theme bridge.** The pack exports `theme(mode)` (a `#[napi]` fn returning
   Ely's tokens) and `set_theme_mode(mode)`; `@gpuix-svelte/ely`'s `apply_theme`
   calls both and feeds the tokens to `set_css_vars` as `--ely-*`.
6. **Docs.** A `docs/native-components.md` page (and a `PAGES` entry) once the
   scaffold ships; until then this note.

## Open points

- **gpui drift.** Whether Ely compiles against the fork through the shim is the
  first spike (compile only, no adapters). If it does not, the fork needs to
  track the gpui-pre release Ely pins, which is an upstream conversation.
- **napi exports from the rlib.** `codegen-units = 1` + fat LTO is a linker
  argument, not a guarantee; the robust fix is an `export_napi!()` macro in
  gpuix-native. Raised in the issue.
- **Prop types.** The native manifest carries prop names only, so static
  attributes arrive as strings. Adapters parse loosely; `schema.json` types the
  Svelte side.
- **Web.** Packs need their own wasm-bindgen build of the addon; out of scope.
- **Building on this machine.** The gpui Apple backend compiles its shaders in
  a build script, which needs `xcrun metal`. `xcode-select` points at the
  Command Line Tools, which lack it; `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
  in front of `cargo` is enough. The example pack was built and smoke-tested
  that way: its binary exports everything `@gpuix/native` does plus its own,
  the manifest lists `badge`, and `TestGpuixRenderer` renders and clicks it.

## Milestones

1. Spike: Ely against the fork via the shim, `cargo check` only.
2. gpuix branch (done, smoke-tested): hooks, manifest, example pack, README, changeset, issue draft.
3. gpuix-svelte: manifest-driven tables, `--native` flag, headless test over the example pack.
4. `gpuix-ely` with ten components (Button, Badge, Switch, Checkbox, Input, Select, Card, Tabs, Tooltip, Dialog), theme bridge, wrappers.
5. Scaffold `--native`, CI workflow, prebuilt `@gpuix-svelte/ely`.
6. Docs page.
