#!/usr/bin/env node
// Prebuild the entire Rust mobile library so consumers skip compilation.
//
// The mobile build compiles a Rust crate (gpuix-app) whose only source files
// are android.rs and ios.rs from native/mobile/. These are identical across
// all consumers, so the entire compiled library is shareable.
//
// This script compiles the exact same crate the mobile build would compile,
// producing libgpuix_app.so (Android) or libgpuix_app.a (iOS) for each target.
// The consumer's build then copies the prebuilt instead of running cargo.
//
// Usage: node scripts/build-prebuilt.mjs [--android] [--ios] [--all]
//
// Output: native/prebuilt/<platform>/<abi>/libgpuix_app.<so|a>

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = join(root, 'scripts');
const gpuix = join(root, '.generated/gpuix');
const prebuilt = join(root, 'native/prebuilt');
const ndkVersion = '29.0.14206865';
const iosDeploymentTarget = '16.0';

// Pinned revisions — must match the values in prepare-*.mjs scripts
const gpuixRevision = 'a53b294401280014e94eb9bd98a7c7ed1929f92d';
const gpuiMobileRevision = '5fd54f4554263ae06753e90472c7f2e2ff5d7495';
const gpuiPreVersion = '0.3.6';
const txikiRevision = 'c13adc667e3e7761ff4d0c12a6ea34efceb4e1ea';

/** @param {string} cmd @param {string[]} args @param {string} cwd @param {NodeJS.ProcessEnv} [env] */
function run(cmd, args, cwd, env) {
  env = env || {};
  const result = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error(`[prebuilt] ${cmd} ${args.join(' ')} failed: ${result.error?.message ?? result.status}`);
  }
}

/** @param {string} cmd @param {string[]} args @param {string} [cwd] @param {NodeJS.ProcessEnv} [env] */
function output(cmd, args, cwd, env) {
  env = env || {};
  const result = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout?.trim()) {
    throw new Error(`[prebuilt] ${cmd} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout.trim();
}

/**
 * Create the exact same Cargo workspace the mobile build generates,
 * then compile it for the given target.
 * @param {string} platform
 * @param {string} abi
 * @param {string} target
 * @param {NodeJS.ProcessEnv} env
 * @param {boolean} isNdk
 */
function build_for_target(platform, abi, target, env, isNdk = false) {
  console.log(`[prebuilt] building ${platform} ${abi} (${target})...`);

  const work = join(prebuilt, '.build-work', `${platform}-${abi}`);
  if (existsSync(work)) rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  // Recreate the exact structure the mobile scaffold() produces
  const nativeDir = join(work, 'native');
  const srcDir = join(nativeDir, 'src');
  mkdirSync(srcDir, { recursive: true });

  /** @param {string} v */
  const esc = (v) => JSON.stringify(v);
  const gpuixPath = join(root, '.generated/gpuix');

  // Write Cargo.toml — identical to what rust_files() generates
  writeFileSync(join(nativeDir, 'Cargo.toml'), `[package]
name = "gpuix-app"
version = "0.1.0"
edition = "2021"
publish = false
[lib]
name = "gpuix_app"
crate-type = ["staticlib", "cdylib"]
[dependencies]
gpui = { package = "gpui-pre", version = "=0.3.6", default-features = false }
gpuix-core = { path = ${esc(join(gpuixPath, 'packages/core'))} }
gpuix-svelte-txiki-host = { path = ${esc(join(root, 'native/txiki-host'))} }
gpui-mobile = { path = ${esc(join(gpuixPath, '.generated/gpui-mobile'))}, default-features = false, features = ["path_provider"] }
serde_json = "1"
anyhow = "1"
[target.'cfg(target_os = "android")'.dependencies]
android-activity = { version = "0.6", features = ["native-activity"] }
android_logger = "0.15"
jni = "0.22"
log = "0.4"
[patch.crates-io]
gpui-pre = { path = ${esc(join(gpuixPath, '.generated/gpui-pre'))} }
gpui-pre-wgpu = { path = ${esc(join(gpuixPath, '.generated/gpui-pre-wgpu'))} }
`);

  // Copy the exact source files the mobile build uses
  writeFileSync(join(srcDir, 'lib.rs'), '#[cfg(target_os = "android")]\nmod android;\n#[cfg(target_os = "ios")]\nmod ios;\n');
  copyFileSync(join(root, 'native/mobile/android.rs'), join(srcDir, 'android.rs'));
  copyFileSync(join(root, 'native/mobile/ios.rs'), join(srcDir, 'ios.rs'));

  const cargoTarget = join(work, 'target');
  const buildEnv = { ...env, CARGO_TARGET_DIR: cargoTarget };

  const outDir = join(prebuilt, platform, abi);
  mkdirSync(outDir, { recursive: true });

  if (isNdk) {
    // Android: cargo-ndk -o sets the parent dir, then creates <abi>/ subdirectory
    // We use a temp parent so we can extract the .so to our flat output dir
    const ndkOut = join(work, 'ndk-out');
    mkdirSync(ndkOut, { recursive: true });
    run('cargo', ['ndk', '-t', abi, '-P', '26', '-o', ndkOut, 'build', '--manifest-path', join(nativeDir, 'Cargo.toml'), '--lib', '--release'], nativeDir, buildEnv);
    // cargo-ndk places the .so at <ndkOut>/<abi>/libgpuix_app.so
    const soSrc = join(ndkOut, abi, 'libgpuix_app.so');
    if (existsSync(soSrc)) {
      copyFileSync(soSrc, join(outDir, 'libgpuix_app.so'));
    }
  } else {
    // iOS: cargo build outputs to target/<triple>/release/
    run('cargo', ['build', '--manifest-path', join(nativeDir, 'Cargo.toml'), '--lib', '--release', '--target', target], nativeDir, buildEnv);
    const targetDir = join(cargoTarget, target, 'release');
    const libSrc = join(targetDir, 'libgpuix_app.a');
    if (existsSync(libSrc)) {
      copyFileSync(libSrc, join(outDir, 'libgpuix_app.a'));
    }
  }

  // Clean up work dir
  rmSync(work, { recursive: true, force: true });
  console.log(`[prebuilt] ${platform} ${abi} → ${join(outDir, platform === 'android' ? 'libgpuix_app.so' : 'libgpuix_app.a')}`);
}

async function main() {
  const args = process.argv.slice(2);
  const buildAndroid = args.includes('--android') || args.includes('--all') || args.length === 0;
  const buildIos = args.includes('--ios') || args.includes('--all') || args.length === 0;

  // Step 1: Prepare native dependencies
  console.log('[prebuilt] preparing native dependencies...');
  const prepareResult = spawnSync(process.execPath, [join(scripts, 'prepare-native-deps.mjs')], {
    stdio: 'inherit',
    env: process.env,
  });
  if (prepareResult.error || prepareResult.status !== 0) {
    console.error('[prebuilt] failed to prepare native dependencies');
    process.exit(1);
  }

  // Verify prepared sources
  /** @param {string} path @param {string} label */
  const verifyMarker = (path, label) => {
    const marker = join(path, '.gpuix-prepared');
    if (!existsSync(marker)) {
      throw new Error(`[prebuilt] ${label} not prepared: ${marker}`);
    }
  };
  verifyMarker(join(gpuix, '.generated/gpui-pre'), 'gpui-pre');
  verifyMarker(join(gpuix, '.generated/gpui-pre-wgpu'), 'gpui-pre-wgpu');
  verifyMarker(join(gpuix, '.generated/gpui-mobile'), 'gpui-mobile');

  mkdirSync(prebuilt, { recursive: true });

  if (buildAndroid) {
    const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Library/Android/sdk');
    const ndk = process.env.ANDROID_NDK_HOME ?? join(sdk, 'ndk', ndkVersion);
    const host = process.platform === 'darwin' ? 'darwin-x86_64' : process.platform === 'linux' ? 'linux-x86_64' : 'windows-x86_64';
    const llvm = join(ndk, 'toolchains/llvm/prebuilt', host);
    const env = {
      ANDROID_HOME: sdk,
      ANDROID_NDK_HOME: ndk,
      CLANG_PATH: join(llvm, 'bin/clang'),
      BINDGEN_EXTRA_CLANG_ARGS: `--sysroot=${join(llvm, 'sysroot')}`,
    };
    for (const abi of ['arm64-v8a', 'x86_64']) {
      build_for_target('android', abi, '', env, true);
    }
  }

  if (buildIos) {
    if (process.platform !== 'darwin') {
      console.log('[prebuilt] skipping iOS builds (not on macOS)');
    } else {
      const sdk = output('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path']);
      const clang = output('xcrun', ['--find', 'clang']);
      const env = {
        CLANG_PATH: clang,
        BINDGEN_EXTRA_CLANG_ARGS: `-isysroot ${sdk}`,
        IPHONEOS_DEPLOYMENT_TARGET: iosDeploymentTarget,
      };
      build_for_target('ios', 'arm64', 'aarch64-apple-ios', env, false);
      build_for_target('ios', 'arm64-sim', 'aarch64-apple-ios-sim', env, false);
      build_for_target('ios', 'x86_64-sim', 'x86_64-apple-ios', env, false);
    }
  }

  // Write revision stamp for verification
  const stamp = `${gpuixRevision}\n${gpuiMobileRevision}\n${gpuiPreVersion}\n${txikiRevision}\n`;
  writeFileSync(join(prebuilt, '.stamp'), stamp);

  console.log('[prebuilt] done');
}

main().catch(err => { console.error('[prebuilt]', err.message); process.exit(1); });
