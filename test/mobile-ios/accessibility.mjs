import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { read_mobile_config } from '../../scripts/mobile-config.ts';

const here = dirname(fileURLToPath(import.meta.url));
const example = resolve(here, '../../examples/mobile');
const ios = join(example, '.gpuix/mobile/ios');
const { name } = read_mobile_config('main.ts', example);
const device = process.env.IOS_SIMULATOR_UDID;
if (!device) throw new Error('Set IOS_SIMULATOR_UDID to a booted simulator; build examples/mobile for iOS first');
const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x86_64' : null;
if (!arch) throw new Error(`Unsupported simulator host architecture: ${process.arch}`);
const rust = arch === 'arm64' ? 'aarch64-apple-ios-sim' : 'x86_64-apple-ios';
const mobile = resolve(ios, '..');
const source = join(mobile, 'txiki/source-ios');
const library = join(mobile, `txiki/libtxiki-sim-${arch}.a`);
const target = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : join(mobile, 'native/target');
const rust_library = join(target, rust, 'release/libgpuix_app.a');
if (![source, library, rust_library].every(existsSync)) throw new Error('Build examples/mobile for the iOS simulator first, with the same CARGO_TARGET_DIR');
const spec = join(ios, 'accessibility.test.yml');
writeFileSync(spec, `include: [project.yml]
name: MobileAccessibilityTests
targets:
  AccessibilityTests:
    type: bundle.unit-test
    platform: iOS
    sources: [${JSON.stringify(join(here, 'AccessibilityTests.swift'))}]
    dependencies:
      - target: ${JSON.stringify(name)}
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: dev.gpuix.accessibility.tests
        GENERATE_INFOPLIST_FILE: YES
        TEST_HOST: ${JSON.stringify(`$(BUILT_PRODUCTS_DIR)/${name}.app/${name}`)}
        BUNDLE_LOADER: "$(TEST_HOST)"
schemes:
  MobileAccessibilityTests:
    build:
      targets:
        ${JSON.stringify(name)}: all
        AccessibilityTests: test
    test:
      targets: [AccessibilityTests]
`);
/** @type {[string, string[]][]} */
const commands = [
  ['xcodegen', ['generate', '--spec', spec]],
  ['xcodebuild', ['-project', join(ios, 'MobileAccessibilityTests.xcodeproj'), '-scheme', 'MobileAccessibilityTests', '-derivedDataPath', join(ios, 'AccessibilityDerivedData'), '-destination', `id=${device}`, '-parallel-testing-enabled', 'NO', `TXIKI_SOURCE=${source}`, `TXIKI_LIB=${library}`, `GPUIX_RUST_LIB=${rust_library}`, 'CODE_SIGNING_ALLOWED=NO', 'test']]
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: ios, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed`, { cause: result.error ?? result.status });
}
