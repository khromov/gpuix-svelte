# txiki.js + gpuix-svelte on Android

This is an isolated Android app: `App.svelte` runs in txiki.js, `gpuix-svelte` compiles it to
renderer mutations, and GPUI renders and handles input in a `NativeActivity`. The app exercises
a counter, native text input, a timer, HTTPS fetch and image upload. It does not use Android views for its UI.

## Build and run

Install Bun, Node 24+, Rust with the `aarch64-linux-android` target, `cargo-ndk`, Java 24,
Gradle 9.4.1, Android SDK 36, NDK 29.0.14206865, CMake 3.22.1, Ninja and platform-tools.
Start an arm64 Android emulator with internet access, then:

```bash
bash test/txiki-android/build.sh
adb -s emulator-5554 install -r test/txiki-android/app/app/build/outputs/apk/debug/app-debug.apk
ANDROID_SERIAL=emulator-5554 python3 test/txiki-android/app-test.py
```

The build downloads the pinned txiki.js revision and its submodules under `dist/`, prepares the
GPUI dependencies, bundles Svelte and builds the APK. To reuse a checkout or a Cargo build cache,
set `TXIKI_SOURCE` or `CARGO_TARGET_DIR`; `TXIKI_SOURCE` must be an unmodified checkout of the
pinned revision with its submodules initialized. Set `GRADLE` to the Gradle executable and
`ANDROID_HOME` or `ANDROID_SDK_ROOT` if needed. The first build downloads and compiles substantial
native dependencies.

The emulator test force-stops this demo and exercises GPUI's accessibility tree, touchscreen
buttons, Android IME, txiki timers and HTTPS, file-picker cancellation, clipboard, background/resume,
rotation, and three Activity destruction/recreation cycles in the same process. It also selects a
256×256 PNG, sends its bytes to the renderer and verifies a multipart upload against a temporary
local HTTP server. It restores the emulator's rotation settings; screenshots and logcat are in
`dist/txiki-android/evidence/`.

## Architecture and limits

A Java worker owns a txiki.js runtime and its
libuv loop, while `gpuix-core::EmbeddedRenderer` stays on GPUI's foreground thread. They exchange
bounded JSON requests and replies through Java queues, and `tick` returns native events to Svelte.
No QuickJS values, contexts, opaque pointers or `rquickjs` bindings cross that boundary; the Rust
host has no `unsafe` blocks. JNI and the C/QuickJS and GPUI dependencies are native code and cannot
be described as memory-safe merely because this bridge avoids unsafe Rust. The worker observes
Activity shutdown, stops and frees txiki, and a new Activity creates a new session.

This is **an experimental app, not a complete replacement for the mobile runtime**. The adapter in
`src/txiki-native.ts` implements the renderer operations used here and several common window helpers, not the
entire `@gpuix/native` API. Android emulators use GLES after a Vulkan texture-upload crash.
Image and font bytes are transferred in chunks with a 256 MiB upload limit. Some Node builtins
are rejected during bundling rather than emulated. The bridge currently polls and serializes each
call, with a ten-second response timeout; its performance and shutdown during long-running JS or
network requests have not been characterized. FFI and WebAssembly are disabled in txiki.js, and
the full test passes on arm64 Android API 26, API 28 and API 36 emulators, not a physical device. An
earlier API 28 run stalled on HTTPS and timers, but the cause was not established and a later run
passed; this does not establish network reliability. The current debug APK is approximately 66 MiB;
this is not a measured release-size delta.

The pinned txiki.js/libuv needs a patch to build below API 28 with NDK 29. This fixture builds for
API 26; its emulator result does not establish physical-device compatibility.

## CLI probe

`ANDROID_SERIAL=emulator-5554 bash test/txiki-android/run.sh` independently cross-builds txiki.js
and runs its CLI through `adb shell`, checking a timer, SHA-256 and HTTPS. It needs Git, CMake,
Ninja, the Android SDK and NDK 29.0.14206865; it uses temporary directories and removes them at exit.
