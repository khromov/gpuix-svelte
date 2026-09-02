/**
 * The shipped Scroller draws its own thumb from GPUI's painted bounds and drags
 * it on an overlay, because GPUI paints no scrollbar and captures no pointer.
 * This runs the wheel, the drag and `follow` through the real hit testing.
 */

import { mount_headless, find_test_id, bounds, wait, drain, settle, check, finish } from 'gpuix-svelte/test';

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
// The offset moves after the wheel event returns; the thumb follows a beat later.
await wait(40);
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

({ native } = mount_headless(Tall, { props: { follow: true }, width: 400, height: 300 }));
await wait(200);
check('follow pins the bottom while content grows', Math.round(offset()), 200 - 30 * 40);

({ native } = mount_headless(Tall, { props: { scroll: false }, width: 400, height: 300 }));
await wait(300);
check('scroll={false} clips instead', column().style!.overflowY, 'hidden');
check('and draws no thumb', Math.round(bounds(thumb())![3]), 0);

finish('scroller');
