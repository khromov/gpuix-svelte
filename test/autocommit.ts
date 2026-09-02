/**
 * Windows/Linux get no frame loop to poll `is_dirty()`, so a mutation with no
 * native event behind it has to drain itself or it sits in the queue.
 */

import { TestGpuixRenderer } from '@gpuix/native';
import { set_native, create_root, set_auto_commit } from 'gpuix-svelte';
import { mount_headless, check, finish } from 'gpuix-svelte/test';

async function mount_and_wait(auto) {
	// Before the mount, so the component's first timer already runs under it.
	set_auto_commit(auto);
	const AutoCommit = (await import('./AutoCommit.svelte')).default;
	const { native, unmount } = mount_headless(AutoCommit);

	// Nothing below settles — the timer inside the component is the only thing
	// driving the update.
	await new Promise((resolve) => setTimeout(resolve, 50));
	native.flush();
	const text = native.getAllText();

	// The next run swaps in a fresh native, so these effects must not outlive it.
	unmount();
	set_auto_commit(false);
	return text;
}

check('off: the timer update never reaches native', await mount_and_wait(false), ['0']);
check('on: the timer update commits itself', await mount_and_wait(true), ['1']);

// A leaked flag would make every later test file self-commit on a microtask.
{
	const native = new TestGpuixRenderer();
	set_native(native);
	create_root();
	await Promise.resolve();
	native.flush();
	check('auto-commit does not outlive the run', native.getRetainedElementCount(), 0);
}

finish('autocommit');
