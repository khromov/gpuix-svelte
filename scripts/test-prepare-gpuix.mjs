#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const original = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const revision = 'a53b294401280014e94eb9bd98a7c7ed1929f92d';
const archive = `gpuix-${revision}.tar.gz`;
const cache = join(original, '.generated', archive);
if (!existsSync(cache)) throw new Error('Run node scripts/prepare-gpuix.mjs first');
const temp = mkdtempSync(join(original, '.generated/.gpuix-prepare-test-'));
/** @param {string} name */
function fixture(name) {
  const root = join(temp, name);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'patches/gpuix'), { recursive: true });
  mkdirSync(join(root, '.generated'), { recursive: true });
  copyFileSync(join(original, 'scripts/prepare-gpuix.mjs'), join(root, 'scripts/prepare-gpuix.mjs'));
  for (const patch of ['embedded.patch', 'mobile-parity.patch']) {
    copyFileSync(join(original, 'patches/gpuix', patch), join(root, 'patches/gpuix', patch));
  }
  copyFileSync(cache, join(root, '.generated', archive));
  return root;
}
const env = { ...process.env, CARGO_NET_OFFLINE: 'true' };
/** @param {string} root */
function run(root) { return spawnSync(process.execPath, [join(root, 'scripts/prepare-gpuix.mjs')], { env, encoding: 'utf8' }); }
/** @param {string} root */
function concurrent(root) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts/prepare-gpuix.mjs')], { env, stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', resolvePromise);
  });
}
try {
  const root = fixture('valid');
  assert.deepEqual(await Promise.all([concurrent(root), concurrent(root)]), [0, 0]);
  const output = join(root, '.generated/gpuix');
  assert.ok(existsSync(join(output, 'packages/core/src/embedded.rs')));
  assert.equal(existsSync(join(output, 'packages/qjs')), false);
  assert.match(readFileSync(join(output, 'packages/core/src/embedded.rs'), 'utf8'), /prompt_for_paths_with/);
  const stamp = readFileSync(join(output, '.gpuix-prepared'), 'utf8');
  assert.equal(run(root).status, 0);
  assert.equal(readFileSync(join(output, '.gpuix-prepared'), 'utf8'), stamp);
  renameSync(join(output, '.gpuix-prepared'), join(output, 'saved-marker'));
  const refused = run(root);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /refusing to replace unmarked directory/);
  assert.ok(existsSync(join(output, 'packages/core/Cargo.toml')));
  const corrupt = fixture('corrupt');
  writeFileSync(join(corrupt, '.generated', archive), 'not the archive');
  const rejected = run(corrupt);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /checksum mismatch/);
  assert.equal(existsSync(join(corrupt, '.generated/gpuix')), false);
  console.log('PASS: GPUIX patch application, concurrency, idempotence and safety tests');
} finally { rmSync(temp, { recursive: true, force: true }); }
