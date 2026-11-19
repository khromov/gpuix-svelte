#!/usr/bin/env node
// Materialize pinned upstream GPUIX plus the gpuix-svelte integration patch.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const revision = 'a53b294401280014e94eb9bd98a7c7ed1929f92d';
const checksum = 'ce2fb9a377be4625e1c7444ed2e894a3c3baccd6685c8d5f85838f481dc52ef9';
const patches = ['embedded.patch', 'mobile-parity.patch'].map(name => join(root, 'patches/gpuix', name));
const parent = join(root, '.generated');
const destination = join(parent, 'gpuix');
const marker = '.gpuix-prepared';
/** @param {Uint8Array} bytes */
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = `${revision}\n${checksum}\n${patches.map(patch => sha256(readFileSync(patch))).join('\n')}\n`;

/** @param {string} program @param {string[]} args @param {string} cwd */
function command(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, stdio: 'inherit', env: { ...process.env, GIT_CEILING_DIRECTORIES: parent } });
  if (result.error || result.status !== 0) throw new Error(`${program} failed: ${result.error?.message ?? result.status}`);
}
async function archive() {
  const cache = join(parent, `gpuix-${revision}.tar.gz`);
  if (existsSync(cache)) {
    const bytes = readFileSync(cache);
    if (sha256(bytes) !== checksum) throw new Error(`checksum mismatch: ${cache}`);
    return bytes;
  }
  if (process.env.CARGO_NET_OFFLINE === 'true') throw new Error('GPUIX archive is not cached and CARGO_NET_OFFLINE=true');
  const response = await fetch(`https://codeload.github.com/remorses/gpuix/tar.gz/${revision}`);
  if (!response.ok) throw new Error(`GPUIX download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== checksum) throw new Error('downloaded GPUIX checksum mismatch');
  // Write only verified bytes, atomically, under the preparation lock.
  const temporary = `${cache}.tmp`;
  writeFileSync(temporary, bytes);
  renameSync(temporary, cache);
  return bytes;
}
async function main() {
  mkdirSync(parent, { recursive: true });
  const lock = join(parent, '.gpuix.lock');
  const deadline = Date.now() + 120_000;
  while (true) {
    try { mkdirSync(lock); break; }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error(`timed out waiting for ${lock}; remove it only if no preparation is running`, { cause: error });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  let temp;
  try {
    if (existsSync(join(destination, marker)) && readFileSync(join(destination, marker), 'utf8') === stamp) return;
    if (existsSync(destination) && !existsSync(join(destination, marker))) throw new Error(`refusing to replace unmarked directory ${destination}`);
    temp = mkdtempSync(join(parent, '.gpuix-'));
    const crate = join(temp, 'source.tar.gz');
    writeFileSync(crate, await archive());
    const source = join(temp, 'source');
    mkdirSync(source);
    command('tar', ['-xzf', crate, '-C', source, '--strip-components=1'], temp);
    for (const patch of patches) {
      command('git', ['apply', '--check', patch], source);
      command('git', ['apply', patch], source);
    }
    writeFileSync(join(source, marker), stamp);
    if (existsSync(destination)) rmSync(destination, { recursive: true });
    renameSync(source, destination);
    console.log(`[gpuix] prepared remorses/gpuix ${revision} with gpuix-svelte compatibility patch`);
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(`[gpuix] ${error.message}`); process.exitCode = 1; });
