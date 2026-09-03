/**
 * The shipped Scroller draws its own thumb from GPUI's painted bounds and drags
 * it on an overlay, because GPUI paints no scrollbar and captures no pointer.
 * This runs the wheel, the drag and `follow` through the real hit testing.
 */

import { mount_headless, find, find_test_id, bounds, wait, drain, settle, painted, all_text, check, finish } from 'gpuix-svelte/test';

const Tall = (await import('./Tall.svelte')).default;

let { native } = mount_headless(Tall, { width: 400, height: 300 });
// The thumb is measured on a 250 ms timer, since bounds exist only after a paint.
await wait(300);

const column = () => find_test_id('list')!;
const thumb = () => find_test_id('list-thumb')!;
const offset = () => native.getScrollOffset(column().id)?.[1] ?? 0;

const [cx, cy, cw, ch] = bounds(column())!;
check('the column clips to its viewport', Math.round(ch), 200);
const t0 = bounds(thumb())!;
check('the thumb is shorter than the viewport', t0[3] > 0 && t0[3] < ch, true);
check('and starts at the top', Math.round(t0[1] - cy), 0);
check('with the package colour, nothing having set --scroller-thumb', thumb().style!.backgroundColor, '#585b70');

native.simulateScrollWheel(cx + cw / 2, cy + ch / 2, 0, -120);
drain();
// The offset moves after the wheel event returns; the thumb follows on its 50 ms throttle.
await wait(80);
check('a wheel scrolls the column', offset() < 0, true);
const t1 = bounds(thumb())!;
check('and the thumb moves down', t1[1] > t0[1], true);

const [tx, ty, tw, th] = t1;
native.simulateMouseDown(tx + tw / 2, ty + th / 2);
drain();
settle();
check('a mousedown on the thumb shows the drag overlay', find_test_id('list-overlay') != null, true);
const before = offset();
native.simulateMouseMove(tx + tw / 2, ty + th / 2 + 40, 0);
drain();
settle();
check('dragging scrolls further', offset() < before, true);
native.simulateMouseUp(tx + tw / 2, ty + th / 2 + 40);
drain();
settle();
check('and the release takes the overlay away', find_test_id('list-overlay'), null);

// Each thumb restyle is a full native frame, so a sustained scroll has to pay one per
// throttle window rather than one per wheel event.
({ native } = mount_headless(Tall, { width: 400, height: 300 }));
await wait(300);
{
	const [bx, by, bw, bh] = bounds(column())!;
	const thumb_id = thumb().id;
	let restyles = 0;
	const applyBatch = native.applyBatch.bind(native);
	native.applyBatch = (json) => {
		if ((JSON.parse(json) as [string, number][]).some(([op, id]) => op === 'setStyle' && id === thumb_id)) restyles++;
		return applyBatch(json);
	};
	for (let i = 0; i < 24; i++) {
		native.simulateScrollWheel(bx + bw / 2, by + bh / 2, 0, -30);
		drain();
		await wait(10);
	}
	await wait(80);
	native.applyBatch = applyBatch;
	check('a sustained scroll restyles the thumb on the throttle, not once per event', restyles > 0 && restyles <= 12, true);
}

({ native } = mount_headless(Tall, { props: { follow: true }, width: 400, height: 300 }));
await wait(200);
check('follow pins the bottom while content grows', Math.round(offset()), 200 - 30 * 40);

({ native } = mount_headless(Tall, { props: { scroll: false }, width: 400, height: 300 }));
await wait(300);
check('scroll={false} clips instead', column().style!.overflowY, 'hidden');
check('and draws no thumb', Math.round(bounds(thumb())![3]), 0);

// --- virtual: a native <virtual-list> builds only rows near the viewport -------
({ native } = mount_headless(Tall, { props: { virtual: true, rows: 200 }, width: 400, height: 300 }));
await wait(300);
check('a virtual list keeps every row in the tree', all_text().filter((t) => t.startsWith('row ')).length, 200);
check('but paints only the rows near the viewport', painted().includes('row 0') && !painted().includes('row 150'), true);
// The list host itself has no tracked bounds; its wrapper and the anchor it reports do.
const [vx, vy, vw] = bounds(find((n) => n.children?.some((c) => c.type === 'virtual-list') ?? false)!)!;
const vh = native.getListScrollTop(column().id)![2];
const v0 = bounds(thumb())!;
check('the thumb is drawn from the row count', v0[3] > 0 && v0[3] < vh, true);
native.simulateScrollWheel(vx + vw / 2, vy + vh / 2, 0, -400);
drain();
await wait(120);
check('a wheel scrolls the list', native.getListScrollTop(column().id)![0] > 0, true);
const v1 = bounds(thumb())!;
check('and the thumb moves down', v1[1] > v0[1], true);
// Rows alternate 30/90 px, so GPUI reports 3 to 5 rows in view as the list moves; the
// thumb's length must not follow that report around (it swung by 40% before).
const lengths: number[] = [];
for (let i = 0; i < 12; i++) {
	native.simulateScrollWheel(vx + vw / 2, vy + vh / 2, 0, -(15 + (i % 4) * 10));
	drain();
	await wait(60);
	lengths.push(bounds(thumb())![3]);
}
check('the thumb keeps its length while the rows in view vary', Math.max(...lengths) - Math.min(...lengths) <= 5, true);
const v1b = bounds(thumb())!;
native.simulateMouseDown(v1b[0] + v1b[2] / 2, v1b[1] + v1b[3] / 2);
drain();
settle();
const before_index = native.getListScrollTop(column().id)![0];
native.simulateMouseMove(v1b[0] + v1b[2] / 2, v1b[1] + v1b[3] / 2 + 60, 0);
drain();
settle();
check('dragging the thumb scrolls by row', native.getListScrollTop(column().id)![0] > before_index, true);
native.simulateMouseUp(v1b[0] + v1b[2] / 2, v1b[1] + v1b[3] / 2 + 60);
drain();
settle();
check('and the rows it left are no longer painted', painted().includes('row 0'), false);

finish('scroller', 21);
