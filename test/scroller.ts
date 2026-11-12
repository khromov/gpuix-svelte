/**
 * The shipped Scroller draws its own thumb from the heights and offset GPUI reports, because
 * GPUI's own scrollbar takes no pointer; a virtual Scroller keeps GPUI's thumb and drags it
 * through a strip. This runs the wheel, the drag and `follow` through the real hit testing.
 */

import {
	mount_headless,
	find,
	find_test_id,
	bounds,
	center,
	wheel,
	mouse_down,
	mouse_move,
	mouse_up,
	wait,
	painted,
	all_text,
	check,
	finish
} from 'gpuix-svelte/test';

const Tall = (await import('./Tall.svelte')).default;

// The heights arrive as `layout` events after the first paint, and the thumb follows on its 50 ms throttle.
const THUMB_MS = 80;

let { native } = mount_headless(Tall, { width: 400, height: 300 });
let component: Record<string, (arg: number) => void>;
await wait(THUMB_MS);

const column = () => find_test_id('list')!;
const thumb = () => find_test_id('list-thumb')!;
const offset = () => native.getScrollOffset(column().id)?.[1] ?? 0;

const { y: cy, height: ch } = bounds(column())!;
check('the column clips to its viewport', Math.round(ch), 200);
const t0 = bounds(thumb())!;
check('the thumb is the viewport’s share of the content', Math.round(t0.height), Math.round((200 / (30 * 40)) * 200));
check('and starts at the top', Math.round(t0.y - cy), 0);
check('with the package colour, nothing having set --scroller-thumb', thumb().style!.backgroundColor, '#404040');

// A scroll container's bounds move with its own offset, so every wheel aims at the point measured unscrolled.
const column_at = center(column());
wheel(column_at, 0, -120);
// The offset moves after the wheel event returns; the thumb follows on its 50 ms throttle.
await wait(80);
check('a wheel scrolls the column', offset() < 0, true);
const t1 = bounds(thumb())!;
check('and the thumb moves down', t1.y > t0.y, true);

const grip = center(thumb());
mouse_down(grip);
check('a mousedown on the thumb lights it for the drag', thumb().style!.backgroundColor, '#5a5a5a');
const before = offset();
mouse_move({ x: grip.x, y: grip.y + 40 }, { pressed_button: 0 });
check('dragging scrolls further', offset() < before, true);
// Native captures the pointer for the thumb, so its moves keep coming once the pointer leaves the Scroller and the window.
mouse_move({ x: 2000, y: 1500 }, { pressed_button: 0 });
check('a drag far below the window scrolls to the end', Math.round(offset()), 200 - 30 * 40);
mouse_move({ x: -500, y: -400 }, { pressed_button: 0 });
check('and far above it back to the top', Math.round(offset()), 0);
mouse_up({ x: -500, y: -400 });
check('a release out there ends the drag', thumb().style!.backgroundColor, '#404040');
{
	const at = center(thumb());
	mouse_move({ x: at.x, y: at.y + 10 }, { pressed_button: 0 });
	check('so a later move over the thumb scrolls nothing', Math.round(offset()), 0);

	// A release the OS kept from the window arrives as a move with no button held.
	mouse_down(at);
	mouse_move({ x: at.x, y: at.y + 20 }, { pressed_button: 0 });
	const held = offset();
	mouse_move({ x: at.x, y: at.y + 40 });
	mouse_move({ x: at.x, y: at.y + 80 }, { pressed_button: 0 });
	check('a move with no button held ends a drag whose release never came', [held < 0, offset()], [true, held]);
	mouse_up({ x: at.x, y: at.y + 80 });
}

// Reading bounds makes GPUI draw a frame on Windows and Linux, so a plain column may never ask.
({ native, component } = mount_headless(Tall, { width: 400, height: 300 }));
await wait(THUMB_MS);
{
	const at = center(column());
	const asked: string[] = [];
	const read_bounds = native.getElementBounds.bind(native);
	const read_offset = native.getScrollOffset.bind(native);
	native.getElementBounds = (id) => (asked.push('getElementBounds'), read_bounds(id));
	native.getScrollOffset = (id) => (asked.push('getScrollOffset'), read_offset(id));

	await wait(600);
	check('an idle column asks native for nothing', asked, []);
	wheel(at, 0, -120);
	await wait(THUMB_MS);
	component.grow(10);
	await wait(THUMB_MS);
	component.resize(150);
	await wait(THUMB_MS);
	check('and neither does one being scrolled, growing or resized', asked, []);
	native.getElementBounds = read_bounds;
	native.getScrollOffset = read_offset;
}

// Those events are all that keeps the thumb right, so each cause has to move it on its own.
({ native, component } = mount_headless(Tall, { width: 400, height: 300 }));
await wait(THUMB_MS);
{
	const thumb_height = () => Math.round(bounds(thumb())!.height);
	// All of these sizes stay above the thumb's 24 px minimum, which would otherwise hide a stale height.
	check('the thumb starts sized for 30 rows', thumb_height(), Math.round((200 / 1200) * 200));
	component.resize(300);
	await wait(THUMB_MS);
	check('the column being laid out taller grows it', thumb_height(), Math.round((300 / 1200) * 300));
	component.grow(30);
	await wait(THUMB_MS);
	check('content growing with nothing else happening shrinks it', thumb_height(), Math.round((300 / 2400) * 300));

	// `scrollTo` is no wheel, so only `scrollChange` can have told the thumb about it.
	const top = bounds(thumb())!.y;
	native.scrollTo(column().id, 0, -1000);
	await wait(THUMB_MS);
	check('a scroll no wheel caused moves it', Math.round(bounds(thumb())!.y - top), Math.round((1000 / 2100) * (300 - (300 / 2400) * 300)));
}

// Each thumb restyle is a full native frame, so a sustained scroll has to pay one per
// throttle window rather than one per wheel event.
({ native } = mount_headless(Tall, { width: 400, height: 300 }));
await wait(THUMB_MS);
{
	const at = center(column());
	const thumb_id = thumb().id;
	let restyles = 0;
	const applyBatch = native.applyBatch.bind(native);
	native.applyBatch = (json) => {
		if ((JSON.parse(json) as [string, number][]).some(([op, id]) => op === 'setStyle' && id === thumb_id)) restyles++;
		return applyBatch(json);
	};
	const started = performance.now();
	for (let i = 0; i < 24; i++) {
		wheel(at, 0, -30);
		await wait(10);
	}
	await wait(80);
	const elapsed = performance.now() - started;
	native.applyBatch = applyBatch;
	// Bounded by the clock rather than the event count, since a loaded machine stretches the gaps between events past the throttle.
	check('a sustained scroll restyles the thumb on the throttle, not once per event', restyles > 0 && restyles <= elapsed / 50 + 1, true);
}

// The thumb's 24 px minimum is the whole track of a column that short.
({ native, component } = mount_headless(Tall, { width: 400, height: 300 }));
component.resize(20);
await wait(THUMB_MS);
{
	const scrolls: number[] = [];
	const scroll_to = native.scrollTo.bind(native);
	native.scrollTo = (id, x, y) => (scrolls.push(y), scroll_to(id, x, y));
	const grip = center(thumb());
	mouse_down(grip);
	mouse_move(grip, { pressed_button: 0 });
	mouse_move({ x: grip.x, y: grip.y + 3 }, { pressed_button: 0 });
	mouse_up({ x: grip.x, y: grip.y + 3 });
	native.scrollTo = scroll_to;
	check('a column shorter than the thumb minimum gets a thumb that fills it, and dragging it hands native no NaN', [Math.round(bounds(thumb())!.height), scrolls], [20, []]);
}

({ native, component } = mount_headless(Tall, { props: { follow: true }, width: 400, height: 300 }));
await wait(THUMB_MS);
await wait(THUMB_MS);
check('follow pins the bottom of what is there', Math.round(offset()), 200 - 30 * 40);
component.grow(10);
await wait(THUMB_MS);
await wait(THUMB_MS);
check('and keeps it pinned while content grows', Math.round(offset()), 200 - 40 * 40);

// The throttle must not outlive the component: a column that is gone has nothing to follow.
{
	const mounted = mount_headless(Tall, { props: { follow: true }, width: 400, height: 300 });
	await wait(THUMB_MS);
	mounted.component.grow(10);
	// Long enough for the layout that reports the growth to arrive, not for the throttled update it starts.
	await wait(10);
	const own = column().id;
	let scrolls = 0;
	const scroll_to = mounted.native.scrollTo.bind(mounted.native);
	mounted.native.scrollTo = (id, x, y) => {
		if (id === own) scrolls++;
		return scroll_to(id, x, y);
	};
	void mounted.unmount();
	// A plain timer, since `wait` would commit the unmount and hide a late call behind a cleared id.
	await new Promise((resolve) => setTimeout(resolve, 120));
	check('a thumb update still pending at unmount reaches nothing', scrolls, 0);
}

({ native } = mount_headless(Tall, { props: { scroll: false }, width: 400, height: 300 }));
await wait(THUMB_MS);
check('scroll={false} clips instead', column().style!.overflowY, 'hidden');
check('and draws no thumb', Math.round(bounds(thumb())!.height), 0);

// --- virtual: a native <virtual-list> builds only rows near the viewport -------
({ native } = mount_headless(Tall, { props: { virtual: true, rows: 200 }, width: 400, height: 300 }));
await wait(THUMB_MS);
const list_top = () => native.getListScrollTop(column().id)!;
check('a virtual list keeps every row in the tree', all_text().filter((t) => t.startsWith('row ')).length, 200);
check('but paints only the rows near the viewport', painted().includes('row 0') && !painted().includes('row 150'), true);
check('and has GPUI paint its thumb, in the package colour', [column().style!.scrollbarColor, column().style!.scrollbarWidth], ['#404040', 8]);
{
	const row = bounds(find_test_id('row-0')!)!;
	const strip = bounds(find_test_id('list-strip')!)!;
	check("rows stop short of the drag strip, so it never takes a row's clicks", [row.width > 200, row.x + row.width <= strip.x], [true, true]);
}
// The list host itself has no tracked bounds; the box around it and the anchor it reports do.
const { x: vx, y: vy, width: vw } = bounds(find((n) => n.children?.some((c) => c.type === 'virtual-list') ?? false)!)!;
const vh = list_top()[2];
const list_at = { x: vx + vw / 2, y: vy + vh / 2 };
wheel(list_at, 0, -400);
await wait(120);
check('a wheel scrolls the list', list_top()[0] > 0, true);

// GPUI's thumb takes no pointer, so a strip over it does the dragging, under the same capture as the plain thumb.
const strip_x = center(find_test_id('list-strip')!).x;
mouse_move({ x: strip_x, y: vy + 100 });
check('hovering the strip lights the thumb', column().style!.scrollbarColor, '#5a5a5a');
mouse_down({ x: strip_x, y: vy + 10 });
check('a press on the strip lights the thumb', column().style!.scrollbarColor, '#5a5a5a');
const before_index = list_top()[0];
const painted_rows = () => painted().split('\n');
const was_in_view = painted_rows().includes(`row ${before_index}`);
mouse_move({ x: strip_x, y: vy + 70 }, { pressed_button: 0 });
check('dragging the strip scrolls the list', list_top()[0] > before_index, true);
check('and the rows it left are no longer painted', [was_in_view, painted_rows().includes(`row ${before_index}`), painted_rows().includes('row 0')], [true, false, false]);
mouse_move({ x: -500, y: -400 }, { pressed_button: 0 });
check('a drag far above the window goes back to the first row', list_top().slice(0, 2), [0, 0]);
mouse_up({ x: -500, y: -400 });
await wait(THUMB_MS);
check('and a release out there ends it where it is', [column().style!.scrollbarColor, list_top().slice(0, 2)], ['#404040', [0, 0]]);

// Rows the list has not reached are measured at the hint, so a release past the end has to settle on the true one.
mouse_down({ x: strip_x, y: vy + 10 });
mouse_move({ x: 2000, y: 1500 }, { pressed_button: 0 });
mouse_up({ x: 2000, y: 1500 });
await wait(THUMB_MS);
// The last rows are 30 and 90 px tall, so a 200 px viewport resting on the end starts 10 px into row 197.
check('a drag let go far below the window lands on the last row', list_top().slice(0, 2), [197, 10]);

// Nothing reads the list but a press on the strip, so an idle or wheeled list asks native for nothing.
({ native } = mount_headless(Tall, { props: { virtual: true, rows: 200 }, width: 400, height: 300 }));
await wait(THUMB_MS);
{
	const asked: string[] = [];
	const read_top = native.getListScrollTop.bind(native);
	const read_offset = native.getScrollOffset.bind(native);
	native.getListScrollTop = (id) => (asked.push('getListScrollTop'), read_top(id));
	native.getScrollOffset = (id) => (asked.push('getScrollOffset'), read_offset(id));
	await wait(400);
	wheel(list_at, 0, -400);
	await wait(THUMB_MS);
	const idle = asked.splice(0);
	mouse_down({ x: strip_x, y: vy + 10 });
	mouse_up({ x: strip_x, y: vy + 10 });
	native.getListScrollTop = read_top;
	native.getScrollOffset = read_offset;
	check('a virtual list asks native for nothing while idle or wheeled, only when the strip is pressed', [idle, asked], [[], ['getListScrollTop', 'getScrollOffset']]);
}

finish('scroller', 39);
