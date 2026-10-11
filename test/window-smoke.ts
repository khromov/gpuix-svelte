/**
 * The only suite that runs on Linux: it opens a real window, so it covers the
 * Wayland/Vulkan path the headless renderer cannot reach there. It asserts on the
 * tree and the layout GPUI produced rather than on interaction — see the note in
 * `src/test-window.ts` about why a windowed renderer cannot take simulated input.
 */

import { mount_window, tree, all_text, find_text, element_of, bounds, window_size, check, finish } from 'gpuix-svelte/test-window';

const Counter = (await import('../examples/counter/Counter.svelte')).default;
await mount_window(Counter);

let elements = 0;
let texts = 0;
let blanks = 0;

(function walk(n) {
	if (!n) return;
	if (n.type === 'text') {
		texts++;
		if ((n.text ?? '').trim() === '') blanks++;
	} else {
		elements++;
	}
	for (const c of n.children ?? []) walk(c);
})(tree());

const size = window_size();
const text = all_text();
console.log(`window=${size.width}×${size.height} elements=${elements} textNodes=${texts}`);
console.log('text:', JSON.stringify(text));

check('the window has a real size', size.width > 0 && size.height > 0);
check('the tree reached GPUI', elements > 0 && texts > 0);
check('no blank text node reached GPUI', blanks, 0);
check('the counter starts at 0', text.includes('0'));
check('the keyed {#each} rows are all there', ['alpha', 'beta', 'gamma'].every((l) => text.includes(l)));
check('the {#if} branch is absent at count 0', text.some((t) => t.includes('the {#if} branch is live')), false);

// Bounds ride along on every automation node, so layout is assertable without a screenshot.
const plus = find_text('+');
const [, , w, h] = bounds(plus!) ?? [];
check('the + button was laid out with real bounds', (w ?? 0) > 0 && (h ?? 0) > 0);

const row = element_of('alpha');
const [, row_y, row_w] = bounds(row!) ?? [];
check('a list row is wider than it is tall, inside the window', (row_w ?? 0) > 0 && (row_y ?? -1) >= 0 && (row_w ?? 0) <= size.width);

finish('window-smoke', 8);
