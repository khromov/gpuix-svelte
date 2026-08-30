/**
 * `{#each}` reordering re-inserts each node before an anchor with no GPUI presence,
 * which is the one place the projection can silently produce the wrong native order.
 */

import { TestGpuixRenderer } from '@gpuix/native';
import { mount, flushSync } from 'svelte';
import renderer, { set_native, create_root, commit } from '../src/renderer.js';

const native = new TestGpuixRenderer();
set_native(native);

const root = create_root();
const anchor = renderer.createComment('');
renderer.insert(root, anchor, null);

const Reorder = (await import('./Reorder.svelte')).default;
const component = mount(Reorder, { renderer, target: root, anchor, props: {} });
flushSync();
commit();
native.flush();

let failures = 0;

function check(label, expected) {
	flushSync();
	commit();
	native.flush();
	const actual = native.getAllText();
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}\n       want ${JSON.stringify(expected)}\n       got  ${JSON.stringify(actual)}`);
}

const around = (items) => ['head', 'IF', ...items.map(String), 'tail'];

check('initial', around([1, 2, 3, 4, 5]));

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
	check(`set ${JSON.stringify(next)}`, around(next));
}

// the {#if} sits between "head" and the each-block: toggling it must not
// disturb the surrounding native order
component.toggle(false);
check('hide {#if}', ['head', '2', '4', 'tail']);

component.set([1, 2, 3]);
check('reorder while {#if} hidden', ['head', '1', '2', '3', 'tail']);

component.toggle(true);
check('show {#if} again', ['head', 'IF', '1', '2', '3', 'tail']);

console.log(failures === 0 ? '\nall reorder cases passed' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
