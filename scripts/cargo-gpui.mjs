#!/usr/bin/env node
// Cargo resolves path patches before build scripts run, so prepare first.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scripts = dirname(fileURLToPath(import.meta.url));
const prepared = spawnSync(process.execPath, [join(scripts, 'prepare-native-deps.mjs')], { stdio: 'inherit' });
if (prepared.error || prepared.status !== 0) {
  console.error(`[gpui] preparation failed: ${prepared.error?.message ?? prepared.status}`);
  process.exit(prepared.status || 1);
}
const cargo = spawnSync('cargo', process.argv.slice(2), { stdio: 'inherit' });
if (cargo.error) console.error(`[gpui] cargo failed to start: ${cargo.error.message}`);
process.exit(cargo.status ?? 1);
