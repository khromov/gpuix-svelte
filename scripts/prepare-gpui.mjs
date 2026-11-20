#!/usr/bin/env node
// Materialize the exact gpui-pre release plus our renderer/mobile compatibility
// patch. Never modify Cargo's registry cache or a developer's GPUI checkout.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = '0.3.6';
const checksum = 'a0437c0b83e636a92bd1a39fa1d05fb632ae671289537497b35871ffbe231b84';
const patches = [`${version}.patch`, 'mobile-interactions.patch'].map(name => join(root, 'patches/gpui-pre', name));
const destination = join(root, '.generated/gpuix/.generated/gpui-pre');
/** @param {Uint8Array} bytes */
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = `${checksum}\n${patches.map(patch => sha256(readFileSync(patch))).join('\n')}\n`;
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
      const candidate = join(cache, registry, `gpui-pre-${version}.crate`);
      if (existsSync(candidate)) {
        const bytes = readFileSync(candidate);
        if (sha256(bytes) !== checksum) throw new Error(`checksum mismatch: ${candidate}`);
        return bytes;
      }
    }
  }
  if (process.env.CARGO_NET_OFFLINE === 'true') throw new Error('gpui-pre archive is not cached and CARGO_NET_OFFLINE=true');
  const response = await fetch(`https://static.crates.io/crates/gpui-pre/gpui-pre-${version}.crate`);
  if (!response.ok) throw new Error(`gpui-pre download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== checksum) throw new Error('downloaded gpui-pre checksum mismatch');
  return bytes;
}

async function main() {
  const parent = dirname(destination);
  mkdirSync(parent, { recursive: true });
  // Serialize preparation across simultaneous mobile and desktop builds. A
  // stale lock after an interrupted process is deliberately not removed blindly.
  const lock = join(parent, '.gpui-pre.lock');
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
    temp = mkdtempSync(join(parent, '.gpui-pre-'));
    const crate = join(temp, 'source.crate');
    writeFileSync(crate, await archive());
    command('tar', ['-xzf', crate, '-C', temp], temp);
    const source = join(temp, `gpui-pre-${version}`);
    for (const patch of patches) command('patch', ['--batch', '-p1', '-i', patch], source);
    writeFileSync(join(source, marker), stamp);
    if (existsSync(destination)) rmSync(destination, { recursive: true });
    renameSync(source, destination);
    console.log(`[gpui] prepared gpui-pre ${version} with GPUIX compatibility patch`);
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(`[gpui] ${error.message}`); process.exitCode = 1; });
