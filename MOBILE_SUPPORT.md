# Mobile support

Mobile support is experimental. `gpuix-svelte mobile` bundles the app with Bun and builds a native
Android or iOS app with txiki.js and GPUI. The same Svelte renderer runs on the txiki worker; GPUI
owns the UI thread, and bounded requests and events cross between them. Mobile builds need a network
connection on first use to fetch pinned native sources, Rust and the platform toolchains.

```sh
gpuix-svelte mobile init
gpuix-svelte mobile build android
gpuix-svelte mobile run android --device <serial>
gpuix-svelte mobile build ios --simulator
gpuix-svelte mobile run ios --simulator --device <udid>
```

Configure entry, app ID, target SDKs and ABIs in `gpuix.mobile.json`. Android needs the SDK, NDK,
Java 17 or later, Gradle, Rust targets, `cargo-ndk`, CMake and Ninja. iOS needs Xcode, XcodeGen,
CMake, Ninja and the appropriate Rust target; a physical-device build also needs signing. Set
`TXIKI_SOURCE` to reuse an unmodified checkout of the pinned txiki revision and `CARGO_TARGET_DIR`
to share the Rust build cache. Generated files live under `.gpuix/mobile`.

`prompt_for_paths({ files: true })` opens the native document picker. Android copies selected files
into the app cache, while iOS requests sandbox copies; cached imports can be removed by the OS.
Directory selection and save dialogs depend on platform capabilities. Apps can read selected files
through the supported `node:fs` subset. Both `fs` and `fs/promises` support the common read, write,
append, metadata, directory and rename/remove operations; callbacks and promises defer delivery but
these operations block while the native filesystem runs. `path` and `os` expose common POSIX and app
directory helpers. This is not the complete Node API: streams, file descriptors and native addons
are not supported. txiki's own Web APIs, including fetch, are available. `render_hot` component
paths must be static so the bundle can import them; mobile self-updating is not supported.

Arm64 API 26, API 28 and API 36 Android emulators have passed rendering, input, timer, HTTPS, clipboard,
picker, lifecycle and multipart image-upload tests. An iOS simulator has passed rendering, input,
timer, HTTPS, selected-document import and selected-PNG multipart-upload tests. Native accessibility
nodes and actions have also been exercised on an Android emulator and an iOS simulator, but not
TalkBack or VoiceOver. An Android emulator's Vulkan software driver
faulted on image upload; the build selects GLES on detected Android emulators. Image and font bytes
are transferred in chunks, subject to a 256 MiB per-upload limit. Physical devices, signing,
assistive-technology workflows, long-running background execution and production network behavior
remain unvalidated.
