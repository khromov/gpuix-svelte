Everything installs from npm — `@gpuix/native` ships prebuilt, so there is no Rust toolchain to set up. Two things make the setup unusual.

**The runtime flags are mandatory, so a bin adds them.** `svelte` resolves through package *conditions*: without `--conditions custom-renderer --conditions development` Node picks Svelte's server build, which has no `mount()`, and the app dies before a window opens. `--import gpuix-svelte/register` installs the loader that compiles `.svelte` files on the fly through Node's `module.registerHooks`. `npx gpuix-svelte app.js` is those flags spelled out for you.

**Bun uses a different hook.** Bun has no `registerHooks`, so it takes the same compiler as a `--preload` (or a `bunfig.toml` preload) instead of `--import`; `gpuix-svelte --bun app.js` does that. Every script in this repo has a `bun:` twin, and the bin picks the runtime from whoever ran it, so `npm run tutorial` and `bun run tutorial` both work.

Requirements: **Node ≥ 26.1** or **Bun ≥ 1.4**. Svelte has to be the custom-renderer branch — this repo vendors one build under `vendor/`; your own project installs the PR's latest build from `pkg.svelte.dev`.

A successful start prints two lines:

```
[gpuix-svelte] created native window
[gpuix-svelte] mount complete
```
