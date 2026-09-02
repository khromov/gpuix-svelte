/**
 * Everything the window's own plumbing has to survive: a throw must not take
 * the frame loop or the native event callback with it, and a remount must not
 * leave the tree rootless between two batches.
 */

import { TestGpuixRenderer } from '@gpuix/native';
import renderer, { set_native, create_root, commit, queue_destroy, set_auto_commit } from '../src/renderer.js';
import { handle_event, start_frame_loop } from '../src/render.js';
import { check, finish } from 'gpuix-svelte/test';

// --- a throwing commit must not kill the frame loop -----------------------
{
	let ticks = 0;
	const exploding = {
		requiresTick: () => true,
		tick: () => (ticks++, true),
		applyBatch: () => {
			throw new Error('boom');
		},
		commitMutations: () => {}
	};

	set_native(exploding);
	create_root();

	console.log('-- the next line should report one failed commit --');
	const loop = start_frame_loop(exploding);
	await new Promise((resolve) => setTimeout(resolve, 60));
	loop.stop();

	check('the loop keeps ticking after a commit throws', ticks > 1, true);
}

// --- a throwing handler must not escape the native callback ---------------
{
	const native = new TestGpuixRenderer();
	set_native(native);
	const root = create_root();
	const anchor = renderer.createComment('');
	renderer.insert(root, anchor, null);

	const button = renderer.createElement('div');
	renderer.addEventListener(button, 'click', () => {
		throw new Error('handler blew up');
	});
	renderer.insert(root, button, anchor);
	commit();
	native.flush();

	let seen = null;
	let escaped = null;
	console.log('-- the next line should report one failed handler --');
	try {
		handle_event({ elementId: button.nativeId, eventType: 'click' }, (e) => (seen = e.eventType));
	} catch (error) {
		escaped = error.message;
	}

	check('the exception does not reach the caller', escaped, null);
	check("and the host's onEvent still runs", seen, 'click');
}

// --- a remount retires the old root inside the new tree's batch -----------
{
	const native = new TestGpuixRenderer();
	set_native(native);
	const first = create_root();
	commit();
	native.flush();
	check('first root is live', JSON.parse(native.getTreeJson()).id, first.nativeId);

	let batches = 0;
	const applyBatch = native.applyBatch.bind(native);
	native.applyBatch = (json) => (batches++, applyBatch(json));

	// What `render()` does on a remount, in the same order.
	const retiring = first.nativeId;
	set_native(native);
	const second = create_root();
	queue_destroy(retiring);
	commit();
	native.flush();

	check('the swap costs exactly one batch', batches, 1);
	check('the new root survives it', JSON.parse(native.getTreeJson()).id, second.nativeId);
	check('and the old root is gone', native.getRetainedElementCount(), 1);
}

set_auto_commit(false);

finish('lifecycle');
