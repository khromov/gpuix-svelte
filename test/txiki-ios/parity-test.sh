#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
: "${IOS_SIMULATOR_UDID:?Set IOS_SIMULATOR_UDID to a booted simulator}"
: "${MOBILE_PARITY_PROJECT:?Set MOBILE_PARITY_PROJECT to the fixture project directory}"
product="$MOBILE_PARITY_PROJECT/.gpuix/mobile"
target=${CARGO_TARGET_DIR:-"$product/native/target"}
arch=$(uname -m)
case "$arch" in arm64) rust=aarch64-apple-ios-sim ;; x86_64) rust=x86_64-apple-ios ;; *) echo "Unsupported host: $arch" >&2; exit 1 ;; esac
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
python3 - "$work/project.yml" "$product/ios/project.yml" "$root/test/txiki-ios/MobileParityTests.swift" <<'PY'
import json, sys
q = json.dumps
with open(sys.argv[1], 'w') as f:
    f.write(f'''include: [{q(sys.argv[2])}]
name: MobileParityTests
targets:
  MobileParityTests:
    type: bundle.ui-testing
    platform: iOS
    sources: [{q(sys.argv[3])}]
    dependencies:
      - target: Mobile Parity
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: dev.gpuix.mobileparity.uitests
        GENERATE_INFOPLIST_FILE: YES
        TEST_TARGET_NAME: Mobile Parity
schemes:
  MobileParityTests:
    build:
      targets:
        Mobile Parity: all
        MobileParityTests: test
    test:
      targets: [MobileParityTests]
''')
PY
xcodegen generate --spec "$work/project.yml"
xcodebuild -project "$work/MobileParityTests.xcodeproj" -scheme MobileParityTests \
  -derivedDataPath "$work/DerivedData" -destination "id=$IOS_SIMULATOR_UDID" \
  -parallel-testing-enabled NO "TXIKI_SOURCE=$product/txiki/source-ios" "TXIKI_LIB=$product/txiki/libtxiki-sim-$arch.a" \
  "GPUIX_RUST_LIB=$target/$rust/release/libgpuix_app.a" CODE_SIGNING_ALLOWED=NO test
