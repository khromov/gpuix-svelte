import type { BunPlugin } from 'bun';
import { builtinModules } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle_hot_entries } from './txiki-entry.ts';
import { bundle_asset_urls } from './txiki-assets.ts';

export interface TxikiBundleOptions {
	platform: 'android' | 'ios' | 'darwin' | 'linux' | 'win32';
	production?: boolean;
}

const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));

export async function build_txiki_bundle(entry: string | URL, options: TxikiBundleOptions): Promise<Map<string, Uint8Array>> {
	if (!globalThis.Bun) throw new Error('[txiki] bundling requires Bun');
	const path = entry instanceof URL ? fileURLToPath(entry) : resolve(entry);
	const native = fileURLToPath(import.meta.resolve('gpuix-svelte/txiki-native'));
	const conditions = ['custom-renderer', 'txiki', options.production ? 'production' : 'development'];
	const { load_module, load_svelte, resolve_svelte } = await import('./plugin.ts');
	let components = 0;
	const assets = new Map<string, Uint8Array>();
	function include_asset(path: string) {
		const bytes = readFileSync(path);
		const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
		const name = `gpuix-asset-${hash}-${basename(path).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
		assets.set(name, bytes);
		return name;
	}
	const asset_urls = (source: string, path: string) => bundle_asset_urls(source, path, include_asset);
	const plugin: BunPlugin = {
		name: 'gpuix-svelte-txiki',
		setup(build) {
			build.onResolve({ filter: /^gpuix:bootstrap$/ }, () => ({ path: 'entry', namespace: 'gpuix-bootstrap' }));
			build.onLoad({ filter: /.*/, namespace: 'gpuix-bootstrap' }, () => ({
				contents: `import { Buffer } from 'buffer'; globalThis.Buffer = Buffer; await import(${JSON.stringify(path)});`, loader: 'js'
			}));
			build.onResolve({ filter: /^@gpuix\/native$/ }, () => ({ path: native }));
			build.onResolve({ filter: /^\.\/(previous-instance|screen-reader)\.(ts|js)$/ }, args => ({
				path: resolve(dirname(args.importer), `txiki-${args.path.slice(2)}`)
			}));
			build.onResolve({ filter: /^svelte(\/|$)/ }, resolve_svelte(conditions));
			build.onResolve({ filter: /^(node:)?[a-z]/ }, args => {
				const name = args.path.replace(/^node:/, '');
				if (name === 'buffer') return { path: fileURLToPath(import.meta.resolve('buffer/index.js')) };
				if (name === 'events') return { path: fileURLToPath(import.meta.resolve('events/events.js')) };
				if (name === 'child_process') return { path: fileURLToPath(new URL(`./txiki/child-process.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url)) };
				if (['fs', 'fs/promises', 'path', 'path/posix', 'os', 'url'].includes(name)) {
					const file = name === 'fs/promises' ? 'fs-promises' : name === 'path/posix' ? 'path' : name;
					return { path: fileURLToPath(new URL(`./txiki/${file}.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url)) };
				}
				if (args.path.startsWith('node:') || builtins.has(args.path)) {
					throw new Error(`[txiki] Node builtin ${args.path} is not supported (imported by ${args.importer})`);
				}
				return undefined;
			});
			build.onLoad({ filter: /\.[cm]?[jt]s$/ }, async args => {
				if (/\.svelte\.[jt]s$/.test(args.path)) return;
				const source = await Bun.file(args.path).text();
				const hot = source.includes('render_hot') && source.includes('gpuix-svelte');
				if (resolve(args.path) !== path && !hot && !(source.includes('URL') && source.includes('import.meta'))) return;
				const js = new Bun.Transpiler({ loader: /\.[cm]?ts$/.test(args.path) ? 'ts' : 'js' }).transformSync(source);
				return { contents: asset_urls(hot ? bundle_hot_entries(js, args.path) : js, args.path), loader: 'js' };
			});
			build.onLoad({ filter: /\.(png|jpe?g|gif|webp|bmp|ico|svg|woff2?|ttf|otf)$/i }, args => {
				const name = include_asset(args.path);
				return { contents: `export default globalThis.gpuixHost.assetPath(${JSON.stringify(name)});`, loader: 'js' };
			});
			build.onLoad({ filter: /\.svelte\.[jt]s$/ }, args => {
				const result = load_module(args);
				return { ...result, contents: asset_urls(String(result.contents), args.path) };
			});
			build.onLoad({ filter: /\.svelte$/ }, args => {
				components++;
				const result = load_svelte(args);
				return { ...result, contents: asset_urls(String(result.contents), args.path) };
			});
		}
	};
	const result = await Bun.build({
		entrypoints: ['gpuix:bootstrap'], target: 'browser', format: 'esm', naming: 'app.mjs', conditions,
		...(options.production && { define: { 'process.env.NODE_ENV': '"production"' }, minify: true }),
		plugins: [plugin], throw: false
	});
	if (!result.success) throw new Error(result.logs.map(String).join('\n'));
	if (components === 0) throw new Error('[txiki] no .svelte file went through the bundler');
	if (result.outputs.length !== 1) throw new Error('[txiki] expected a single JavaScript module');
	const startup = `const reply = JSON.parse(__gpuixCall(JSON.stringify({ method: 'paths', args: [] })));
if (reply.error || reply.closed) throw new Error(reply.error ?? 'GPUI session closed');
globalThis.gpuixHost = { paths: reply.value, runtime: 'txiki', assetPath: name => decodeURIComponent(new URL(name, import.meta.url).pathname), assetUrl: name => new URL(name, import.meta.url).href };
globalThis.process = { env: { ...tjs.env }, platform: ${JSON.stringify(options.platform)}, arch: tjs.arch, pid: tjs.pid, argv: [...tjs.args], versions: { txiki: tjs.version }, cwd: () => reply.value.data, nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)), exit: code => __gpuixStop(code) };
setInterval(() => __gpuixClosed(), 100);
await import('./app.mjs');
`;
	return new Map([
		['app.mjs', new Uint8Array(await result.outputs[0].arrayBuffer())],
		['main.mjs', new TextEncoder().encode(startup)],
		...assets
	]);
}
