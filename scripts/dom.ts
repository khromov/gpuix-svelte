/**
 * Serves examples/cross-target through Vite — the component `demo:cross` opens in a GPUI window,
 * here on the DOM — or builds it into dist/dom with `--build-only`. The config lives here rather
 * than in a vite.config.ts beside the example, because svelte-check reads such a file as the
 * component's Svelte config and loses the repository's a11y warning filter.
 */

import { fileURLToPath } from 'node:url';
import { build, createServer, type InlineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const root = fileURLToPath(new URL('../examples/cross-target', import.meta.url));
const out = fileURLToPath(new URL('../dist/dom', import.meta.url));

// A consumer's Vite finds gpuix-svelte in node_modules. Inside the package there is no such copy, so Node
// resolves the name through the package's own `exports`, under whose default conditions the DOM twin wins.
const self_reference: Plugin = {
	name: 'gpuix-svelte-self-reference',
	resolveId(id) {
		if (id === 'gpuix-svelte' || id.startsWith('gpuix-svelte/')) return fileURLToPath(import.meta.resolve(id));
	}
};

const config: InlineConfig = {
	root,
	configFile: false,
	plugins: [
		// The repository's svelte.config.js turns on the custom renderer, the one thing a DOM build must not do.
		svelte({ configFile: false, onwarn: (warning, handler) => warning.code.startsWith('a11y_') || handler(warning) }),
		self_reference
	]
};

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
