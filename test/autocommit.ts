/**
 * Windows/Linux get no frame loop to poll `is_dirty()`, so a mutation with no
 * native event behind it has to drain itself or it sits in the queue.
 */

import { TestGpuixRenderer } from '@gpuix/native';
import { set_native, create_root, set_auto_commit } from 'gpuix-svelte';
import { mount_headless, check, finish } from 'gpuix-svelte/test';

async function mount_and_wait(auto: boolean) {
	// Before the mount, so the component's first timer already runs under it.
	set_auto_commit(auto);
	const AutoCommit = (await import('./AutoCommit.svelte')).default;
	const { native, unmount } = mount_headless(AutoCommit);

	let batches = 0;
	const applyBatch = native.applyBatch.bind(native);
	native.applyBatch = (json) => (batches++, applyBatch(json));

	// Nothing below settles — the timer inside the component is the only thing
	// driving the update.
	await new Promise((resolve) => setTimeout(resolve, 50));
	native.flush();
	const text = native.getAllText();

	// The next run swaps in a fresh native, so these effects must not outlive it.
	unmount();
	set_auto_commit(false);
	return { text, batches };
}

check('off: the timer update never reaches native', (await mount_and_wait(false)).text, ['0', '0']);
const on = await mount_and_wait(true);
check('on: the timer update commits itself', on.text, ['1', '1']);
check('on: its two text updates ship as one batch', on.batches, 1);

// Nothing wraps the microtask, so if this throw escaped it would end the process here.
{
	const native = new TestGpuixRenderer();
	native.applyBatch = () => {
		throw new Error('native went away');
	};
	set_native(native);
	set_auto_commit(true);
	const logged: unknown[] = [];
	const error = console.error;
	console.error = (message) => logged.push(message);
	create_root();
	await Promise.resolve();
	console.error = error;
	set_auto_commit(false);
	check('on: a commit that throws is logged', logged, ['[gpuix-svelte] commit failed:']);
}

// A leaked flag would make every later test file self-commit on a microtask.
{
	const native = new TestGpuixRenderer();
	set_native(native);
	create_root();
	await Promise.resolve();
	native.flush();
	check('auto-commit does not outlive the run', native.getRetainedElementCount(), 0);
}

finish('autocommit', 5);
