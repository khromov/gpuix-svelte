/**
 * Feature coverage: compile and mount every sample from Svelte's own
 * custom-renderer suite against the GPUI renderer.
 *
 * The upstream suite asserts on serialized HTML, which GPUI has no analogue
 * for, so the bar here is weaker: does it compile, mount and survive a native
 * applyBatch. That is still enough to find contract gaps.
 */

import { readdirSync, readFileSync, existsSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestGpuixRenderer } from '@gpuix/native';
import { mount, flushSync } from 'svelte';
import renderer, { set_native, create_root, commit } from '../src/renderer.js';

const SOURCE = process.env.SVELTE_SAMPLES_DIR;
if (!SOURCE || !existsSync(SOURCE)) {
	console.log(
		"coverage: set SVELTE_SAMPLES_DIR to a svelte checkout's tests/custom-renderers/samples dir; skipping"
	);
	process.exit(0);
}

// Importing the samples in place would mix two svelte runtimes: they live
// outside this package, where neither `gpuix-svelte/renderer` nor this install's
// `svelte` can resolve.
const SAMPLES = fileURLToPath(new URL('./.samples-tmp', import.meta.url));
rmSync(SAMPLES, { recursive: true, force: true });
cpSync(SOURCE, SAMPLES, { recursive: true });

const native = new TestGpuixRenderer();
set_native(native);

const results = { ok: [], expected_compile_error: [], compile_error: [], runtime_error: [] };

for (const name of readdirSync(SAMPLES).sort()) {
	const dir = join(SAMPLES, name);
	const main = join(dir, 'main.svelte');
	if (!existsSync(main)) continue;

	const config = existsSync(join(dir, '_config.js')) ? readFileSync(join(dir, '_config.js'), 'utf8') : '';
	const expects_compile_error = config.includes('compile_error');

	try {
		const Component = (await import(main)).default;
		const root = create_root();
		const anchor = renderer.createComment('');
		renderer.insert(root, anchor, null);
		mount(Component, { renderer, target: root, anchor, props: {} });
		flushSync();
		commit();
		results.ok.push(name);
	} catch (err) {
		const message = String(err.message ?? err).split('\n')[0];
		if (expects_compile_error) results.expected_compile_error.push(name);
		else if (/Unrecognised|not compatible|compile|svelte_options/i.test(message))
			results.compile_error.push(`${name}: ${message}`);
		else results.runtime_error.push(`${name}: ${message}`);
	}
}

const total =
	results.ok.length +
	results.expected_compile_error.length +
	results.compile_error.length +
	results.runtime_error.length;

console.log(`mounted cleanly            ${results.ok.length}/${total}`);
console.log(`refused at compile (by design) ${results.expected_compile_error.length}`);
console.log(`unexpected compile errors  ${results.compile_error.length}`);
console.log(`runtime errors             ${results.runtime_error.length}`);

for (const [label, list] of [
	['UNEXPECTED COMPILE', results.compile_error],
	['RUNTIME', results.runtime_error]
]) {
	if (list.length) {
		console.log(`\n--- ${label} ---`);
		for (const line of list) console.log('  ' + line);
	}
}
console.log('\nrefused by design:', results.expected_compile_error.join(', '));
console.log('\nmounted:', results.ok.join(', '));
