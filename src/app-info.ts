// Loaded by `render()` under GPUIX_APP_INFO=<file>: the entry has run up to its `render()` call,
// which is all `gpuix-svelte/build` needs, so the options are written out and the process ends.

import { writeFileSync } from 'node:fs';
import type { AppOptions } from './types.ts';

export function report(path: string, info: AppOptions & { title?: string }) {
	writeFileSync(path, JSON.stringify(info));
	process.exit(0);
}
