/**
 * The native capabilities 0.8–0.11 added, through the helpers the package wraps them
 * in: accessibility props, file drops, motion completion, the selection hook, focus
 * walking, image uploads, scroll_into_view, hit lookups and font registration.
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	on_selection_change,
	scroll_into_view,
	focus_next,
	focus_previous,
	focus_next_within,
	focus_previous_within,
	focused_element,
	set_image,
	set_image_pixels,
	elements_at,
	register_font,
	minimize_window,
	zoom_window,
	toggle_fullscreen,
	prompt_for_paths,
	type ShadowNode
} from 'gpuix-svelte';
import {
	mount_headless,
	find_test_id,
	find_text,
	click,
	drop_files,
	drag_select,
	clear_selection,
	clock_fast_forward,
	settle,
	bounds,
	all_text,
	a11y,
	screenshot,
	check,
	finish
} from 'gpuix-svelte/test';

const PNG = Uint8Array.from(
	atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
	(c) => c.charCodeAt(0)
);

let row: ShadowNode | null = null;
let group: ShadowNode | null = null;
let img: ShadowNode | null = null;
let img_error: unknown = null;

const Host = (await import('./Host.svelte')).default;
const { native, component } = mount_headless(Host, {
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

const nodes = () => Object.values(a11y().nodes ?? {});
const labelled = () => nodes().find((n) => n.aria?.label === 'Delete note')?.aria;
check('role and aria-label reach the accessibility tree, as AccessKit roles', labelled()?.role, 'Button');
check('a boolean aria-expanded arrives as a boolean', labelled()?.expanded, false);
check('a string aria-level arrives as a number', nodes().find((n) => n.aria?.role === 'Heading')?.aria?.level, 2);
const written_out = nodes().find((n) => n.aria?.label === 'Static')?.aria;
check('a string aria-expanded and aria-selected arrive as booleans', [written_out?.expanded, written_out?.selected], [false, true]);
click(find_test_id('delete')!);
native.flush();
check('and it follows state', labelled()?.expanded, true);

const host = component as { show_late(): void; set_plain(text: string): void; set_split(value: boolean): void };
const labels = () => nodes().filter((n) => n.aria?.role === 'Label').map((n) => n.aria?.value);
check('plain text outside a <text> is a Label too', ['Archive', 'first'].map((t) => labels().includes(t)), [true, true]);
check(
	'text inside a <text> is not wrapped again, which would leave the <text> a Label with no value',
	[labels().filter((v) => v === 'Delete').length, labels().filter((v) => !v).length],
	[1, 0]
);
host.set_plain('second');
settle();
check('a change to plain text reaches its Label', [labels().includes('first'), labels().includes('second')], [false, true]);
const label_count = labels().length;
host.set_plain(' ');
settle();
const blank_count = labels().length;
host.set_plain('third');
settle();
check('blank plain text leaves the tree and comes back as a Label', [blank_count, labels().length, labels().includes('third')], [label_count - 1, label_count, true]);
const word = bounds(find_text('Archive')!)!;
const hits = elements_at(word.x + word.width / 2, word.y + word.height / 2);
check('elements_at reports plain text once, as its shadow node', hits.filter((n) => n.kind === 'text').map((n) => n.data), ['Archive']);
click(find_text('Archive')!);
check('a click on plain text still reaches the button around it', all_text().includes('archived: 1'), true);
type Raw = { testId?: string; text?: string; children?: Raw[] };
const raw_of = (n: Raw, id: string): Raw | null => (n.testId === id ? n : (n.children ?? []).map((c) => raw_of(c, id)).find(Boolean) ?? null);
check(
	'tree() folds the wrapper back, so a test reads plain text as the app wrote it',
	[find_test_id('archive')!.children?.[0]?.text, raw_of(JSON.parse(native.getTreeJson()), 'archive')?.children?.[0]?.children?.[0]?.text],
	['Archive', 'Archive']
);

const trimmed = () => labels().map((v) => v?.trim());
const [hello, world] = [bounds(find_text('Hello ')!)!, bounds(find_text('there world')!)!];
check('text beside other text stays one native run, so a search crosses it', all_text().includes('matches: 1'), true);
const across = drag_select({ x: hello.x + 1, y: hello.y + hello.height / 2 }, { x: world.x + world.width - 1, y: world.y + world.height / 2 });
check('and a selection across it reads as one string, with no line break where it was split', [across?.startsWith('Hello there wor'), across?.includes('\n')], [true, false]);
clear_selection();
host.set_split(true);
settle();
check('an element splitting the run gives each side its label', ['Hello', 'there world'].map((t) => trimmed().includes(t)), [true, true]);
host.set_split(false);
settle();
check('and taking it out joins the run again', [trimmed().includes('Hello'), all_text().includes('matches: 1')], [false, true]);
check('a <text> around a split sentence labels it whole', [trimmed().includes('Hi there'), trimmed().includes('Hi')], [true, false]);

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

focus_next();
check('focus_next walks the whole window, so past the last stop it wraps to the first, not the group', focused_element()?.nativeId, f('f0'));
focus_next();
check('and enters the group from outside it', focused_element()?.nativeId, f('f1'));
focus_previous();
check('focus_previous walks back out', focused_element()?.nativeId, f('f0'));
focus_previous();
check('and wraps backwards to the last stop', focused_element()?.nativeId, f('f3'));
host.show_late();
settle();
focus_next();
check('a tab stop an {#if} adds joins the order once it has painted', focused_element()?.nativeId, f('late'));

const list = find_test_id('list')!.id;
check('the list starts at the top', native.getScrollOffset(list)?.[1], 0);
scroll_into_view(row);
native.flush();
check('scroll_into_view scrolls the row in', (native.getScrollOffset(list)?.[1] ?? 0) < -400, true);

// Only a screenshot shows what an <img> painted, and nothing in the window moves from here on.
const shot_path = join(tmpdir(), `gpuix-svelte-host-${process.pid}.png`);
function shot() {
	screenshot(shot_path);
	return readFileSync(shot_path).toString('base64');
}
function paint(pixels: number[], format?: 'bgra') {
	try {
		set_image_pixels(img, 1, 1, Uint8Array.from(pixels), format);
		return shot();
	} catch (error) {
		return (error as Error).message;
	}
}
const TRANSPARENT = [0, 0, 0, 0];

const attached = shot();
const blank = paint(TRANSPARENT);
set_image(img, PNG);
check('the image an attach queued is what painted', [shot() === attached, blank === attached], [true, false]);

// PNG is one pixel of rgba(255, 0, 0, 127), so the same colour as raw pixels has to paint the same.
check('set_image_pixels takes a plain Uint8Array', [paint([255, 0, 0, 127]) === attached, paint(TRANSPARENT) === attached], [true, false]);
check('and BGRA, native 0.11', paint([0, 0, 255, 127], 'bgra') === attached, true);
rmSync(shot_path, { force: true });

const target = bounds(find_test_id('drop')!)!;
const under = (y: number) => elements_at(target.x + target.width / 2, y).some((n) => n.nativeId === f('drop'));
check('elements_at maps the ids under a point back to shadow nodes', [under(target.y + target.height / 2), under(target.y + target.height + 1)], [true, false]);

check('register_font throws on bytes that are no font', (() => {
	try {
		register_font(new Uint8Array([1, 2, 3, 4]));
		return 'accepted';
	} catch {
		return 'threw';
	}
})(), 'threw');
const font = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc', 'C:\\Windows\\Fonts\\arial.ttf'].find((path) =>
	existsSync(path)
);
let font_error: unknown = font ? null : 'no system font to try';
try {
	if (font) register_font(readFileSync(font));
} catch (error) {
	font_error = (error as Error).message;
}
check('register_font takes a system font', font_error, null);

let controls = 'no throw';
try {
	minimize_window();
	zoom_window();
	toggle_fullscreen();
} catch (error) {
	controls = (error as Error).message;
}
check('window controls are no-ops headlessly', controls, 'no throw');
check('prompt_for_paths resolves null without a picker', await prompt_for_paths({ multiple: true }).catch((e: Error) => e.message), null);

finish('host', 41);
