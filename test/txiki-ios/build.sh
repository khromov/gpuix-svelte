#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
out="$root/dist/txiki-ios"
work="$root/.generated/txiki-ios"
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-"$out/cargo"}
export PATH="$HOME/Library/Android/sdk/cmake/3.22.1/bin:$PATH"
cd "$root"
source_dir=$(GPUIX_TXIKI_WORK="$work" bun -e "import { prepare_txiki } from './scripts/txiki-source.ts'; console.log(prepare_txiki('ios', process.env.GPUIX_TXIKI_WORK));" | tail -n 1)
node "$root/scripts/prepare-native-deps.mjs"
TXIKI_PLATFORM=ios bun "$root/test/txiki-android/bundle.ts"
cmake -S "$source_dir" -B "$work/build-prepared" -G Ninja \
  -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_SYSROOT=iphonesimulator \
  -DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_WITH_MIMALLOC=OFF -DBUILD_WITH_FFI=OFF \
  -DBUILD_WITH_WASM=OFF -DBUILD_WITH_SQLITE=OFF
cmake --build "$work/build-prepared" --target tjs -j "${JOBS:-8}"
find "$work/build-prepared" -name '*.a' -print > "$out/libraries.txt"
xcrun libtool -static -o "$out/libtxiki.a" -filelist "$out/libraries.txt"
sdk=$(xcrun --sdk iphonesimulator --show-sdk-path)
CLANG_PATH="$(xcrun --find clang)" BINDGEN_EXTRA_CLANG_ARGS="-isysroot $sdk" \
  IPHONEOS_DEPLOYMENT_TARGET=15.0 cargo build --manifest-path "$root/test/txiki-ios/native/Cargo.toml" \
  --lib --release --target aarch64-apple-ios-sim
(cd "$root/test/txiki-ios" && xcodegen generate --spec project.yml)
xcodebuild -project "$root/test/txiki-ios/TxikiSvelte.xcodeproj" -scheme TxikiSvelte \
  -configuration Debug -derivedDataPath "$out/DerivedData" \
  -destination 'generic/platform=iOS Simulator' ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  "TXIKI_SOURCE=$source_dir" "TXIKI_LIB=$out/libtxiki.a" \
  "GPUIX_RUST_LIB=$CARGO_TARGET_DIR/aarch64-apple-ios-sim/release/libgpuix_app.a" \
  CODE_SIGNING_ALLOWED=NO build
printf '\nApp: %s\n' "$out/DerivedData/Build/Products/Debug-iphonesimulator/TxikiSvelte.app"
