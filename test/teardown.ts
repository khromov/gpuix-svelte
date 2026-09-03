/**
 * Removals queue no mutation of their own, so nothing marked the tree dirty and
 * a frame that only removed nodes never committed. The other two cases here are
 * the same theme: what a node leaves behind when it stops being native.
 */

import { TestGpuixRenderer } from '@gpuix/native';
import { flushSync } from 'svelte';
import { renderer, set_native, create_root, is_dirty, dispatch, type ShadowNode } from 'gpuix-svelte';
import { mount_headless, settle, all_text, check, finish } from 'gpuix-svelte/test';

/** A root with no component in it, for trees built by hand. */
function fresh(width?: number, height?: number) {
	const native = new TestGpuixRenderer(width, height);
	set_native(native);
	const root = create_root();
	const anchor = renderer.createComment('');
	renderer.insert(root, anchor, null);
	return { native, root, anchor };
}

// --- a removal-only update has to raise the dirty flag by itself -----------
{
	const Reorder = (await import('./Reorder.svelte')).default;
	const { component } = mount_headless(Reorder);
	check('mounted with the {#if} live', all_text().includes('IF'), true);

	// Hiding the {#if} touches no sibling text or attribute, so this is the only
	// signal the frame loop will ever get.
	component.toggle(false);
	flushSync();
	check('removal-only update marks the tree dirty', is_dirty(), true);

	settle();
	check('and the removed node is gone once committed', all_text(), [
		'head',
		'1',
		'2',
		'3',
		'4',
		'5',
		'tail'
	]);
}

// --- text that goes blank must give its layout slot back ------------------
{
	const { native, root, anchor } = fresh(400, 200);
	const row = renderer.createElement('div');
	renderer.setAttribute(row, 'style', 'display: flex; flex-direction: row; gap: 20px');
	renderer.insert(root, row, anchor);

	const texts = ['A', 'B', 'C'].map((content) => {
		const t = renderer.createTextNode(content);
		renderer.insert(row, t, null);
		return t;
	});

	settle();
	const x = (n: ShadowNode) => Math.round(native.getElementBounds(n.nativeId!)![0]);
	const b_before = x(texts[1]);
	const c_before = x(texts[2]);
	check('row laid out left to right', b_before < c_before, true);

	renderer.setText(texts[1], '');
	check('blanked text drops its native id', texts[1].nativeId, null);
	settle();

	check('the blanked text is no longer painted', all_text(), ['A', 'C']);
	// A reclaimed slot means C slides into exactly where B used to start.
	check('and its layout slot is reclaimed', x(texts[2]), b_before);

	// The promotion direction still has to work afterwards.
	renderer.setText(texts[1], 'B');
	settle();
	check('re-filled text comes back in order', all_text(), ['A', 'B', 'C']);
	check('and pushes the row back out', x(texts[2]), c_before);
}

// --- a destroyed node that comes back must still hear events --------------
{
	const { native, root, anchor } = fresh();
	const button = renderer.createElement('div');
	let clicks = 0;
	renderer.addEventListener(button, 'click', () => clicks++);
	renderer.insert(root, button, anchor);
	settle();
	check('listener registered while live', native.hasEventListener(button.nativeId!, 'click'), true);

	renderer.remove(button);
	settle();
	check('destroy returns the node to virtual', button.nativeId, null);

	renderer.insert(root, button, anchor);
	settle();
	check('re-inserted node is native again', button.nativeId !== null, true);
	check('and its listener was re-emitted', native.hasEventListener(button.nativeId!, 'click'), true);

	// Straight at the node on purpose: the listener's survival is what is under test.
	dispatch({ elementId: button.nativeId!, eventType: 'click' });
	check('so the handler still fires', clicks, 1);
}

finish('teardown', 14);
