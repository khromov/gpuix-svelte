/**
 * Bundles the UI toolkit's showcase for the DOM into one file, as a consumer's Vite would, exporting the
 * component and the Svelte it was built with; test/ui-dom.ts imports it under happy-dom. Always run on
 * Node, since Vite runs there. The output directory is the argument, test/.ui-tmp by default.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { dom_plugins } from './vite-dom.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.argv[2] ? resolve(process.argv[2]) : join(root, 'test/.ui-tmp');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const entry = join(out, 'entry.js');
writeFileSync(
	entry,
	`export { default as Showcase } from '../../packages/ui/showcase/Showcase.svelte';
export { mount, unmount, flushSync } from 'svelte';
`
);

await build({
	root: out,
	configFile: false,
	logLevel: 'warn',
	plugins: dom_plugins({ emitCss: false }),
	build: {
		outDir: join(out, 'dist'),
		emptyOutDir: true,
		copyPublicDir: false,
		rolldownOptions: {
			input: entry,
			// An app build drops its entry's exports, and the test imports the component from the built file.
			preserveEntrySignatures: 'strict',
			output: { entryFileNames: 'showcase.js', chunkFileNames: 'showcase-[name].js', assetFileNames: 'showcase-[name][extname]' }
		}
	}
});
