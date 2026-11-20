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
gpuix-svelte mobile run android --device <serial> --watch
gpuix-svelte mobile build android --release
```

Configure entry, app ID, version, build number, target SDKs and ABIs in `gpuix.mobile.json`. Optional
`icon` names a square PNG (1024×1024 for iOS). `--release` builds an Android release APK and AAB or
an iOS Release app; Android releases are unsigned unless `GPUIX_ANDROID_KEYSTORE` (absolute path),
`GPUIX_ANDROID_STORE_PASSWORD`, `GPUIX_ANDROID_KEY_ALIAS` and `GPUIX_ANDROID_KEY_PASSWORD` are set.
iOS distribution still requires an Xcode archive, signing and export. Increase
`buildNumber` for every distributed build; it becomes Android's version code and iOS's bundle version.
`mobile init` defaults to the
starter's `app.ts`; set `entry` to your own entry file if it differs. Android needs the SDK, NDK,
Java 17 or later, Rust targets, `cargo-ndk`, CMake and Ninja. The CLI uses `GRADLE`, a project
wrapper, Gradle on `PATH`, or a cached Gradle 9.4.1 distribution, in that order. If none is present,
it downloads the verified Gradle 9.4.1 wrapper and distribution on first build. iOS needs Xcode,
XcodeGen, CMake, Ninja and the appropriate Rust target; a physical-device build also needs signing.
Install the tools with `brew install cmake ninja xcodegen`, or use the CMake and Ninja installed in
the Android SDK by Android Studio. Set
`TXIKI_SOURCE` to reuse an unmodified checkout of the pinned txiki revision and `CARGO_TARGET_DIR`
to share the Rust build cache. Generated files live under `.gpuix/mobile`.

`prompt_for_paths({ files: true })` opens the native document picker. Android copies selected files
into the app cache, while iOS requests sandbox copies; cached imports can be removed by the OS.
Directory selection and save dialogs depend on platform capabilities. Apps can read selected files
through the supported `node:fs` subset. Both `fs` and `fs/promises` support the common read, write,
append, metadata, directory, temporary-directory and rename/remove operations. Callback and promise operations run on a
native worker, while the `Sync` variants block the JS thread. Unencoded reads return a `Buffer`, and
individual reads are capped at 32 MiB. Directory reads support string and Buffer encodings, including
Buffer-named `Dirent`s. `path` exposes common POSIX operations including `relative`, `parse` and
`format`; `os` exposes app directory helpers. `node:url` provides `URL`, `URLSearchParams`,
`fileURLToPath` and `pathToFileURL` with POSIX file paths; it is not the full Node URL API.
This is not the complete Node API: streams, file descriptors, arbitrary child processes and native
addons are not supported. The `open`, `xdg-open` and Windows `start` URL-launching patterns use the
platform URL opener. Relative filesystem paths resolve against `process.cwd()`, the app's data
directory. txiki's Web APIs, including fetch, are available. Image and font imports and static
`new URL('./file', import.meta.url)` resources are packaged with the app. To package paths assembled
at runtime, list project-relative files or directories in `assets` in `gpuix.mobile.json` and read
`asset_path('assets/example.png')` from `gpuix-svelte`. A directory URL such as `new URL('.', import.meta.url)`
points at the bundled module's directory and does not package the source directory's contents.
A desktop layout is not automatically redesigned for a phone: fixed widths and non-wrapping rows may
clip, so use width media queries and flexible layouts where needed.
`render_hot` component paths must be static;
`mobile run --watch` rebuilds and relaunches when files inside the project change, rather than preserving
in-memory state. A desktop update configuration does not prevent a mobile app from starting, but update
checks return no update: install mobile releases through the platform's distribution mechanism.

Arm64 API 26, API 28 and API 36 Android emulators have passed rendering, input, timer, HTTPS, clipboard,
picker, lifecycle and multipart image-upload tests. An iOS simulator has passed rendering, input,
timer, HTTPS, selected-document import and selected-PNG multipart-upload tests. Native accessibility
nodes and some actions have also been exercised on an Android emulator and an iOS simulator, but the
new slider adjustment actions and TalkBack or VoiceOver workflows have not. An Android emulator's Vulkan software driver
faulted on image upload; the build selects GLES on detected Android emulators. Image and font bytes
are transferred in chunks, subject to a 32 MiB per-upload limit and the runtime's 128 MiB heap.
Android Back dismisses the top layer, then navigates the UI router, then returns to the system; the
keyboard handles Back first. Captured mouse drags also accept touch, and a long press invokes a
secondary-click handler or temporarily shows a tooltip. The generic CSS font families `monospace`,
`sans-serif`, `serif` and their `ui-*` variants map to system fonts on mobile. Physical devices, signing,
assistive-technology workflows, long-running background execution and production network behavior
remain unvalidated.
