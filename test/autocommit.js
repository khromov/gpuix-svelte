/**
 * Windows/Linux get no frame loop to poll `is_dirty()`, so a mutation with no
 * native event behind it has to drain itself or it sits in the queue.
 */

import { TestGpuixRenderer } from '@gpuix/native';
import { mount, flushSync } from 'svelte';
import renderer, { set_native, create_root, commit, set_auto_commit } from '../src/renderer.js';

async function mount_and_wait(auto) {
	const native = new TestGpuixRenderer();
	set_native(native);
	set_auto_commit(auto);

	const root = create_root();
	const anchor = renderer.createComment('');
	renderer.insert(root, anchor, null);

	const AutoCommit = (await import('./AutoCommit.svelte')).default;
	mount(AutoCommit, { renderer, target: root, anchor, props: {} });
	flushSync();
	commit();
	native.flush();

	// Nothing below calls flushSync() or commit() — the timer inside the component
	// is the only thing driving the update.
	await new Promise((resolve) => setTimeout(resolve, 50));
	native.flush();
	return native.getAllText();
}

let failures = 0;

function check(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}\n       want ${JSON.stringify(expected)}\n       got  ${JSON.stringify(actual)}`);
}

check('off: the timer update never reaches native', await mount_and_wait(false), ['0']);
check('on: the timer update commits itself', await mount_and_wait(true), ['1']);

if (failures > 0) {
	console.error(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log('\nautocommit ok');
