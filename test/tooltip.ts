/**
 * GPUI's `<anchored>` hangs a deferred layer off its parent; `Tooltip` and `Popover`
 * build on it, so placement, hover and outside presses go through the real pipeline.
 */

import {
	mount_headless,
	find,
	find_test_id,
	find_text,
	element_of,
	bounds,
	drain,
	settle,
	wait,
	click_at,
	click_test_id,
	press,
	key_up,
	focus,
	unfocus,
	all_text,
	check,
	finish,
	type TreeNode
} from 'gpuix-svelte/test';
import { on_window_key } from 'gpuix-svelte';

const Fixture = (await import('./Floating.svelte')).default;
const mounted = mount_headless(Fixture, { width: 600, height: 400 });
const { native } = mounted;

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
	const slow = box(find_test_id('slow'));
	move(mid_x(slow), mid_y(slow));
	await wait(60);
	check('a decorative trigger shows nothing before the delay', shown('slow-tip'), false);
	move(2, 2);

	const trigger = box(find_test_id('deco'));
	move(mid_x(trigger), mid_y(trigger));
	await wait(80);
	check('and the tip after it', shown('deco-tip'), true);

	const tip = box(layer_of_id('deco-tip'));
	check('centred above the trigger, 6 px clear of it', [near(mid_x(tip), mid_x(trigger)), tip.y + tip.height], [true, trigger.y - 6]);
	check('with a near-transparent fill on the layer, so GPUI paints no #1a1a1a slab behind it', layer_of_id('deco-tip')!.style?.backgroundColor, '#00000001');
	check('a tip without style keeps its theme colour', find_test_id('deco-tip')!.style?.backgroundColor, '#1c1c1c');

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
	check(
		'the hover handlers alone add no focus listener, which would make a plain trigger focusable',
		[...find_test_id('plain-trigger')!.events!].sort(),
		['mouseEnter', 'mouseLeave']
	);
	check('on* handlers spread from the snippet parameters reach the trigger', [...find_test_id('save-trigger')!.events!].sort(), [
		'blur',
		'click',
		'focus',
		'mouseEnter',
		'mouseLeave'
	]);

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
	const trigger = find_test_id('save-trigger')!;
	unfocus();
	focus(trigger);
	check('keyboard focus shows the tip at once, with no pointer near it', shown('save-tip'), true);
	press('escape');
	check('Escape hides it', shown('save-tip'), false);
	unfocus();
	focus(trigger);
	unfocus();
	await wait(120);
	check('and so does focus moving away', shown('save-tip'), false);

	const anchor = box(find_test_id('save'));
	move(mid_x(anchor), mid_y(anchor));
	focus(trigger);
	move(2, 2);
	await wait(120);
	check('focus that came with the pointer, as a click brings it, leaves with the pointer', shown('save-tip'), false);
	unfocus();

	focus(trigger);
	move(mid_x(anchor), mid_y(anchor));
	move(2, 2);
	await wait(120);
	check('so does focus whose hover GPUI reports a paint later, as after a click', shown('save-tip'), false);
	unfocus();

	move(mid_x(anchor), mid_y(anchor));
	await wait(80);
	const hovered = shown('save-tip');
	press('escape');
	check('Escape hides a tip that hover showed too', [hovered, shown('save-tip')], [true, false]);
	move(2, 2);
	await wait(120);
}

{
	const badge = box(element_of('pinned'));
	check('open forces the tip without a hover, and content can be a snippet', find_text('Rich') !== null, true);
	const tip = box(layer_of_id('pinned-tip'));
	check('side="right" centres it beside a trigger whose wrapper the column stretched', [tip.x, near(mid_y(tip), mid_y(badge))], [badge.x + badge.width + 6, true]);
	const styled = find_test_id('pinned-tip')!.style!;
	check("style lays inline CSS over the tip's own rules and leaves the rest", [styled.backgroundColor, styled.borderRadius, styled.paddingTop], ['#1e66f5', 0, 4]);
	press('escape');
	check('Escape leaves a tip that open forces', find_text('Rich') !== null, true);
}

// --- Popover -----------------------------------------------------------------
{
	click_test_id('menu-trigger');
	check("the trigger's click opens it", shown('menu-panel'), true);
	const anchor = box(find_test_id('menu'));
	const panel = box(layer_of_id('menu-panel'));
	check('below the trigger, start-aligned, 4 px clear', [panel.x, panel.y], [anchor.x, anchor.y + anchor.height + 4]);
	const styled = find_test_id('menu-panel')!.style!;
	check("and style does the same for the panel's", [styled.backgroundColor, styled.borderRadius, styled.borderWidth], ['#dc8a78', 0, 1]);

	click_test_id('menu-item');
	check('a click inside the panel leaves it open', [counts(), shown('menu-panel')], ['1-1-0-1-0', true]);
	click_test_id('elsewhere');
	check('a press outside closes it, and the click still lands', [counts(), shown('menu-panel')], ['1-1-1-1-1', false]);

	click_test_id('menu-trigger');
	press('a');
	check('another key leaves it open', [counts(), shown('menu-panel')], ['1-1-1-1-1', true]);
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

// --- the dismiss stack -----------------------------------------------------------
{
	click_test_id('outer-trigger');
	focus(find_test_id('inner-trigger')!);
	const opened = [shown('outer-panel'), shown('inner-tip')];
	press('escape');
	check('Escape closes only the top layer, the tip inside the popover', [opened, shown('inner-tip'), shown('outer-panel')], [[true, true], false, true]);
	press('escape');
	check('and the next one the popover under it', shown('outer-panel'), false);

	click_test_id('outer-trigger');
	focus(find_test_id('keep')!);
	press('escape');
	check("a key handler's preventDefault keeps it open", shown('outer-panel'), true);
	press('cmd-escape');
	check('and so does a command modifier', shown('outer-panel'), true);
	press('shift-escape');
	check('while the same key that handler lets through closes it', shown('outer-panel'), false);

	click_test_id('outer-trigger');
	focus(find_test_id('stopper')!);
	press('escape');
	check("a key handler's stopPropagation keeps it open too", shown('outer-panel'), true);

	focus(find_test_id('inner-trigger')!);
	press('escape');
	press('escape', { held: true });
	press('escape', { held: true });
	check('a held Escape closes the top layer once, not one per repeat', [shown('inner-tip'), shown('outer-panel')], [false, true]);
	press('escape');
	check('and a fresh press closes the next', shown('outer-panel'), false);

	const off = on_window_key('keydown', (e) => {
		if (e.key === 'escape') e.stopPropagation();
	});
	click_test_id('outer-trigger');
	press('escape');
	off();
	check("a window handler's stopPropagation does not, as it never reached the overlays' own window listeners", shown('outer-panel'), false);

	click_test_id('menu-trigger');
	const pinned = box(element_of('pinned'));
	move(mid_x(pinned), mid_y(pinned));
	await wait(350);
	press('escape');
	check('a tip that open forces, hovered after the popover opened, takes no Escape from it', shown('menu-panel'), false);
	move(2, 2);
}

// Without Tab navigation nothing else asks native for window key events, so an open layer has to.
{
	await mounted.unmount();
	const again = mount_headless(Fixture, { width: 600, height: 400, tabNavigation: false });
	click_test_id('menu-trigger');
	press('escape');
	check('Escape still reaches a layer with tabNavigation off', shown('menu-panel'), false);
	await again.unmount();
}

// Svelte runs the inner popover's effect first when both open in one commit, so only dismiss_scope keeps it on top.
{
	const Nested = (await import('./NestedPopovers.svelte')).default;
	const nested = mount_headless(Nested, { width: 500, height: 400 }).component as unknown as { open_both(): void; read(): boolean[] };
	nested.open_both();
	settle();
	const both = nested.read();
	press('escape');
	check('two popovers opened in one commit close inner first', [both, nested.read()], [[true, true], [true, false]]);
	press('escape');
	check('and the outer one on the next Escape', nested.read(), [false, false]);

	// GPUI's X11 client sends a held key's repeats as presses with isHeld false and no release between them.
	const platform = process.platform;
	Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
	nested.open_both();
	settle();
	press('escape');
	press('escape');
	press('escape');
	check('on Linux a press with no release since the last is a repeat, and closes nothing more', nested.read(), [true, false]);
	key_up('escape');
	press('escape');
	check('while one after the release closes the next layer', nested.read(), [false, false]);

	nested.open_both();
	settle();
	press('escape');
	check('and the layers a hold left closed keep no press from the next ones opened', nested.read(), [true, false]);
	Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

finish('tooltip', 52);
