#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
: "${IOS_SIMULATOR_UDID:?Set IOS_SIMULATOR_UDID to a booted simulator}"
product="$root/examples/mobile/.gpuix/mobile"
target=${CARGO_TARGET_DIR:-"$product/native/target"}
arch=$(uname -m)
case "$arch" in arm64) rust=aarch64-apple-ios-sim ;; x86_64) rust=x86_64-apple-ios ;; *) echo "Unsupported host: $arch" >&2; exit 1 ;; esac
apps=$(mktemp)
trap 'rm -f "$apps" "${file:-}"' EXIT
xcrun simctl listapps "$IOS_SIMULATOR_UDID" > "$apps"
url=$(/usr/libexec/PlistBuddy -c 'Print :com.apple.DocumentsApp:GroupContainers:group.com.apple.FileProvider.LocalStorage' "$apps")
storage=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(urllib.parse.urlparse(sys.argv[1]).path))' "$url")
file="$storage/File Provider Storage/gpuix-mobile-test.txt"
if [[ -e "$file" ]]; then echo "Refusing to overwrite $file" >&2; file=; exit 1; fi
printf 'chosen document works' > "$file"
mkdir -p "$root/dist/txiki-ios-product"
xcodegen generate --spec "$root/test/txiki-ios/product.test.yml"
xcodebuild -project "$root/test/txiki-ios/ProductMobileTests.xcodeproj" -scheme ProductMobileTests \
  -derivedDataPath "$root/dist/txiki-ios-product/DerivedData" -destination "id=$IOS_SIMULATOR_UDID" \
  -parallel-testing-enabled NO "TXIKI_SOURCE=$product/txiki/source-ios" "TXIKI_LIB=$product/txiki/libtxiki-sim-$arch.a" \
  "GPUIX_RUST_LIB=$target/$rust/release/libgpuix_app.a" CODE_SIGNING_ALLOWED=NO test
