/**
 * Bundles the UI toolkit's showcase for the DOM into one file, as a consumer's Vite would, exporting the
 * component, a few components the test mounts by themselves, the router's API and the Svelte it was built
 * with; test/ui-dom.ts imports it under happy-dom. Always run on Node, since Vite runs there. The output
 * directory is the argument (one inside the repository, where `svelte` resolves), test/.ui-tmp by default;
 * only its entry and dist/ are replaced, so what else lives there (test:ui's screenshot) stays.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { dom_plugins } from './vite-dom.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.argv[2] ? resolve(process.argv[2]) : join(root, 'test/.ui-tmp');

mkdirSync(out, { recursive: true });
rmSync(join(out, 'dist'), { recursive: true, force: true });
const entry = join(out, 'entry.js');
const showcase = relative(out, join(root, 'packages/ui/showcase/Showcase.svelte')).split(sep).join('/');
writeFileSync(
	entry,
	`export { default as Showcase } from '${showcase.startsWith('.') ? showcase : `./${showcase}`}';
export { Avatar, Link, Router, Separator, Slider, Tabs, TextField } from 'gpuix-svelte-ui';
export { router, navigate, back, forward, before, after, href, lazy, match, resolve, to_url, start_router, stop_router } from 'gpuix-svelte-ui/router';
export { mount, unmount, flushSync, createRawSnippet } from 'svelte';
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
