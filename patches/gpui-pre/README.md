# GPUI compatibility patch

The mobile stack uses published `gpui-pre` 0.3.6, SHA-256
`a0437c0b83e636a92bd1a39fa1d05fb632ae671289537497b35871ffbe231b84`,
corresponding to Zed revision `bcf6582ce3500df93a8a39366640173e6786cea6`.
`0.3.6.patch` is applied to that immutable crate, not to a GPUI checkout.
The crate's Apache-2.0 license is included in the downloaded source.

The patch retains painted bounds and pointer capture; virtual-list measurement,
layout and events; focus traversal; text-input requests and insets; outlines;
debug-frame statistics; and associated internal plumbing and tests. The manifest
adds `[workspace]` for a standalone Cargo root. Raw pixel creation instead uses
GPUI's public `RenderImage::new` in GPUIX. This patch has not been audited for
minimality or upstreamed.

Run `node scripts/prepare-native-deps.mjs` from the gpuix-svelte root; mobile
builds do so automatically. See `../README.md` for paths and requirements.
