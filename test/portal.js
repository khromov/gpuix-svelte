/**
 * GPUI paints in document order, so a modal or toast had to be the root's last
 * child. A `<Portal>` renders from wherever the dialog is needed and still lands
 * on top — the shadow node stays put and only the native node moves to the root.
 */

import { mount_headless, tree, find_test_id, click_test_id, click_at, all_text, check, finish } from 'gpuix-svelte/test';

const Fixture = (await import('./PortalFixture.svelte')).default;
const { native } = mount_headless(Fixture, { width: 400, height: 300 });

const hits = () => all_text().find((t) => /^\d+-\d+-\d+$/.test(t));
const last_root_child = () => tree().children.at(-1);
const holds = (node, id) => JSON.stringify(node).includes(`"testId":"${id}"`);

check("the portal's content is the root's last native child", holds(last_root_child(), 'over'), true);
check('and no longer sits under its shadow parent natively', holds(find_test_id('inner'), 'over'), false);
// Windows ignores the requested headless size, so the window is whatever native says it is.
const { width, height } = native.getWindowSize();
check('the wrapper covers the window without a hitbox', [last_root_child().style.pointerEvents, native.getElementBounds(last_root_child().id)], ['none', [0, 0, width, height]]);

click_test_id('over');
check('a click where both overlap reaches the portal, not the later sibling', hits(), '0-1-0');
click_at(200, 110);
check('the sibling still takes clicks outside the portal', hits(), '1-1-0');

click_test_id('toggle');
check('removing the {#if} takes the portal out natively', find_test_id('over'), null);
check("and the sibling after it in the same branch — Svelte's teardown walk still finds it", find_test_id('tail'), null);
check('nothing leaks in the id map', native.getRetainedElementCount() < 20, true);

click_test_id('toggle');
check('it comes back on the next render', holds(last_root_child(), 'over'), true);
click_test_id('over');
check('and is clickable again', hits(), '1-2-0');

click_test_id('add');
check('a later portal is appended after the earlier one', holds(last_root_child(), 'second'), true);
click_at(60, 50);
check('so it paints and clicks on top where they overlap', hits(), '1-2-1');

finish('portal');
