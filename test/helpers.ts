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
	click_test_id,
	click_text,
	focus,
	unfocus,
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
	press,
	clock_pause,
	clock_set,
	clock_fast_forward,
	clock_resume,
	advance_time,
	wait,
	wait_for,
	center,
	point_of,
	pump,
	automation_tree,
	check,
	finish,
	type AutomationNode
} from 'gpuix-svelte/test';

const Helpers = (await import('./Helpers.svelte')).default;
const trail: string[] = [];
const { native } = mount_headless(Helpers, { props: { trail }, width: 400, height: 500 });

const node = (id: string) => find_test_id(id)!;
const has = (text: string) => all_text().includes(text);
const refusal = (run: () => unknown) => {
	try {
		run();
		return '';
	} catch (error) {
		return (error as Error).message;
	}
};
const frames_during = (run: () => void) => {
	const before = native.getDebugFrameOverlayStats().frames;
	run();
	return native.getDebugFrameOverlayStats().frames - before;
};

// A focused field's caret blink is one of GPUI's own timers, and each toggle draws a frame a plain pump would not.
focus(node('field'));
const idle_frames = frames_during(pump);
const blink_frames = frames_during(() => advance_time(1000));
check("advance_time moves GPUI's executor clock, not setTimeout's", [blink_frames > idle_frames, has('waiting')], [true, true]);
const ready = await wait_for(() => find_text('ready'));
check('wait_for resolves when the timer flips the text', [ready.text, has('ready')], ['ready', true]);
const never_started = Date.now();
const timed_out = await wait_for(() => find_text('never'), { timeout: 100, label: 'never' }).then(
	() => 'resolved',
	(error: Error) => error.message
);
const never_took = Date.now() - never_started;
check('and rejects with the label after the timeout', [timed_out, never_took >= 100 && never_took < 1500], ['[gpuix-svelte/test] wait_for(never) timed out after 100 ms', true]);

hover(node('covered'));
const covered_stayed_out = has('covered: no');
hover(node('hover'));
check('hover fires mouseenter through the real hit test', [has('hover: in'), covered_stayed_out], [true, true]);
hover({ x: 300, y: 20 });
check('moving away fires mouseleave', has('hover: out'), true);

const find_auto = (id: string, at: AutomationNode | null | undefined = automation_tree()): AutomationNode | undefined =>
	at?.testId === id ? at : at?.children?.map((child) => find_auto(id, child)).find(Boolean);
const auto_pad = find_auto('pad')!;
check('automation_tree carries the painted bounds the tree JSON lacks', [auto_pad.bounds, 'bounds' in node('pad')], [bounds(node('pad')), false]);
hover(find_auto('hover')!);
check('and its nodes are targets too', has('hover: in'), true);

const pad_log = () => node('pad-log').children?.[0]?.text;
const pad = center(node('pad'));
const from = { x: pad.x - 80, y: pad.y - 8 };
const to = { x: pad.x + 80, y: pad.y + 8 };
const along = (t: number) => `${Math.round(from.x + (to.x - from.x) * t)},${Math.round(from.y + (to.y - from.y) * t)}`;
drag(from, to, { steps: 4 });
check('a drag reports the pressed button on every move', pad_log(), 'down:0 move:0 move:0 move:0 move:0 up:0');
check('a drag moves onto its start, presses there and travels in even steps to its end', trail, [
	'enter',
	`move@${along(0)}`,
	`down@${along(0)}`,
	`move@${along(0.25)}`,
	`move@${along(0.5)}`,
	`move@${along(0.75)}`,
	`move@${along(1)}`,
	`up@${along(1)}`
]);
drag(from, to, { button: 2, modifiers: 'shift' });
check('a drag takes 8 steps by default and carries its button and modifiers throughout', pad_log(), ['down:2+shift', ...Array(8).fill('move:2+shift'), 'up:2+shift'].join(' '));
mouse_down(pad, { button: 2, modifiers: 'shift' });
mouse_move({ x: pad.x + 10, y: pad.y }, { pressed_button: 2, modifiers: 'shift' });
hover({ x: pad.x + 12, y: pad.y }, { pressed_button: 2, modifiers: 'shift' });
mouse_up({ x: pad.x + 10, y: pad.y }, { button: 2, modifiers: 'shift' });
check('mouse_down, mouse_move, hover and mouse_up carry the button and modifiers they were given', pad_log(), 'down:2+shift move:2+shift move:2+shift up:2+shift');

const column = node('column');
wheel(column, -30, -40, { modifiers: 'shift' });
check('wheel over the column scrolls it, and its handler has run by the time it returns', [native.getScrollOffset(column.id), has('wheeled: -30,-40+shift')], [[-30, -40], true]);

const l1 = bounds(node('line-1'))!;
const l2 = bounds(node('line-2'))!;
const selected = drag_select({ x: l1.x + 1, y: l1.y + l1.height / 2 }, { x: l2.x + l2.width - 1, y: l2.y + l2.height / 2 });
check('drag_select returns the text between the two points', selected, 'alpha beta\ngamma delta');
check('selected_text agrees', selected_text(), 'alpha beta\ngamma delta');
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
press('y');
const not_held = has('held: no');
press('y', { held: true });
check('press carries held, off by default', [not_held, has('held: yes')], [true, true]);

const focus_log = () => node('focus-log').children?.[0]?.text;
focus(node('focus-a'));
focus(node('focus-b'));
check('focus reports one focus and one blur per move, from native', focus_log(), 'a:1/1 b:1/0');
unfocus();
focus(node('focus-b'));
check('unfocus blurs, and refocusing what native still holds focuses it again', focus_log(), 'a:1/1 b:2/1');
unfocus();
unfocus();
focus(node('focus-a'));
check("native's own later blur after unfocus is not reported twice, nor is a second unfocus", focus_log(), 'a:2/1 b:2/2');
focus(node('focus-b'));
focus(node('focus-a'));
check('and the next real blur of that element is reported again', focus_log(), 'a:3/2 b:3/3');

const left = () => Math.round(bounds(node('mover'))!.x - bounds(node('hover'))!.x);
const t0 = clock_pause();
click(node('start'));
check('click returns only once what its own paint queued has landed', has('laid: yes'), true);
await wait(60);
check('clock_pause holds a motion at its start', left(), 0);
const t1 = clock_fast_forward(500);
check('clock_fast_forward returns the new time and moves the motion with it', [Math.round(t1 - t0), left()], [500, 100]);
clock_fast_forward(600);
check('clock_pause + clock_fast_forward lands the motion at its end, and motionComplete has landed too', [left(), has('landed: yes')], [200, true]);
const t2 = clock_set(t1 + 2000);
const t3 = clock_resume();
check('clock_set and clock_resume report the time they leave', [t2, t3].map((t) => Math.round(t - t1)), [2000, 2000]);
await wait(40);
check('clock_resume lets the clock run on, and wait() really waited', clock_pause() - t3 >= 20, true);
clock_resume();

const refused = ['far', 'far-right', 'far-left', 'far-up'].map((id) => refusal(() => center(node(id))));
// Windows ignores the requested size altogether, so only macOS has a cap to name.
const tail = process.platform === 'darwin' ? 'headless viewport (its height caps at 538)' : 'headless viewport';
check('center() outside the viewport says so, naming the cap where there is one', refused.map((outside) => /outside the \d+×\d+ /.test(outside) && outside.endsWith(tail)), [true, true, true, true]);
const pad_box = bounds(node('pad'))!;
check('point_of passes a point through and centres a node', [point_of({ x: 3, y: 4 }), point_of(node('pad'))], [{ x: 3, y: 4 }, { x: pad_box.x + pad_box.width / 2, y: pad_box.y + pad_box.height / 2 }]);
check(
	'clicking what is not there throws rather than passing quietly',
	[refusal(() => click_text('no such text')), refusal(() => click_test_id('no-such-id')), refusal(() => click(999_999))],
	['[gpuix-svelte/test] no text "no such text" in the tree', '[gpuix-svelte/test] no testId "no-such-id" in the tree', '[gpuix-svelte/test] element 999999 has no painted bounds']
);

finish('helpers', 31);
