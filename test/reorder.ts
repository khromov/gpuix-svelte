/**
 * `{#each}` reordering re-inserts each node before an anchor with no GPUI presence,
 * which is the one place the projection can silently produce the wrong native order.
 */

import { renderer } from 'gpuix-svelte';
import { mount_headless, settle, all_text, painted, check, finish } from 'gpuix-svelte/test';

const Reorder = (await import('./Reorder.svelte')).default;
const { component, root, anchor } = mount_headless(Reorder);

const around = (items: number[]) => ['head', 'IF', ...items.map(String), 'tail'];

function order(label: string, expected: string[]) {
	settle();
	check(label, all_text(), expected);
}

order('initial', around([1, 2, 3, 4, 5]));

const cases = [
	[5, 4, 3, 2, 1],
	[1, 2, 3, 4, 5],
	[2, 1, 3, 5, 4],
	[3, 1, 2, 5, 4],
	[1, 2, 3],
	[9, 1, 2, 3],
	[9, 1, 7, 2, 3, 8],
	[8, 3, 2, 7, 1, 9],
	[],
	[4, 2],
	[2, 4]
];

for (const next of cases) {
	component.set(next);
	order(`set ${JSON.stringify(next)}`, around(next));
}

// the {#if} sits between "head" and the each-block: toggling it must not
// disturb the surrounding native order
component.toggle(false);
order('hide {#if}', ['head', '2', '4', 'tail']);

component.set([1, 2, 3]);
order('reorder while {#if} hidden', ['head', '1', '2', '3', 'tail']);

component.toggle(true);
order('show {#if} again', ['head', 'IF', '1', '2', '3', 'tail']);

// By hand, because a keyed {#each} moves its rows with no remove in between, so nothing above takes these paths.
const moved = renderer.createElement('div');
renderer.insert(moved, renderer.createTextNode('moved'), null);
renderer.insert(root, moved, anchor);
settle();
const moved_id = moved.nativeId;
const has_moved = () => painted().split('\n').includes('moved');
check('a hand-built node is painted to begin with', has_moved(), true);

renderer.remove(moved);
renderer.insert(root, moved, anchor);
settle();
check('removed and re-inserted in one frame, it stays the same native node', [moved.nativeId, has_moved()], [moved_id, true]);

const offscreen = renderer.createFragment();
renderer.insert(offscreen, moved, null);
renderer.insert(root, offscreen, anchor);
settle();
check('parked offscreen and brought back in one frame, too', [moved.nativeId, has_moved()], [moved_id, true]);

renderer.insert(offscreen, moved, null);
settle();
check('left parked offscreen, it stops painting', has_moved(), false);

const row = renderer.createElement('div');
const mover = renderer.createElement('div');
renderer.insert(mover, renderer.createTextNode('mover'), null);
for (const n of [renderer.createTextNode('left'), mover, renderer.createTextNode('right')]) renderer.insert(row, n, null);
renderer.insert(root, row, anchor);
const in_row = () => all_text().filter((t) => ['left', 'mover', 'right'].includes(t));
settle();
check('text around an element starts in order', in_row(), ['left', 'mover', 'right']);

// The texts left beside each other are rebuilt without their wrappers, which has to happen where the mover now is natively.
renderer.insert(row, mover, null);
settle();
check('moving the element past the second text keeps the texts in order', in_row(), ['left', 'right', 'mover']);

finish('reorder', 21);
