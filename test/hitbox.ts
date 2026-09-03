/**
 * A painted child occludes its parent's hitbox and `<svg>` inherits no colour, so
 * every badge and icon inside a card needed its own escape hatch. `hitbox="self"`
 * and colour inheritance are those defaults, checked through the real hit testing.
 */

import { TestGpuixRenderer } from '@gpuix/native';
import { renderer, set_native, create_root, commit } from 'gpuix-svelte';
import { mount_headless, find_test_id, click_test_id, all_text, check, finish } from 'gpuix-svelte/test';

const Hitbox = (await import('./Hitbox.svelte')).default;
mount_headless(Hitbox, { width: 400, height: 300 });

const pe = (id: string) => find_test_id(id)!.style?.pointerEvents ?? null;
const counts = () => all_text().find((t) => /^\d+-\d+$/.test(t));

check('a painted badge under hitbox="self" gets pointer-events: none', pe('badge'), 'none');
check('so does an <img>', pe('pic'), 'none');
check('a child with its own listener keeps its hitbox', pe('button'), null);
check("while that child's decoration loses it", pe('inner'), 'none');
check('an <input> keeps it', pe('field'), null);
check('so does a painted element that is merely focusable', pe('focusable'), null);
check('a scroll container keeps it', pe('scroller'), null);

click_test_id('badge');
check('a click on the badge reaches the card', counts(), '1-0');
click_test_id('inner');
check('a click on the nested button reaches the button, not the card', counts(), '1-1');

check('an <svg> without a colour paints its ancestor\'s', find_test_id('icon')!.style!.color, 'red');
check('one with its own keeps it', find_test_id('own')!.style!.color, 'blue');
click_test_id('toggle');
check("restyling the ancestor restyles the svg", find_test_id('icon')!.style!.color, 'green');
check('and still leaves the other alone', find_test_id('own')!.style!.color, 'blue');

// --- the attribute and listeners can change after the fact ------------------
{
	const native = new TestGpuixRenderer();
	set_native(native);
	const root = create_root();
	const anchor = renderer.createComment('');
	renderer.insert(root, anchor, null);

	const card = renderer.createElement('div');
	renderer.addEventListener(card, 'click', () => {});
	const badge = renderer.createElement('div');
	renderer.setAttribute(badge, 'style', 'background-color: #555555');
	renderer.insert(card, badge, null);
	renderer.insert(root, card, anchor);
	commit();
	native.flush();

	const badge_pe = () => JSON.parse(native.getTreeJson()).children[0].children[0].style.pointerEvents ?? null;
	check('without the attribute nothing changes', badge_pe(), null);

	renderer.setAttribute(card, 'hitbox', 'self');
	commit();
	native.flush();
	check('setting hitbox="self" later restyles the subtree', badge_pe(), 'none');
	check('and never reaches native as a prop', native.getTreeJson().includes('hitbox'), false);

	const handler = () => {};
	renderer.addEventListener(badge, 'click', handler);
	commit();
	native.flush();
	check('a listener added later earns the hitbox back', badge_pe(), null);

	renderer.removeEventListener(badge, 'click', handler);
	commit();
	native.flush();
	check('and removing it shields the element again', badge_pe(), 'none');

	renderer.removeAttribute(card, 'hitbox');
	commit();
	native.flush();
	check('removing the attribute restores the default', badge_pe(), null);
}

finish('hitbox', 19);
