/**
 * Serves a cross-target example through Vite, on the DOM: examples/cross-target by default (the
 * component `demo:cross` opens in a GPUI window) or the directory `--root` names, such as the UI
 * toolkit's showcase for `demo:ui-dom`; `--build-only` builds it into dist/dom-<name> instead.
 * scripts/vite-dom.ts holds the plugins, and the reason there is no vite.config.ts beside an example.
 */

import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, type InlineConfig } from 'vite';
import { dom_plugins } from './vite-dom.ts';

const args = process.argv.slice(2);
const at = args.indexOf('--root');
if (at !== -1 && !args[at + 1]) throw new Error('--root needs a directory, such as packages/ui/showcase');
const root = fileURLToPath(new URL(`../${at === -1 ? 'examples/cross-target' : args[at + 1]}/`, import.meta.url));
const out = fileURLToPath(new URL(`../dist/dom-${basename(root)}`, import.meta.url));
// The page's @font-face reads the site's Geist from here, so the example ships no font of its own.
const fonts = fileURLToPath(new URL('../homepage/assets/fonts', import.meta.url));

const config: InlineConfig = { root, configFile: false, publicDir: fonts, plugins: dom_plugins() };

if (args.includes('--build-only')) {
	await build({ ...config, build: { outDir: out, emptyOutDir: true } });
	process.exit(0);
}

const server = await createServer({
	...config,
	server: { host: process.env.HOST, port: Number(process.env.PORT || 4174), open: !args.includes('--no-open') }
});
await server.listen();
server.printUrls();
