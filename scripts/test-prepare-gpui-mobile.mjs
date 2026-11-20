#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const original = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const revision = '5fd54f4554263ae06753e90472c7f2e2ff5d7495';
const archive = `gpui-mobile-${revision}.tar.gz`;
const cache = join(original, '.generated/gpuix/.generated', archive);
if (!existsSync(cache)) throw new Error('Run node scripts/prepare-gpui-mobile.mjs once to populate the verified archive cache');
// A fixture inside a Git checkout catches git-apply accidentally treating the
// parent repository as its working tree and silently ignoring the patch.
const temp = mkdtempSync(join(original, '.generated/.mobile-prepare-test-'));
/** @param {string} name */
function fixture(name) {
  const root = join(temp, name);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'patches/gpui-mobile'), { recursive: true });
  mkdirSync(join(root, '.generated/gpuix/.generated'), { recursive: true });
  copyFileSync(join(original, 'scripts/prepare-gpui-mobile.mjs'), join(root, 'scripts/prepare-gpui-mobile.mjs'));
  for (const patch of ['5fd54f.patch', 'mobile-parity.patch', 'accessibility-events.patch', 'android-back.patch', 'android-clipboard.patch']) {
    copyFileSync(join(original, 'patches/gpui-mobile', patch), join(root, 'patches/gpui-mobile', patch));
  }
  copyFileSync(cache, join(root, '.generated/gpuix/.generated', archive));
  return root;
}
/** @param {string} root */
function run(root) {
  return spawnSync(process.execPath, [join(root, 'scripts/prepare-gpui-mobile.mjs')], { encoding: 'utf8', env: { ...process.env, CARGO_NET_OFFLINE: 'true' } });
}
/** @param {string} root */
function concurrent(root) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts/prepare-gpui-mobile.mjs')], { stdio: 'ignore', env: { ...process.env, CARGO_NET_OFFLINE: 'true' } });
    child.on('error', reject);
    child.on('exit', status => resolvePromise(status));
  });
}
try {
  const root = fixture('valid');
  assert.deepEqual(await Promise.all([concurrent(root), concurrent(root)]), [0, 0]);
  const output = join(root, '.generated/gpuix/.generated/gpui-mobile');
  assert.ok(existsSync(join(output, 'android/build.gradle.kts')));
  assert.ok(existsSync(join(output, 'android/src/main/java/dev/gpui/mobile/GpuiInputActivity.java')));
  assert.equal(existsSync(join(output, 'example/android/gradle/app/src/main/java/dev/gpui/mobile/GpuiInputActivity.java')), false);
  assert.match(readFileSync(join(output, 'src/android/jni.rs'), 'utf8'), /SessionSlot/);
  assert.match(readFileSync(join(output, 'src/ios/accessibility.rs'), 'utf8'), /UIAccessibilityPostNotification/);
  assert.match(readFileSync(join(output, 'src/android/accessibility.rs'), 'utf8'), /create_accessibility_node_info/);
  assert.match(readFileSync(join(output, 'android/src/main/java/dev/gpui/mobile/GpuiAccessibility.java'), 'utf8'), /manager\.isEnabled\(\)/);
  assert.ok(existsSync(join(output, 'android/src/main/java/dev/gpui/mobile/GpuiClipboard.java')));
  const stamp = readFileSync(join(output, '.gpuix-prepared'), 'utf8');
  assert.equal(run(root).status, 0);
  assert.equal(readFileSync(join(output, '.gpuix-prepared'), 'utf8'), stamp);
  const parity = join(root, 'patches/gpui-mobile/mobile-parity.patch');
  writeFileSync(parity, `${readFileSync(parity, 'utf8')}\n`);
  assert.equal(run(root).status, 0);
  assert.notEqual(readFileSync(join(output, '.gpuix-prepared'), 'utf8'), stamp);
  renameSync(join(output, '.gpuix-prepared'), join(output, 'saved-marker'));
  const refused = run(root);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /refusing to replace unmarked directory/);
  assert.ok(existsSync(join(output, 'Cargo.toml')));

  const corrupt = fixture('corrupt');
  writeFileSync(join(corrupt, '.generated/gpuix/.generated', archive), 'not the archive');
  const rejected = run(corrupt);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /checksum mismatch/);
  assert.equal(existsSync(join(corrupt, '.generated/gpuix/.generated/gpui-mobile')), false);
  console.log('PASS: patch application, concurrent, repeat, unmarked-directory and corrupt-archive tests');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
