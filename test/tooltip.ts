/**
 * GPUI's `<anchored>` hangs a deferred layer off its parent; `Tooltip` and `Popover`
 * build on it, so placement, hover and outside presses go through the real pipeline.
 */

import {
	mount_headless,
	find,
	find_test_id,
	find_text,
	bounds,
	drain,
	settle,
	wait,
	click_at,
	click_test_id,
	press,
	all_text,
	check,
	finish,
	type TreeNode
} from 'gpuix-svelte/test';

const Fixture = (await import('./Floating.svelte')).default;
const { native } = mount_headless(Fixture, { width: 600, height: 400 });

type Box = { x: number; y: number; width: number; height: number };

const box = (node: TreeNode | null): Box => {
	const b = node && bounds(node);
	if (!b) throw new Error(`no painted bounds for ${JSON.stringify(node)}`);
	return b;
};

// The `<anchored>` reports the placed layer's box; its children report theirs inset by their padding.
const layer = (pred: (child: TreeNode) => boolean) => find((n) => n.type === 'anchored' && (n.children ?? []).some(pred));
const layer_of_text = (text: string) => layer((c) => JSON.stringify(c).includes(`"text":"${text}"`));
const layer_of_id = (id: string) => layer((c) => c.testId === id);

const mid_x = (b: Box) => b.x + b.width / 2;
const mid_y = (b: Box) => b.y + b.height / 2;
const near = (a: number, b: number) => Math.abs(a - b) <= 1;
const counts = () => all_text().find((t) => /^\d+-\d+-\d+-\d+-\d+$/.test(t));
const shown = (id: string) => find_test_id(id) !== null;

function move(x: number, y: number) {
	native.simulateMouseMove(x, y);
	// GPUI reports hover changes from the paint after the move.
	native.flush();
	drain();
	settle();
}

// --- the native element ------------------------------------------------------
{
	const parent = box(find_test_id('raw-start'));
	const placed = box(layer_of_text('raw start'));
	check('a bare <anchored> hangs its layer off its parent, gap included', [placed.x, placed.y + placed.height], [parent.x, parent.y - 6]);

	const wide = box(find_test_id('raw-center'));
	const centred = box(layer_of_text('raw center'));
	check(
		"native align: center lands half a layer left of centre (why the components hang from a dot; drop it once this fails)",
		near(centred.x + centred.width, mid_x(wide)),
		true
	);
}

// --- Tooltip -----------------------------------------------------------------
{
	const trigger = box(find_test_id('deco'));
	move(mid_x(trigger), mid_y(trigger));
	check('a decorative trigger shows nothing before the delay', shown('deco-tip'), false);
	await wait(80);
	check('and the tip after it', shown('deco-tip'), true);

	const tip = box(layer_of_id('deco-tip'));
	check('centred above the trigger, 6 px clear of it', [near(mid_x(tip), mid_x(trigger)), tip.y + tip.height], [true, trigger.y - 6]);
	check('with a near-transparent fill on the layer, so GPUI paints no #1a1a1a slab behind it', layer_of_id('deco-tip')!.style?.backgroundColor, '#00000001');

	move(mid_x(tip), mid_y(tip));
	await wait(120);
	check('a pointer that jumps straight onto the tip keeps it open', shown('deco-tip'), true);
	move(2, 2);
	await wait(120);
	check('leaving closes it', shown('deco-tip'), false);

	move(mid_x(trigger), mid_y(trigger));
	await wait(80);
	move(mid_x(trigger), trigger.y - 3);
	await wait(30);
	move(mid_x(tip), mid_y(tip));
	await wait(120);
	check('crossing the gap within the grace keeps it open', shown('deco-tip'), true);
	move(2, 2);
	await wait(120);
}

{
	check('on* handlers spread from the snippet parameter reach the trigger', [...find_test_id('save-trigger')!.events!].sort(), ['click', 'mouseEnter', 'mouseLeave']);

	const anchor = box(find_test_id('save'));
	move(mid_x(anchor), mid_y(anchor));
	await wait(80);
	check('so a trigger with a listener of its own still opens the tip', shown('save-tip'), true);

	const tip = box(layer_of_id('save-tip'));
	check('side="bottom" centres it below', [near(mid_x(tip), mid_x(anchor)), tip.y], [true, anchor.y + anchor.height + 6]);
	click_at(mid_x(tip), mid_y(tip));
	check('a click on the tip falls through to what lies beneath', counts(), '0-1-0-0-0');
	click_test_id('save-trigger');
	check("and the trigger's own click still fires", counts(), '1-1-0-0-0');
	move(2, 2);
	await wait(120);
}

{
	const anchor = box(find_test_id('pinned'));
	check('open forces the tip without a hover, and content can be a snippet', find_text('Rich') !== null, true);
	const tip = box(layer_of_id('pinned-tip'));
	check('side="right" centres it beside a trigger whose wrapper the column stretched', [tip.x, near(mid_y(tip), mid_y(anchor))], [anchor.x + anchor.width + 6, true]);
}

// --- Popover -----------------------------------------------------------------
{
	click_test_id('menu-trigger');
	check("the trigger's click opens it", shown('menu-panel'), true);
	const anchor = box(find_test_id('menu'));
	const panel = box(layer_of_id('menu-panel'));
	check('below the trigger, start-aligned, 4 px clear', [panel.x, panel.y], [anchor.x, anchor.y + anchor.height + 4]);

	click_test_id('menu-item');
	check('a click inside the panel leaves it open', [counts(), shown('menu-panel')], ['1-1-0-1-0', true]);
	click_test_id('elsewhere');
	check('a press outside closes it, and the click still lands', [counts(), shown('menu-panel')], ['1-1-1-1-1', false]);

	click_test_id('menu-trigger');
	press('escape');
	check('Escape closes it', [counts(), shown('menu-panel')], ['1-1-2-1-1', false]);

	click_test_id('menu-trigger');
	click_test_id('menu-trigger');
	check('a click on its own trigger closes it without onclose racing a reopen', [counts(), shown('menu-panel')], ['1-1-2-1-1', false]);
	press('escape');
	check('Escape does nothing once it is closed', counts(), '1-1-2-1-1');

	click_test_id('menu-trigger');
	click_test_id('elsewhere', { button: 2 });
	check('a right click outside closes it too', [counts(), shown('menu-panel')], ['1-1-3-1-1', false]);
}

finish('tooltip', 24);
