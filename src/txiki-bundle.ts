import type { BunPlugin } from 'bun';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle_hot_entries } from './txiki-entry.ts';

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
	const plugin: BunPlugin = {
		name: 'gpuix-svelte-txiki',
		setup(build) {
			build.onResolve({ filter: /^@gpuix\/native$/ }, () => ({ path: native }));
			build.onResolve({ filter: /^\.\/(previous-instance|screen-reader)\.(ts|js)$/ }, args => ({
				path: resolve(dirname(args.importer), `txiki-${args.path.slice(2)}`)
			}));
			build.onResolve({ filter: /^svelte(\/|$)/ }, resolve_svelte(conditions));
			build.onResolve({ filter: /^(node:)?[a-z]/ }, args => {
				const name = args.path.replace(/^node:/, '');
				if (['fs', 'fs/promises', 'path', 'path/posix', 'os'].includes(name)) {
					const file = name === 'fs/promises' ? 'fs-promises' : name === 'path/posix' ? 'path' : name;
					return { path: fileURLToPath(new URL(`./txiki/${file}.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url)) };
				}
				if (args.path.startsWith('node:') || builtins.has(args.path)) {
					throw new Error(`[txiki] Node builtin ${args.path} is not supported (imported by ${args.importer})`);
				}
				return undefined;
			});
			build.onLoad({ filter: /\.[cm]?[jt]s$/ }, async args => {
				if (resolve(args.path) !== path) return;
				const source = new Bun.Transpiler({ loader: 'ts' }).transformSync(await Bun.file(args.path).text());
				return { contents: bundle_hot_entries(source, path), loader: 'js' };
			});
			build.onLoad({ filter: /\.svelte\.[jt]s$/ }, load_module);
			build.onLoad({ filter: /\.svelte$/ }, args => { components++; return load_svelte(args); });
		}
	};
	const result = await Bun.build({
		entrypoints: [path], target: 'browser', format: 'esm', naming: 'app.mjs', conditions,
		...(options.production && { define: { 'process.env.NODE_ENV': '"production"' }, minify: true }),
		plugins: [plugin], throw: false
	});
	if (!result.success) throw new Error(result.logs.map(String).join('\n'));
	if (components === 0) throw new Error('[txiki] no .svelte file went through the bundler');
	if (result.outputs.length !== 1) throw new Error('[txiki] expected a single JavaScript module');
	const startup = `const reply = JSON.parse(__gpuixCall(JSON.stringify({ method: 'paths', args: [] })));
if (reply.error || reply.closed) throw new Error(reply.error ?? 'GPUI session closed');
globalThis.gpuixHost = { paths: reply.value, runtime: 'txiki' };
globalThis.process = { env: { ...tjs.env }, platform: ${JSON.stringify(options.platform)}, arch: tjs.arch, pid: tjs.pid, argv: [...tjs.args], versions: { txiki: tjs.version }, cwd: () => reply.value.data, exit: code => __gpuixStop(code) };
setInterval(() => __gpuixClosed(), 100);
await import('./app.mjs');
`;
	return new Map([
		['app.mjs', new Uint8Array(await result.outputs[0].arrayBuffer())],
		['main.mjs', new TextEncoder().encode(startup)]
	]);
}
