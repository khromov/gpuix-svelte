#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
out="$root/dist/txiki-ios"
target=${CARGO_TARGET_DIR:-"$out/cargo"}
: "${IOS_SIMULATOR_UDID:?Set IOS_SIMULATOR_UDID to a booted simulator}"
tmp=$(mktemp -d)
cleanup() {
  if [[ -n ${server:-} ]]; then kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true; fi
  rm -f "${file:-}"
  rm -rf "$tmp"
}
trap cleanup EXIT
xcrun simctl listapps "$IOS_SIMULATOR_UDID" > "$tmp/apps.plist"
url=$(/usr/libexec/PlistBuddy -c 'Print :com.apple.DocumentsApp:GroupContainers:group.com.apple.FileProvider.LocalStorage' "$tmp/apps.plist")
storage=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(urllib.parse.urlparse(sys.argv[1]).path))' "$url")
file="$storage/File Provider Storage/gpuix-txiki-upload-test.png"
if [[ -e "$file" ]]; then echo "Refusing to overwrite $file" >&2; file=; exit 1; fi
python3 "$root/test/txiki-ios/upload-server.py" "$file" "$tmp/ready" &
server=$!
for _ in {1..50}; do
  [[ -e "$tmp/ready" ]] && break
  if ! kill -0 "$server" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ ! -e "$tmp/ready" ]]; then echo 'Upload server failed to start' >&2; exit 1; fi
(cd "$root/test/txiki-ios" && xcodegen generate --spec project.test.yml)
xcodebuild -project "$root/test/txiki-ios/TxikiSvelteTests.xcodeproj" -scheme TxikiSvelteTests \
  -derivedDataPath "$out/UITestData" -destination "id=$IOS_SIMULATOR_UDID" \
  -parallel-testing-enabled NO "TXIKI_SOURCE=$root/.generated/txiki-ios/source-ios" "TXIKI_LIB=$out/libtxiki.a" \
  "GPUIX_RUST_LIB=$target/aarch64-apple-ios-sim/release/libgpuix_app.a" test
wait "$server"
server=
