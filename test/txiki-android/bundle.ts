import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build_txiki_bundle } from '../../src/txiki-bundle.ts';

const root = dirname(fileURLToPath(import.meta.url));
const platform = process.env.TXIKI_PLATFORM === 'ios' ? 'ios' : 'android';
const output = join(root, `../../dist/txiki-${platform}/assets`);
mkdirSync(output, { recursive: true });
for (const [name, bytes] of await build_txiki_bundle(join(root, 'main.ts'), { platform, production: true })) {
	writeFileSync(join(output, name), bytes);
}
console.log('Bundled Svelte + GPUI renderer for txiki.js');
