# gpui-mobile compatibility patch

The mobile build uses upstream `itsbalamurali/gpui-mobile` revision
`5fd54f4554263ae06753e90472c7f2e2ff5d7495`, archive SHA-256
`fb062e5ac28e866edf98018020e657d2b4e92677dbba1e84c9e975f8a18656ac`.
Upstream's Apache-2.0, GPL and AGPL license texts remain in the prepared source.
`5fd54f.patch` carries our downstream changes, including the reusable Android
Gradle library, lifecycle and surface management, insets, keyboard handling and
iOS changes. Rename detection keeps relocated Java files as moves. This is not
an audit proving all changes are minimal or have been upstreamed.

Run `node scripts/prepare-native-deps.mjs` from the gpuix-svelte root; mobile
builds do so automatically. See `../README.md` for paths and requirements.
