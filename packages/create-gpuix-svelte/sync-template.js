// @ts-check
// prepack: npm publishes what is inside the package directory, so starter/ is copied in.

import { cpSync, rmSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const template = fileURLToPath(new URL('./template', import.meta.url));
const SKIP = new Set(['node_modules', 'package-lock.json', 'bun.lock']);

rmSync(template, { recursive: true, force: true });
cpSync(fileURLToPath(new URL('../../starter', import.meta.url)), template, {
	recursive: true,
	filter: (src) => !SKIP.has(basename(src))
});
cpSync(fileURLToPath(new URL('../../LICENSE', import.meta.url)), fileURLToPath(new URL('./LICENSE', import.meta.url)));
