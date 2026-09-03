/**
 * `{#each}` reordering re-inserts each node before an anchor with no GPUI presence,
 * which is the one place the projection can silently produce the wrong native order.
 */

import { mount_headless, settle, all_text, check, finish } from 'gpuix-svelte/test';

const Reorder = (await import('./Reorder.svelte')).default;
const { component } = mount_headless(Reorder);

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

finish('reorder', 15);
