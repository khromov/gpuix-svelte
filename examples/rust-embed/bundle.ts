/**
 * Bundles the view into one ESM file the embedded runtime can load: svelte and this
 * package go in, `@gpuix/native` stays a sibling file so its loader finds the `.node`
 * beside itself with a relative require (no node_modules resolution in the embedding).
 */

import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BunPlugin } from 'bun';

if (!process.versions.bun) {
	console.error('[rust-embed] needs Bun: bun examples/rust-embed/bundle.ts');
	process.exit(1);
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const out = join(root, 'dist/embed');
const native = join(root, 'node_modules/@gpuix/native');

const { load_module, load_svelte, resolve_svelte } = await import('../../src/plugin.ts');

const plugin: BunPlugin = {
	name: 'gpuix-svelte',
	setup(build) {
		build.onResolve({ filter: /^svelte(\/|$)/ }, resolve_svelte(['custom-renderer']));
		build.onLoad({ filter: /\.svelte\.[jt]s$/ }, load_module);
		build.onLoad({ filter: /\.svelte$/ }, load_svelte);
	}
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const result = await Bun.build({
	entrypoints: [join(here, 'ui/main.ts')],
	outdir: out,
	target: 'node',
	format: 'esm',
	naming: { entry: 'app.mjs' },
	conditions: ['custom-renderer'],
	external: ['@gpuix/native'],
	plugins: [plugin],
	throw: false
});
if (!result.success) {
	for (const message of result.logs) console.error(message);
	process.exit(1);
}

const app = join(out, 'app.mjs');
writeFileSync(
	app,
	readFileSync(app, 'utf8').replaceAll('"@gpuix/native/host"', '"./native/dist/host.js"').replaceAll('"@gpuix/native"', '"./native/index.js"')
);

// The embedding has node: modules but not Node's globals, and ESM imports hoist, so the
// globals go in a boot module that imports the app only after installing them.
writeFileSync(
	join(out, 'boot.mjs'),
	[
		"import process from 'node:process';",
		"import { Buffer } from 'node:buffer';",
		// rustyscript's node:process reports an empty, non-configurable platform and arch;
		// the addon copied below is this host's, so the global may say so.
		`const fixed = { platform: '${process.platform}', arch: '${process.arch}' };`,
		'globalThis.process ??= new Proxy(process, {',
		'\tget(target, key) {',
		'\t\tif (key in fixed && !target[key]) return fixed[key];',
		'\t\tconst value = Reflect.get(target, key);',
		"\t\treturn typeof value === 'function' ? value.bind(target) : value;",
		'\t}',
		'});',
		'globalThis.Buffer ??= Buffer;',
		"await import('./app.mjs');",
		''
	].join('\n')
);

mkdirSync(join(out, 'native'), { recursive: true });
copyFileSync(join(native, 'index.js'), join(out, 'native/index.js'));
cpSync(join(native, 'dist'), join(out, 'native/dist'), { recursive: true });
const { platform, arch } = process;
const addon = `gpuix-native.${platform}-${arch}.node`;
copyFileSync(join(root, `node_modules/@gpuix/native-${platform}-${arch}`, addon), join(out, 'native', addon));
console.log(`[rust-embed] dist/embed/boot.mjs → app.mjs + native/${addon}`);
