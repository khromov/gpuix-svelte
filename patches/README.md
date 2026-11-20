# Native integration patches

The mobile backend uses a renderer-only GPUIX core and txiki.js. `gpuix/embedded.patch` and
`gpuix/mobile-parity.patch` apply the renderer changes to official `remorses/gpuix` revision
`a53b294401280014e94eb9bd98a7c7ed1929f92d`. The GPUI and GPUI Mobile patches add the platform
changes; `txiki/` carries the iOS and Android compatibility patches for the pinned runtime.

`node scripts/prepare-native-deps.mjs` downloads and verifies the GPUIX, GPUI and GPUI Mobile
archives, then applies the patches in `.generated`. The mobile CLI prepares them automatically.
The preparation refuses unmarked directories, caches verified archives and honors
`CARGO_NET_OFFLINE=true`. Run `node scripts/test-prepare-gpuix.mjs`,
`node scripts/test-prepare-gpui.mjs` and `node scripts/test-prepare-gpui-mobile.mjs` after changing
their respective patches.

The GPUIX archive does not populate upstream's `zed` submodule. The mobile renderer uses `gpui-pre`
and does not need it; that does not establish whether the upstream Node addon builds from this tree.
