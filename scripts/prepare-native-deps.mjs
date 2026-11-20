#!/usr/bin/env node
// Prepare the pinned upstream GPUIX and its GPUI/mobile dependencies in order.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const scripts = dirname(fileURLToPath(import.meta.url));
for (const name of ['prepare-gpuix.mjs', 'prepare-gpui.mjs', 'prepare-gpui-wgpu.mjs', 'prepare-gpui-mobile.mjs']) {
  const result = spawnSync(process.execPath, [join(scripts, name)], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`[native-deps] ${name} failed: ${result.error?.message ?? result.status}`);
    process.exit(result.status || 1);
  }
}
