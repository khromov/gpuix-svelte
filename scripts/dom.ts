/**
 * Serves examples/cross-target through Vite — the component `demo:cross` opens in a GPUI window,
 * here on the DOM — or builds it into dist/dom with `--build-only`. scripts/vite-dom.ts holds the
 * plugins, and the reason there is no vite.config.ts beside the example.
 */

import { fileURLToPath } from 'node:url';
import { build, createServer, type InlineConfig } from 'vite';
import { dom_plugins } from './vite-dom.ts';

const root = fileURLToPath(new URL('../examples/cross-target', import.meta.url));
const out = fileURLToPath(new URL('../dist/dom', import.meta.url));

const config: InlineConfig = { root, configFile: false, plugins: dom_plugins() };

if (process.argv.includes('--build-only')) {
	await build({ ...config, build: { outDir: out, emptyOutDir: true } });
	process.exit(0);
}

const server = await createServer({
	...config,
	server: { port: Number(process.env.PORT || 4174), open: !process.argv.includes('--no-open') }
});
await server.listen();
server.printUrls();
