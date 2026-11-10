/**
 * GPUI paints in document order, so a modal or toast had to be the root's last
 * child. A `<Portal>` renders from wherever the dialog is needed and still lands
 * on top — the shadow node stays put and only the native node moves to the root.
 */

import { node_of } from 'gpuix-svelte/renderer';
import { mount_headless, tree, find_test_id, click_test_id, click_at, all_text, check, finish, type TreeNode } from 'gpuix-svelte/test';

const Fixture = (await import('./PortalFixture.svelte')).default;
const { native } = mount_headless(Fixture, { width: 400, height: 300 });

const hits = () => all_text().find((t) => /^\d+-\d+-\d+$/.test(t));
const last_root_child = () => tree().children!.at(-1)!;
const holds = (node: TreeNode | null, id: string) => JSON.stringify(node).includes(`"testId":"${id}"`);
// The app's own element holds everything below it, so "on top" has to mean the last root child or its direct child.
const on_top = (id: string) => {
	const last = last_root_child();
	return last.testId === id || (last.children ?? []).some((c) => c.testId === id);
};
const ids = (node: TreeNode): number[] => [node.id, ...(node.children ?? []).flatMap(ids)];
// tree() folds the node the renderer wraps plain text in, and native counts both.
const raw = () => JSON.parse(native.getTreeJson()) as TreeNode;
const raw_test_id = (node: TreeNode, id: string): TreeNode | null =>
	node.testId === id ? node : ((node.children ?? []).map((c) => raw_test_id(c, id)).find(Boolean) ?? null);

check("the portal's content is the root's last native child", on_top('over'), true);
check('and no longer sits under its shadow parent natively', holds(find_test_id('inner'), 'over'), false);
// Windows ignores the requested headless size, so the window is whatever native says it is.
const { width, height } = native.getWindowSize();
check('the wrapper covers the window without a hitbox', [last_root_child().style?.pointerEvents, native.getElementBounds(last_root_child().id)], ['none', { x: 0, y: 0, width, height }]);

click_test_id('over');
check('a click where both overlap reaches the portal, not the later sibling', hits(), '0-1-0');
click_at(200, 110);
check('the sibling still takes clicks outside the portal', hits(), '1-1-0');

const gone = [...ids(raw_test_id(raw(), 'inner')!), ...ids(raw().children!.at(-1)!)];
const retained = native.getRetainedElementCount();
click_test_id('toggle');
check('removing the {#if} takes the portal out natively', find_test_id('over'), null);
check('and the element it was rendered in goes too', find_test_id('tail'), null);
check('nothing leaks in the id map', [native.getRetainedElementCount(), gone.filter((id) => node_of(id) !== null)], [retained - gone.length, []]);

// Heading its branch, the portal is what Svelte's teardown has to walk through to reach the rest.
const branch = () => [find_test_id('branch-over') != null, find_test_id('branch-tail') != null];
click_test_id('branch');
check('a portal can head an {#if} branch', branch(), [true, true]);
click_test_id('branch');
check("and the sibling after it in the same branch — Svelte's teardown walk still finds it", branch(), [false, false]);

click_test_id('toggle');
check('it comes back on the next render', on_top('over'), true);
click_test_id('over');
check('and is clickable again', hits(), '1-2-0');

// A portal is not in its shadow parent's native child list, so it can never be the
// anchor a sibling inserted ahead of it lands before.
click_test_id('addlead');
const inner = () => (find_test_id('inner')!.children ?? []).map((c) => c.testId ?? c.text);
check('a sibling inserted ahead of a live portal lands before the tail', inner(), ['lead', 'tail']);
click_test_id('addlead');
check('and removing it leaves the tail alone', inner(), ['tail']);

click_test_id('add');
check('a later portal is appended after the earlier one', on_top('second'), true);
click_at(60, 50);
check('so it paints and clicks on top where they overlap', hits(), '1-2-1');

// `portal` is a flag, so its false forms have to leave the element where it is.
const row = () => find_test_id('row');
check('portal="false" stays with its parent', holds(row(), 'static-off'), true);
check('so does portal={false}', holds(row(), 'dynamic'), true);
click_test_id('float');
check('turned on, it moves to the root', [on_top('dynamic'), holds(row(), 'dynamic')], [true, false]);
click_test_id('float');
check('turned off again, it returns to its place among its siblings', [on_top('dynamic'), (row()!.children ?? []).at(-2)?.testId], [false, 'dynamic']);

const run = () => (raw_test_id(raw(), 'run')!.children ?? []).map((c) => c.children?.length ?? 0);
const wrapped = run();
click_test_id('lift');
const joined = run();
click_test_id('lift');
check('text either side of an element that becomes a portal joins into one bare run, and splits again', [wrapped, joined, run()], [[1, 1, 1], [0, 0], [1, 1, 1]]);

finish('portal', 21);
