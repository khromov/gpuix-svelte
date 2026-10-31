/**
 * Windows runs `prompt_for_paths`' picker on GPUI's UI thread, so until it closes every native call
 * that waits on that thread stalls JS for 2 s and throws, which from a timer ends the process.
 * The headless renderer has no such thread, so a fake dialog blocks the same calls with native's own
 * error text; `blocked` counts every one that got through, and each of those is a real 2 s stall.
 */

import { debug_overlay, debug_overlay_stats, elements_at, focused_element, prompt_for_paths, read_native, set_image, set_image_pixels, type ShadowNode } from 'gpuix-svelte';
import { all_text, bounds, check, find_test_id, finish, mount_headless, wait, wheel, center } from 'gpuix-svelte/test';

type Fake = Record<string, (...args: never[]) => unknown>;

// Only Windows blocks, and this file fakes that thread, so it can run the Windows path on any OS.
const pretend = (platform: string) => Object.defineProperty(process, 'platform', { value: platform, configurable: true });
pretend('win32');

const WAITS_ON_UI_THREAD = [
	'getWindowSize',
	'getElementBounds',
	'getScrollOffset',
	'getListScrollTop',
	'getElementsAt',
	'getAutomationTree',
	'getFocusedElementId',
	'getDebugFrameOverlay',
	'getDebugFrameOverlayStats',
	'setImage',
	'setImagePixels'
];

/** Makes every call above throw as native does, and gives back how to open and close the dialog. */
function block_ui_thread(native: object) {
	const fake = native as Fake;
	let open = false;
	const counts = { blocked: 0, uploads: [] as unknown[][] };
	for (const name of WAITS_ON_UI_THREAD) {
		const real = fake[name]!.bind(native) as (...args: unknown[]) => unknown;
		fake[name] = ((...args: unknown[]) => {
			if (name.startsWith('setImage')) counts.uploads.push([name, ...args]);
			if (!open) return name.startsWith('setImage') ? undefined : real(...args);
			counts.blocked++;
			throw new Error(`Timed out after 2 seconds waiting for ${name}`);
		}) as never;
	}
	let settle: (result: { paths?: string[] | null; error?: Error }) => void = () => {};
	fake.promptForPaths = (() => {
		open = true;
		return new Promise((resolve, reject) => {
			settle = ({ paths = null, error }) => {
				open = false;
				if (error) reject(error);
				else resolve(paths);
			};
		});
	}) as never;
	return { counts, close: (result: { paths?: string[] | null; error?: Error } = {}) => settle(result) };
}

// Longer than a virtual list's 250 ms timer and a size poll, both of which must stay quiet.
const WHILE_OPEN_MS = 400;
const THUMB_MS = 80;

const Fixture = (await import('./Dialog.svelte')).default;
const size_text = () => all_text().find((t) => /^\d+x\d+$/.test(t));

// --- a stock Scroller, and whatever else reads the window, sits a dialog out ----------------------
for (const virtual of [false, true]) {
	const { native } = mount_headless(Fixture, { props: { virtual }, width: 400, height: 300 });
	const { counts, close } = block_ui_thread(native);
	const label = virtual ? 'a virtual' : 'a plain';
	// A virtual list's thumb measures on a timer, so give the first one time to happen.
	await wait(virtual ? 300 : THUMB_MS);
	const thumb_before = bounds(find_test_id('list-thumb')!)!;
	const size_before = size_text();
	check(`${label} Scroller has drawn its thumb before the dialog`, thumb_before.height > 0, true);

	const prompt = prompt_for_paths({ directories: true });
	await wait(WHILE_OPEN_MS);
	check(`${label} Scroller asks native for nothing while a dialog is open`, counts.blocked, 0);
	check(`${label} Scroller's window_size keeps the real size, not the 800×600 fallback`, size_text(), size_before);

	close({ paths: ['C:\\picked'] });
	check(`${label} Scroller's prompt still resolves to the picked paths`, await prompt, ['C:\\picked']);
	await wait(virtual ? 300 : THUMB_MS);
	check(`${label} Scroller's thumb is intact afterwards`, Math.round(bounds(find_test_id('list-thumb')!)!.height), Math.round(thumb_before.height));
}

// --- the thumb catches up on what happened while it could not measure -----------------------------
{
	const { native } = mount_headless(Fixture, { props: { virtual: true }, width: 400, height: 300 });
	await wait(300);
	const column = find_test_id('list')!;
	const { close } = block_ui_thread(native);
	const before = bounds(find_test_id('list-thumb')!)!;
	const prompt = prompt_for_paths();
	await wait(50);
	native.scrollToItem(column.id, 30);
	await wait(WHILE_OPEN_MS);
	close();
	await prompt;
	await wait(300);
	check('a virtual thumb moves to where the list went while the dialog was up', bounds(find_test_id('list-thumb')!)!.y > before.y, true);
}

// --- the wrappers in window.ts answer without reaching native -------------------------------------
{
	const { native } = mount_headless(Fixture, { width: 400, height: 300 });
	const { counts, close } = block_ui_thread(native);
	const prompt = prompt_for_paths();
	check('focused_element is null during a dialog', focused_element(), null);
	check('elements_at is empty', elements_at(5, 5), []);
	check('debug_overlay answers nothing', debug_overlay() === undefined, true);
	check('debug_overlay_stats answers nothing', debug_overlay_stats() === undefined, true);
	check('read_native is null', read_native((n) => n.getElementBounds(1)), null);
	check('and none of them reached native', counts.blocked, 0);
	close();
	await prompt;
	check('afterwards read_native reads again', read_native((n) => n.getWindowSize()) !== null, true);
	check('and so do the wrappers', elements_at(5, 5).length > 0, true);
}

// --- a dialog that fails, or two at once, must not leave the guard stuck ---------------------------
{
	const { native } = mount_headless(Fixture, { width: 400, height: 300 });
	const { close } = block_ui_thread(native);
	const failing = prompt_for_paths();
	close({ error: new Error('no picker here') });
	const error = await failing.catch((e: Error) => e.message);
	check('a rejected prompt rejects as it did', error, 'no picker here');
	check('and the guard opens again', read_native((n) => n.getWindowSize()) !== null, true);

	const fake = native as unknown as Fake;
	const resolvers: Array<() => void> = [];
	fake.promptForPaths = (() => new Promise<null>((resolve) => resolvers.push(() => resolve(null)))) as never;
	const first = prompt_for_paths();
	const second = prompt_for_paths();
	resolvers[0]!();
	await first;
	check('with a second dialog still open the guard holds', read_native((n) => n.getWindowSize()), null);
	resolvers[1]!();
	await second;
	check('until the last one closes', read_native((n) => n.getWindowSize()) !== null, true);
}

// --- a live image waits for the dialog, keeping only its newest frame ------------------------------
{
	let a: ShadowNode | null = null;
	let b: ShadowNode | null = null;
	const { native } = mount_headless(Fixture, {
		props: {
			onimages: (x: ShadowNode, y: ShadowNode) => {
				a = x;
				b = y;
			}
		},
		width: 400,
		height: 300
	});
	await wait(THUMB_MS);
	const { counts, close } = block_ui_thread(native);
	const pixel = (value: number) => new Uint8Array([value, 0, 0, 255]);

	set_image_pixels(a, 1, 1, pixel(1));
	check('an upload with no dialog open goes straight to native', counts.uploads.length, 1);
	counts.uploads.length = 0;

	const prompt = prompt_for_paths();
	set_image_pixels(a, 1, 1, pixel(2));
	set_image_pixels(a, 1, 1, pixel(3));
	set_image(b, new Uint8Array([9]));
	check('during a dialog none reaches native', counts.uploads.length, 0);
	close();
	await prompt;
	await wait(10);
	check('afterwards each element gets its newest upload, once', counts.uploads.map((u) => [u[0], u[1], Array.from((u.at(-2) as Uint8Array) ?? [])[0] ?? Array.from(u.at(-1) as Uint8Array)[0]]), [
		['setImagePixels', a!.nativeId, 3],
		['setImage', b!.nativeId, 9]
	]);
}

// --- an upload queued behind a commit must not run into a dialog opened in the meantime ------------
{
	let a: ShadowNode | null = null;
	const { native } = mount_headless(Fixture, {
		props: {
			onimages: (x: ShadowNode) => {
				a = x;
			}
		},
		width: 400,
		height: 300
	});
	await wait(THUMB_MS);
	const { counts, close } = block_ui_thread(native);
	const { default: renderer, commit } = await import('../src/renderer.ts');
	renderer.setAttribute(a!, 'data-x', '1');
	set_image_pixels(a, 1, 1, new Uint8Array([4, 0, 0, 255]));
	const prompt = prompt_for_paths();
	commit();
	check('one queued behind a commit is held too, rather than timing out inside it', [counts.blocked, counts.uploads.length], [0, 0]);
	close();
	await prompt;
	await wait(10);
	check('and lands when the dialog closes', counts.uploads.length, 1);
}

// --- an image torn down during the dialog takes its held upload with it ----------------------------
{
	let a: ShadowNode | null = null;
	const { native, unmount } = mount_headless(Fixture, {
		props: {
			onimages: (x: ShadowNode) => {
				a = x;
			}
		},
		width: 400,
		height: 300
	});
	await wait(THUMB_MS);
	const { counts, close } = block_ui_thread(native);
	const prompt = prompt_for_paths();
	set_image_pixels(a, 1, 1, new Uint8Array([5, 0, 0, 255]));
	await unmount();
	await wait(10);
	close();
	await prompt;
	await wait(10);
	check('an element gone by the time the dialog closes gets nothing', counts.uploads.length, 0);
}

// --- a bad upload that was held surfaces in the log, not as a rejected prompt ----------------------
{
	let a: ShadowNode | null = null;
	const { native } = mount_headless(Fixture, {
		props: {
			onimages: (x: ShadowNode) => {
				a = x;
			}
		},
		width: 400,
		height: 300
	});
	await wait(THUMB_MS);
	const { close } = block_ui_thread(native);
	const prompt = prompt_for_paths();
	set_image(a, new Uint8Array([1]));
	(native as unknown as Fake).setImage = (() => {
		throw new Error('unrecognized image format');
	}) as never;
	const logged: unknown[][] = [];
	const console_error = console.error;
	console.error = (...args: unknown[]) => logged.push(args);
	close({ paths: ['C:\\x'] });
	const result = await prompt;
	console.error = console_error;
	check('a held upload that fails does not cost the prompt its answer', result, ['C:\\x']);
	check('it is logged instead', logged.length, 1);
}

// --- no dialog we opened, and the UI thread still can't answer -------------------------------------
{
	const { native } = mount_headless(Fixture, { props: { virtual: true }, width: 400, height: 300 });
	await wait(300);
	const stalled = native as unknown as Fake;
	const real = stalled.getListScrollTop!;
	let stalls = 0;
	stalled.getListScrollTop = (() => {
		stalls++;
		throw new Error('Timed out after 2 seconds waiting for the GPUI list scroll query');
	}) as never;
	await wait(300);
	check('a virtual Scroller rides out a stall it did not cause', stalls > 0, true);
	stalled.getListScrollTop = real;

	const message = (fn: () => unknown) => {
		try {
			fn();
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	};
	check(
		'read_native answers null for a timeout',
		read_native(() => {
			throw new Error('Timed out after 2 seconds waiting for the element bounds query');
		}),
		null
	);
	check(
		'and for a UI thread that has gone away',
		read_native(() => {
			throw new Error('The GPUI UI thread stopped during the element bounds query');
		}),
		null
	);
	check(
		'but lets a real failure through',
		message(() =>
			read_native(() => {
				throw new Error('element id must be a positive integer');
			})
		),
		'element id must be a positive integer'
	);
}

// --- released behind a commit, a bad upload must not take the rest of that commit's calls with it ---
{
	let a: ShadowNode | null = null;
	let b: ShadowNode | null = null;
	const { native } = mount_headless(Fixture, {
		props: {
			onimages: (x: ShadowNode, y: ShadowNode) => {
				a = x;
				b = y;
			}
		},
		width: 400,
		height: 300
	});
	await wait(THUMB_MS);
	const { close } = block_ui_thread(native);
	const prompt = prompt_for_paths();
	set_image(a, new Uint8Array([1]));
	set_image(b, new Uint8Array([2]));
	const sent: unknown[] = [];
	(native as unknown as Fake).setImage = ((id: number) => {
		if (id === a!.nativeId) throw new Error('unrecognized image format');
		sent.push(id);
	}) as never;
	const { default: renderer, commit } = await import('../src/renderer.ts');
	renderer.setAttribute(a!, 'data-y', '1');

	const logged: unknown[][] = [];
	const console_error = console.error;
	console.error = (...args: unknown[]) => logged.push(args);
	close();
	await prompt;
	let thrown: string | null = null;
	try {
		commit();
	} catch (error) {
		thrown = (error as Error).message;
	}
	console.error = console_error;
	check('the bad one does not throw out of the commit', thrown, null);
	check('it is logged like any other', logged.length, 1);
	check('and the other element still gets its image', sent, [b!.nativeId]);
}

// --- "newest per element" has to hold however the caller refers to the element ----------------------
{
	let a: ShadowNode | null = null;
	const { native } = mount_headless(Fixture, {
		props: {
			onimages: (x: ShadowNode) => {
				a = x;
			}
		},
		width: 400,
		height: 300
	});
	await wait(THUMB_MS);
	const { counts, close } = block_ui_thread(native);
	const id = a!.nativeId;
	const prompt = prompt_for_paths();
	for (const value of [1, 2, 3]) set_image_pixels({ nativeId: id }, 1, 1, new Uint8Array([value, 0, 0, 255]));
	close();
	await prompt;
	await wait(10);
	check('a fresh { nativeId } per call still lands only the newest', counts.uploads.map((u) => (u[4] as Uint8Array)[0]), [3]);
}

// --- macOS and Linux keep the UI thread running behind their picker, and the app stays usable -------
{
	pretend('darwin');
	let a: ShadowNode | null = null;
	const { native } = mount_headless(Fixture, {
		props: {
			onimages: (x: ShadowNode) => {
				a = x;
			}
		},
		width: 400,
		height: 300
	});
	await wait(THUMB_MS);
	const fake = native as unknown as Fake;
	let answer: (paths: string[]) => void = () => {};
	fake.promptForPaths = (() => new Promise((resolve) => (answer = resolve))) as never;
	const uploads: unknown[] = [];
	fake.setImagePixels = ((id: number) => uploads.push(id)) as never;

	const prompt = prompt_for_paths();
	check('elsewhere read_native still reads behind the picker', read_native((n) => n.getWindowSize()) !== null, true);
	check('and elements_at still answers', elements_at(5, 5).length > 0, true);
	set_image_pixels(a, 1, 1, new Uint8Array([7, 0, 0, 255]));
	check('an upload goes straight to native', uploads, [a!.nativeId]);
	fake.getWindowSize = (() => ({ width: 321, height: 123 })) as never;
	for (let waited = 0; waited < 2000 && size_text() !== '321x123'; waited += 25) await wait(25);
	check('window_size follows a resize behind the picker', size_text(), '321x123');
	answer(['/picked']);
	check('and the prompt resolves as usual', await prompt, ['/picked']);
	pretend('win32');
}

// --- the last window closing with an upload in flight is no app error, from a timer least of all ----
{
	let a: ShadowNode | null = null;
	const { native } = mount_headless(Fixture, {
		props: {
			onimages: (x: ShadowNode) => {
				a = x;
			}
		},
		width: 400,
		height: 300
	});
	await wait(THUMB_MS);
	const fake = native as unknown as Fake;
	const upload_failing_with = (text: string) => {
		fake.setImagePixels = (() => {
			throw new Error(text);
		}) as never;
		try {
			set_image_pixels(a, 1, 1, new Uint8Array([6, 0, 0, 255]));
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	};
	check('an upload that loses the UI thread does not throw', upload_failing_with('The GPUI UI thread stopped during the image pixel upload'), null);
	check('nor one that times out with no dialog open', upload_failing_with('Timed out after 2 seconds waiting for the image pixel upload'), null);
	check('but a real upload failure still does', upload_failing_with('setImage is only valid on <img>, got <div>'), 'setImage is only valid on <img>, got <div>');
}

// --- the UI still works once the dialog is gone ------------------------------------------------------
{
	const { native } = mount_headless(Fixture, { width: 400, height: 300 });
	await wait(THUMB_MS);
	const { close } = block_ui_thread(native);
	const at = center(find_test_id('list')!);
	const prompt = prompt_for_paths();
	await wait(WHILE_OPEN_MS);
	close();
	await prompt;
	const before = bounds(find_test_id('list-thumb')!)!.y;
	wheel(at, 0, -200);
	await wait(THUMB_MS);
	check('the thumb follows the wheel again', bounds(find_test_id('list-thumb')!)!.y > before, true);
}

finish('dialog', 48);
