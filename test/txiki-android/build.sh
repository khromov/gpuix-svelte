#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
sdk=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}
export ANDROID_HOME="$sdk"
export ANDROID_NDK_HOME=${ANDROID_NDK_HOME:-"$sdk/ndk/29.0.14206865"}
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-"$root/dist/txiki-android/cargo"}
export PATH="$sdk/cmake/3.22.1/bin:$sdk/platform-tools:$PATH"
cd "$root"
node scripts/prepare-native-deps.mjs
source_dir=$(GPUIX_TXIKI_WORK="$root/dist/txiki-android/work" bun -e "import { prepare_txiki } from './scripts/txiki-source.ts'; console.log(prepare_txiki('android', process.env.GPUIX_TXIKI_WORK));" | tail -n 1)
export TXIKI_SOURCE="$source_dir"
bun test/txiki-android/bundle.ts
case $(uname -s) in
  Darwin) host=darwin-x86_64 ;;
  Linux) host=linux-x86_64 ;;
  *) echo 'This build script supports macOS and Linux hosts' >&2; exit 1 ;;
esac
llvm="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$host"
export CLANG_PATH=${CLANG_PATH:-"$llvm/bin/clang"}
export BINDGEN_EXTRA_CLANG_ARGS="${BINDGEN_EXTRA_CLANG_ARGS:-} --sysroot=$llvm/sysroot"
(
  cd test/txiki-android/native
  cargo ndk -t arm64-v8a -P 26 -o "$root/test/txiki-android/app/app/src/main/jniLibs" build --lib --release
)
"${GRADLE:-gradle}" -p test/txiki-android/app assembleDebug
printf '\nAPK: %s\n' "$root/test/txiki-android/app/app/build/outputs/apk/debug/app-debug.apk"
