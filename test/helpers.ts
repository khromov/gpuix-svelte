/**
 * Every input the test renderer can simulate has a helper that drains and settles the
 * way `click` does, so tests stop reaching for `native.simulate*`. This runs each one
 * through the real hit testing against a fixture that reports what it received.
 */

import {
	mount_headless,
	find_test_id,
	find_text,
	all_text,
	bounds,
	click,
	focus,
	type,
	hover,
	mouse_down,
	mouse_move,
	mouse_up,
	wheel,
	drag,
	drag_select,
	selected_text,
	clear_selection,
	painted_highlights,
	key_up,
	clock_pause,
	clock_set,
	clock_fast_forward,
	clock_resume,
	advance_time,
	wait_for,
	center,
	point_of,
	automation_tree,
	check,
	finish,
	type AutomationNode
} from 'gpuix-svelte/test';

const Helpers = (await import('./Helpers.svelte')).default;
const { native } = mount_headless(Helpers, { width: 400, height: 500 });

const node = (id: string) => find_test_id(id)!;
const has = (text: string) => all_text().includes(text);

advance_time(1000);
check("advance_time moves GPUI's executor clock, not setTimeout's", has('waiting'), true);
const ready = await wait_for(() => find_text('ready'));
check('wait_for resolves when the timer flips the text', ready.text, 'ready');
const timed_out = await wait_for(() => find_text('never'), { timeout: 100, label: 'never' }).then(
	() => 'resolved',
	(error: Error) => error.message
);
check('and rejects with the label after the timeout', timed_out, '[gpuix-svelte/test] wait_for(never) timed out after 100 ms');

hover(node('hover'));
check('hover fires mouseenter through the real hit test', has('hover: in'), true);
hover({ x: 300, y: 20 });
check('moving away fires mouseleave', has('hover: out'), true);

const find_auto = (id: string, at: AutomationNode | null | undefined = automation_tree()): AutomationNode | undefined =>
	at?.testId === id ? at : at?.children?.map((child) => find_auto(id, child)).find(Boolean);
const auto_pad = find_auto('pad')!;
check('automation_tree carries the painted bounds the tree JSON lacks', [auto_pad.bounds, 'bounds' in node('pad')], [bounds(node('pad')), false]);
hover(find_auto('hover')!);
check('and its nodes are targets too', has('hover: in'), true);

const pad = center(node('pad'));
drag({ x: pad.x - 80, y: pad.y }, { x: pad.x + 80, y: pad.y }, { steps: 4 });
check('a drag reports the pressed button on every move', node('pad-log').children?.[0]?.text, 'down:0 move:0 move:0 move:0 move:0 up:0');
mouse_down(pad, { button: 2 });
mouse_move({ x: pad.x + 10, y: pad.y }, { pressed_button: 2 });
mouse_up({ x: pad.x + 10, y: pad.y }, { button: 2 });
check('mouse_down, mouse_move and mouse_up carry the button they were given', node('pad-log').children?.[0]?.text, 'down:2 move:2 up:2');

const column = node('column');
wheel(column, 0, -40);
check('wheel over the column scrolls it', native.getScrollOffset(column.id), [0, -40]);

const l1 = bounds(node('line-1'))!;
const l2 = bounds(node('line-2'))!;
const selected = drag_select({ x: l1.x + 1, y: l1.y + l1.height / 2 }, { x: l2.x + l2.width - 1, y: l2.y + l2.height / 2 });
check('drag_select returns the text between the two points', selected, 'alpha beta\ngamma delta');
check('selected_text agrees', selected_text(), selected);
clear_selection();
check('clear_selection empties it', selected_text(), null);

const [match] = painted_highlights();
check(
	'painted_highlights reports the match and its rect',
	[match?.text.slice(match.start, match.end), match?.elementId === find_text('find the needle here')?.id, match?.rects.length],
	['needle', true, 1]
);

focus(node('field'));
type('h i');
key_up('x');
check("key_up reaches the focused field's onkeyup", has('field: hi up: x'), true);

const left = () => Math.round(bounds(node('mover'))!.x - bounds(node('hover'))!.x);
const t0 = clock_pause();
click(node('start'));
check('clock_pause holds a motion at its start', left(), 0);
const t1 = clock_fast_forward(500);
check('clock_fast_forward returns the new time and moves the motion with it', [Math.round(t1 - t0), left()], [500, 100]);
clock_fast_forward(600);
check('clock_pause + clock_fast_forward lands the motion at its end', left(), 200);
check('clock_set and clock_resume report the time they leave', [clock_set(t1 + 2000), clock_resume()].map((t) => Math.round(t - t1)), [2000, 2000]);

let outside = '';
try {
	center(node('far'));
} catch (error) {
	outside = (error as Error).message;
}
// Windows ignores the requested size altogether, so only macOS has a cap to name.
const tail = process.platform === 'darwin' ? 'headless viewport (its height caps at 538)' : 'headless viewport';
check('center() outside the viewport says so, naming the cap where there is one', /outside the \d+×\d+ /.test(outside) && outside.endsWith(tail), true);
check('point_of passes a point through and centres a node', [point_of({ x: 3, y: 4 }), point_of(node('pad'))], [{ x: 3, y: 4 }, pad]);

finish('helpers', 21);
