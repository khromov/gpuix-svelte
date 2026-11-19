#!/usr/bin/env bash
set -euo pipefail

revision=c13adc667e3e7761ff4d0c12a6ea34efceb4e1ea
root=$(cd "$(dirname "$0")/../.." && pwd)
sdk=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}
ndk=${ANDROID_NDK_HOME:-"$sdk/ndk/29.0.14206865"}
cmake_dir=${ANDROID_CMAKE_BIN:-"$sdk/cmake/3.22.1/bin"}
export PATH="$cmake_dir:$sdk/platform-tools:$PATH"

work=$(mktemp -d "${TMPDIR:-/tmp}/gpuix-txiki-android.XXXXXXXX")
remote="/data/local/tmp/gpuix-txiki-$$"
cleanup() {
  adb shell rm -rf "$remote" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

git init -q "$work/txiki"
git -C "$work/txiki" remote add origin https://github.com/saghul/txiki.js.git
git -C "$work/txiki" fetch --depth 1 origin "$revision"
git -C "$work/txiki" checkout --detach FETCH_HEAD
git -C "$work/txiki" submodule update --init --recursive --depth 1
cmake -S "$work/txiki" -B "$work/build" -G Ninja \
  -DCMAKE_TOOLCHAIN_FILE="$ndk/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=28 \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_WITH_FFI=OFF -DBUILD_WITH_WASM=OFF
cmake --build "$work/build" --target tjs-cli -j "${JOBS:-4}"
adb shell mkdir -p "$remote"
adb push "$work/build/tjs" "$remote/tjs"
adb push "$root/test/txiki-android/probe.js" "$remote/probe.mjs"
adb shell chmod 755 "$remote/tjs"
adb shell "$remote/tjs" run "$remote/probe.mjs"
