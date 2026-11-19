#!/usr/bin/env node
// Exercise preparation in an isolated miniature checkout; never touch a source checkout.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const original = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'gpuix-prepare-test-'));
/** @param {string} name */
function fixture(name) {
  const root = join(temp, name);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'patches/gpui-pre'), { recursive: true });
  copyFileSync(join(original, 'scripts/prepare-gpui.mjs'), join(root, 'scripts/prepare-gpui.mjs'));
  copyFileSync(join(original, 'patches/gpui-pre/0.3.6.patch'), join(root, 'patches/gpui-pre/0.3.6.patch'));
  return root;
}
/** @param {string} root */
function run(root, env = process.env) {
  return spawnSync(process.execPath, [join(root, 'scripts/prepare-gpui.mjs')], { encoding: 'utf8', env });
}
/** @param {string} root */
function concurrent(root) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts/prepare-gpui.mjs')], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', status => resolvePromise(status));
  });
}
try {
  const root = fixture('valid');
  assert.deepEqual(await Promise.all([concurrent(root), concurrent(root)]), [0, 0]);
  const output = join(root, '.generated/gpuix/.generated/gpui-pre');
  assert.match(readFileSync(join(output, 'src/platform.rs'), 'utf8'), /fn request_text_input\(&self\)/);
  const stamp = readFileSync(join(output, '.gpuix-prepared'), 'utf8');
  assert.equal(run(root).status, 0);
  assert.equal(readFileSync(join(output, '.gpuix-prepared'), 'utf8'), stamp);
  renameSync(join(output, '.gpuix-prepared'), join(output, 'saved-marker'));
  const refused = run(root);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /refusing to replace unmarked directory/);
  assert.ok(existsSync(join(output, 'src/platform.rs')));

  const corrupt = fixture('corrupt');
  const cargoHome = join(temp, 'corrupt-cache');
  const cache = join(cargoHome, 'registry/cache/test');
  mkdirSync(cache, { recursive: true });
  writeFileSync(join(cache, 'gpui-pre-0.3.6.crate'), 'not the crate');
  const rejected = run(corrupt, { ...process.env, CARGO_HOME: cargoHome, CARGO_NET_OFFLINE: 'true' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /checksum mismatch/);
  assert.equal(existsSync(join(corrupt, '.generated/gpuix/.generated/gpui-pre')), false);
  console.log('PASS: concurrent, repeat, unmarked-directory and corrupt-archive preparation tests');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
