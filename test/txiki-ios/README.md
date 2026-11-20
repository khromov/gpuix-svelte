# txiki.js + gpuix-svelte on iOS

This is an arm64 iOS Simulator proof of concept using the same Svelte counter and renderer adapter
as `test/txiki-android`. The counter is rendered by GPUI, not UIKit views. txiki.js runs on a worker
thread; GPUI and `gpuix-core::EmbeddedRenderer` run on the iOS foreground thread.

## Build and test

On Apple Silicon, install Xcode and its iOS Simulator runtime, XcodeGen, Bun, Node 24+, Rust with
`aarch64-apple-ios-sim`, CMake, Ninja and Git. Start an iOS simulator with internet access.
The build script also adds the Android SDK's CMake 3.22.1 directory to `PATH` if installed; any
compatible CMake and Ninja already on `PATH` work.

```sh
bash test/txiki-ios/build.sh
xcrun simctl install booted dist/txiki-ios/DerivedData/Build/Products/Debug-iphonesimulator/TxikiSvelte.app
xcrun simctl launch booted dev.gpuix.txikisvelte
IOS_SIMULATOR_UDID=<booted-udid> bash test/txiki-ios/test.sh
```

The build prepares the pinned txiki.js revision and its submodules under `.generated/txiki-ios/source-ios`,
applies the shared iOS patch, builds the native libraries, and bundles the Svelte app. To reuse a clean
checkout or Cargo cache set `TXIKI_SOURCE` or `CARGO_TARGET_DIR` for both build and test. The patch
avoids macOS-only `libproc` socket inspection on iOS; only the socket type is reported there. FFI,
WASM, SQLite and mimalloc are disabled.

The XCTest drives real simulator touches and keyboard keys and uses Vision OCR on GPUI's pixels.
It checks a counter tap, text input and save, timer progression, HTTPS, pixel upload, clipboard,
file-picker cancellation, a selected PNG passed to the renderer and uploaded as multipart to a local
server, background/resume, rotation, and termination and relaunch. The test creates and removes a
file named `gpuix-txiki-upload-test.png` in the simulator's local Files storage. It was run on an
iPhone 17 Pro simulator with iOS 26.4 and Xcode 27.2;
it is not a physical-device, App Store, VoiceOver or memory-safety test.

To test the generated `examples/mobile` app's actual Files picker, build it for the simulator and
run `IOS_SIMULATOR_UDID=<booted-udid> bash test/txiki-ios/product-test.sh`. That test seeds and
removes `gpuix-mobile-test.txt` in the simulator's local Files storage.

## Bridge and limits

A private app-sandbox file hands the worker an ephemeral loopback port and a random authentication
token. A bounded JSON request/reply stream connects it to the foreground Rust host, which polls
nonblocking. QuickJS values, contexts and runtime opaque pointers do not cross the bridge, and the
Rust host contains no `unsafe` blocks. C, QuickJS, libuv and GPUI are still native code; this is not
a guarantee that the stack is memory-safe. Socket timeouts bound a worker waiting for a reply, but
shutdown while a network request or long-running script is in flight is not proven. The bridge's
polling, serialization cost and local-network behavior on physical devices are not characterized.

This fixture is not a physical-device packaging test or a complete runtime parity test. It targets
only the arm64 simulator and exposes the same selected renderer operations as
the Android prototype, not all `@gpuix/native` APIs. Image and font bytes use the JSON bridge in
chunks, with a 256 MiB upload limit. Physical devices, signing, distribution, process suspension and background
execution policies still need work. Both prototypes use `native/txiki-host`'s dispatch table.
