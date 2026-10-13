/**
 * The native capabilities 0.8–0.10 added, through the helpers the package wraps them
 * in: accessibility props, file drops, motion completion, the selection hook, focus
 * walking, image uploads and scroll_into_view.
 */

import {
	on_selection_change,
	scroll_into_view,
	focus_next_within,
	focus_previous_within,
	focused_element,
	set_image,
	set_image_pixels,
	minimize_window,
	zoom_window,
	toggle_fullscreen,
	prompt_for_paths,
	type ShadowNode
} from 'gpuix-svelte';
import {
	mount_headless,
	find_test_id,
	click,
	drop_files,
	drag_select,
	clear_selection,
	clock_fast_forward,
	settle,
	bounds,
	all_text,
	check,
	finish
} from 'gpuix-svelte/test';

interface A11yNode {
	aria?: { role?: string; label?: string; expanded?: boolean; level?: number };
}

const PNG = Uint8Array.from(
	atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
	(c) => c.charCodeAt(0)
);

let row: ShadowNode | null = null;
let group: ShadowNode | null = null;
let img: ShadowNode | null = null;
let img_error: unknown = null;

const Host = (await import('./Host.svelte')).default;
const { native } = mount_headless(Host, {
	width: 400,
	height: 500,
	props: {
		on_row: (n: ShadowNode) => void (row = n),
		on_group: (n: ShadowNode) => void (group = n),
		// Runs while the element's createElement is still queued, so this is the deferred path.
		on_img: (n: ShadowNode) => {
			img = n;
			try {
				set_image(n, PNG);
			} catch (error) {
				img_error = error;
			}
		}
	}
});
settle();
check('set_image from an attach waits for the element to exist', img_error, null);

const a11y = () => Object.values((JSON.parse(native.getA11yTree()) as { nodes?: Record<string, A11yNode> }).nodes ?? {});
const labelled = () => a11y().find((n) => n.aria?.label === 'Delete note')?.aria;
check('role and aria-label reach the accessibility tree, as AccessKit roles', labelled()?.role, 'Button');
check('a boolean aria-expanded arrives as a boolean', labelled()?.expanded, false);
check('a string aria-level arrives as a number', a11y().find((n) => n.aria?.role === 'Heading')?.aria?.level, 2);
click(find_test_id('delete')!);
native.flush();
check('and it follows state', labelled()?.expanded, true);

drop_files(find_test_id('drop')!, ['/tmp/a.png', '/tmp/b.txt']);
check('onfiledrop gets the dropped paths', all_text().includes('dropped: /tmp/a.png,/tmp/b.txt'), true);

clock_fast_forward(500);
check('onmotioncomplete fires when the track lands', all_text().includes('moved: 1'), true);

const selections: Array<string | undefined> = [];
const off = on_selection_change((e) => selections.push(e.value));
native.flush();
const words = bounds(find_test_id('selectable')!)!;
drag_select({ x: words.x + 1, y: words.y + words.height / 2 }, { x: words.x + words.width - 1, y: words.y + words.height / 2 });
check('on_selection_change reports the selected text', selections.at(-1), 'Select these words');
clear_selection();
check('and the clear', selections.length >= 2 && selections.at(-1) === undefined, true);
off();

const f = (id: string) => find_test_id(id)!.id;
focus_next_within(group);
check('focus_next_within enters the group', focused_element()?.nativeId, f('f1'));
focus_next_within(group);
check('and walks it', focused_element()?.nativeId, f('f2'));
focus_previous_within(group);
check('focus_previous_within walks back', focused_element()?.nativeId, f('f1'));
focus_previous_within(group);
check('wrapping inside the group', focused_element()?.nativeId, f('f3'));

const list = find_test_id('list')!.id;
check('the list starts at the top', native.getScrollOffset(list)?.[1], 0);
scroll_into_view(row);
native.flush();
check('scroll_into_view scrolls the row in', (native.getScrollOffset(list)?.[1] ?? 0) < -400, true);

let pixels_error: unknown = null;
try {
	set_image_pixels(img, 2, 2, new Uint8Array(16).fill(255));
	native.flush();
} catch (error) {
	pixels_error = error;
}
check('set_image_pixels takes a plain Uint8Array', pixels_error, null);

minimize_window();
zoom_window();
toggle_fullscreen();
check('window controls are no-ops headlessly', true);
check('prompt_for_paths resolves null without a picker', await prompt_for_paths({ multiple: true }).catch((e: Error) => e.message), null);

finish('host', 18);
