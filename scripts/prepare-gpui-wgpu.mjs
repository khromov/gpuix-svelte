#!/usr/bin/env node
// Materialize the exact gpui-pre-wgpu release plus our renderer/mobile compatibility
// patch. Never modify Cargo's registry cache or a developer's GPUI checkout.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = '0.3.6';
const checksum = '05515b32799b1767d69300921c1b562cd53104965211a0e8905acdc7aa18e693';
const patch = join(root, 'patches/gpui-pre-wgpu', `${version}.patch`);
const destination = join(root, '.generated/gpuix/.generated/gpui-pre-wgpu');
/** @param {Uint8Array} bytes */
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = `${checksum}\n${sha256(readFileSync(patch))}\n`;
const marker = '.gpuix-prepared';

/** @param {string} program @param {string[]} args @param {string} cwd */
function command(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${program} failed: ${result.error?.message ?? result.status}`);
}

async function archive() {
  const cache = join(process.env.CARGO_HOME || join(homedir(), '.cargo'), 'registry/cache');
  if (existsSync(cache)) {
    for (const registry of readdirSync(cache)) {
      const candidate = join(cache, registry, `gpui-pre-wgpu-${version}.crate`);
      if (existsSync(candidate)) {
        const bytes = readFileSync(candidate);
        if (sha256(bytes) !== checksum) throw new Error(`checksum mismatch: ${candidate}`);
        return bytes;
      }
    }
  }
  if (process.env.CARGO_NET_OFFLINE === 'true') throw new Error('gpui-pre-wgpu archive is not cached and CARGO_NET_OFFLINE=true');
  const response = await fetch(`https://static.crates.io/crates/gpui-pre-wgpu/gpui-pre-wgpu-${version}.crate`);
  if (!response.ok) throw new Error(`gpui-pre-wgpu download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== checksum) throw new Error('downloaded gpui-pre-wgpu checksum mismatch');
  return bytes;
}

async function main() {
  const parent = dirname(destination);
  mkdirSync(parent, { recursive: true });
  // Serialize preparation across simultaneous mobile and desktop builds. A
  // stale lock after an interrupted process is deliberately not removed blindly.
  const lock = join(parent, '.gpui-pre-wgpu.lock');
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
    temp = mkdtempSync(join(parent, '.gpui-pre-wgpu-'));
    const crate = join(temp, 'source.crate');
    writeFileSync(crate, await archive());
    command('tar', ['-xzf', crate, '-C', temp], temp);
    const source = join(temp, `gpui-pre-wgpu-${version}`);
    command('patch', ['--batch', '-p1', '-i', patch], source);
    writeFileSync(join(source, marker), stamp);
    if (existsSync(destination)) rmSync(destination, { recursive: true });
    renameSync(source, destination);
    console.log(`[gpui] prepared gpui-pre-wgpu ${version} with GPUIX compatibility patch`);
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(`[gpui] ${error.message}`); process.exitCode = 1; });
