import assert from 'node:assert/strict';
import { build_txiki_bundle } from '../src/txiki-bundle.ts';
import { bundle_hot_entries } from '../src/txiki-entry.ts';

const transformed = bundle_hot_entries("import { render_hot as hot } from 'gpuix-svelte'; hot(new URL('./App.svelte', import.meta.url));", '/app/main.ts');
assert.match(transformed, /import __gpuix_txiki_component_0 from "\/app\/App\.svelte"/);
assert.match(transformed, /hot\(__gpuix_txiki_component_0\)/);
assert.throws(() => bundle_hot_entries("import { render_hot } from 'gpuix-svelte'; render_hot(path)", '/app/main.ts'), /literal component path/);

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
const mobile = await build_txiki_bundle('examples/mobile/main.ts', { platform: 'ios' });
assert.ok((mobile.get('app.mjs')?.length ?? 0) > 10_000);
console.log('txiki-bundle ok');
