import assert from 'node:assert/strict';
import { build_txiki_bundle } from '../src/txiki-bundle.ts';
import { bundle_hot_entries } from '../src/txiki-entry.ts';
import { bundle_asset_urls } from '../src/txiki-assets.ts';

const transformed = bundle_hot_entries("import { render_hot as hot } from 'gpuix-svelte'; hot(new URL('./App.svelte', import.meta.url));", '/app/main.ts');
assert.match(transformed, /import __gpuix_txiki_component_0 from "\/app\/App\.svelte"/);
assert.match(transformed, /hot\(__gpuix_txiki_component_0\)/);
assert.throws(() => bundle_hot_entries("import { render_hot } from 'gpuix-svelte'; render_hot(path)", '/app/main.ts'), /literal component path/);
assert.match(bundle_hot_entries("import * as gpuix from 'gpuix-svelte'; gpuix.render_hot('./App.svelte')", '/app/main.ts'), /gpuix\.render_hot\(__gpuix_txiki_component_0\)/);
const directory_urls = "const here = new URL('.', import.meta.url); const assets = new URL('../assets/', import.meta.url);";
assert.equal(bundle_asset_urls(directory_urls, 'test/txiki-assets-entry.ts', () => { throw new Error('directory treated as an asset'); }), directory_urls);

for (const platform of ['ios', 'android'] as const) {
	const files = await build_txiki_bundle('test/txiki-android/main.ts', { platform, production: true });
	assert.deepEqual([...files.keys()], ['app.mjs', 'main.mjs']);
	const start = new TextDecoder().decode(files.get('main.mjs'));
	assert.match(start, new RegExp(`platform: "${platform}"`));
	assert.match(start, /__gpuixClosed/);
	assert.ok((files.get('app.mjs')?.length ?? 0) > 10_000);
}
const hot = await build_txiki_bundle('examples/counter/main.ts', { platform: 'darwin', production: true });
assert.ok((hot.get('app.mjs')?.length ?? 0) > 10_000);
for (const entry of [
	'examples/hacker-news/main.ts', 'examples/tic-tac-toe/main.ts', 'examples/liquid-glass/main.ts',
	'examples/styling-playground/main.ts', 'examples/desktop-apis/main.ts', 'examples/native-0.11/main.ts',
	'examples/cross-target/main.ts', 'examples/tutorial/main.ts', 'examples/ui-app/main.ts', 'packages/ui/showcase/main.ts'
]) {
	const files = await build_txiki_bundle(entry, { platform: 'android' });
	assert.ok((files.get('app.mjs')?.length ?? 0) > 10_000, entry);
}
const parity = await build_txiki_bundle('test/mobile-parity-entry.ts', { platform: 'android' });
assert.ok([...parity.keys()].some(name => name.startsWith('gpuix-asset-')));
assert.match(new TextDecoder().decode(parity.get('app.mjs')), /gpuixHost\.assetUrl/);
const mobile = await build_txiki_bundle('examples/mobile/main.ts', { platform: 'ios' });
assert.ok((mobile.get('app.mjs')?.length ?? 0) > 10_000);
const assets = await build_txiki_bundle('test/txiki-assets-entry.ts', { platform: 'android' });
const asset = [...assets.keys()].find(name => name.startsWith('gpuix-asset-'));
assert.ok(asset);
assert.deepEqual(Uint8Array.from(assets.get(asset)!), new Uint8Array(await Bun.file('assets/icon.png').arrayBuffer()));
assert.match(new TextDecoder().decode(assets.get('app.mjs')), /gpuixHost\.assetPath/);
assert.match(new TextDecoder().decode(assets.get('main.mjs')), /assetPath/);
const nested = await build_txiki_bundle('test/txiki-hot-entry.ts', { platform: 'ios' });
assert.ok([...nested.keys()].some(name => name.startsWith('gpuix-asset-')));
for (const [platform, family] of [['android', 'Droid Sans Mono'], ['ios', 'Menlo'], ['darwin', 'Menlo']]) {
	const script = `await import('gpuix-svelte'); Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} }); console.log((await import('./packages/ui/src/shared.ts')).MONO);`;
	const result = Bun.spawnSync([process.execPath, '--conditions=custom-renderer', '-e', script]);
	assert.equal(result.exitCode, 0, new TextDecoder().decode(result.stderr));
	assert.equal(new TextDecoder().decode(result.stdout).trim(), family);
}
console.log('txiki-bundle ok');
