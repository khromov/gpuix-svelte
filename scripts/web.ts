/**
 * Bundle tic-tac-toe for the browser and serve it.
 *
 * `@gpuix/native` resolves to its `browser` entry under `target: 'browser'`, and
 * that entry imports the wasm with `with { type: 'file' }`, so Bun copies it next
 * to the bundle and rewrites the URL — nothing here has to know where it lives.
 * Same reason this needs Bun: no other bundler reads that import attribute.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BunPlugin } from 'bun';

if (!process.versions.bun) {
	console.error('[web] needs Bun — `npm run demo:web` runs `bun scripts/web.ts`');
	process.exit(1);
}

const production = process.argv.includes('--production');
const build_only = process.argv.includes('--build-only');

const root = fileURLToPath(new URL('../', import.meta.url));
const example = join(root, 'examples/tic-tac-toe');
const out = join(root, 'dist/web');
const page = join(example, 'index.html');

// Imported after the guard: a static import would hoist `bun` above it.
const { load_module, load_svelte } = await import('../src/plugin.ts');

// `Bun.build` ignores the plugin bunfig.toml preloads, and a `.svelte` import with
// no plugin silently becomes a file asset, so count what actually went through it.
let components = 0;
const svelte_plugin: BunPlugin = {
	name: 'gpuix-svelte',
	setup(build) {
		build.onLoad({ filter: /\.svelte\.[jt]s$/ }, load_module);
		build.onLoad({ filter: /\.svelte$/ }, (args) => {
			components++;
			return load_svelte(args);
		});
	}
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const result = await Bun.build({
	entrypoints: [join(example, 'web.ts')],
	outdir: out,
	target: 'browser',
	format: 'esm',
	naming: { entry: 'app.js', asset: '[name].[ext]' },
	// Additive — `browser` comes from the target. As in scripts/compile.ts, Bun
	// implies `development` unless NODE_ENV is production at build time too.
	conditions: production ? ['custom-renderer', 'production'] : ['custom-renderer'],
	...(production && { define: { 'process.env.NODE_ENV': '"production"' }, minify: true }),
	plugins: [svelte_plugin],
	throw: false
});

if (!result.success) {
	for (const message of result.logs) console.error(message);
	process.exit(1);
}

if (components === 0) {
	console.error('[web] no .svelte file went through the plugin');
	process.exit(1);
}

if (!result.outputs.some((output) => output.path.endsWith('.wasm'))) {
	console.error('[web] no .wasm in the bundle — @gpuix/native did not resolve to its browser entry');
	process.exit(1);
}

console.log(`[web] built ${result.outputs.length} files into dist/web${production ? ' (production)' : ''}`);
if (build_only) process.exit(0);

/**
 * The wasm links with `--shared-memory`, so its `WebAssembly.Memory` is
 * `shared: true` — and SharedArrayBuffer only exists in a cross-origin isolated
 * document. Any host serving this build must send both of these.
 */
const ISOLATION = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp'
};

function content_type(pathname: string): string {
	// instantiateStreaming rejects a wasm response typed as anything else.
	if (pathname.endsWith('.wasm')) return 'application/wasm';
	if (pathname.endsWith('.js')) return 'text/javascript';
	if (pathname.endsWith('.css')) return 'text/css';
	return 'text/html';
}

const server = Bun.serve({
	port: Number(process.env.PORT || 4173),
	fetch(request) {
		const { pathname } = new URL(request.url);
		const file = pathname === '/' ? page : join(out, pathname.slice(1));
		if (!file.startsWith(out) && file !== page) return new Response('Not found', { status: 404 });
		if (!existsSync(file)) return new Response('Not found', { status: 404 });

		return new Response(Bun.file(file), {
			headers: { ...ISOLATION, 'Content-Type': content_type(pathname) }
		});
	}
});

console.log(`[web] ${server.url}`);
