/**
 * Everything the window's own plumbing has to survive: a throw must not take
 * the frame loop or the native event callback with it, and a remount must not
 * leave the tree rootless between two batches.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { GpuixRenderer, TestGpuixRenderer } from '@gpuix/native';
import renderer, { set_native, create_root, commit, queue_destroy, set_auto_commit, set_keyboard_focus_dim } from '../src/renderer.ts';
import { focus_dim_on_render, handle_event, render, start_frame_loop } from '../src/render.ts';
import { render_hot } from '../src/hot.ts';
import { check, finish } from 'gpuix-svelte/test';
import type { GpuiStyle, Mutation, RenderOptions, ShadowNode } from '../src/types.ts';

async function errors_during(body: (logged: string[]) => unknown): Promise<string[]> {
	const logged: string[] = [];
	const error = console.error;
	console.error = (...args: unknown[]) => void logged.push(args.map(String).join(' '));
	try {
		await body(logged);
	} finally {
		console.error = error;
	}
	return logged;
}

// --- a throwing commit must not kill the frame loop -----------------------
{
	let ticks = 0;
	let batches = 0;
	const exploding = {
		requiresTick: () => true,
		tick: () => (ticks++, true),
		applyBatch: () => {
			batches++;
			throw new Error('boom');
		},
		commitMutations: () => {}
	};

	set_native(exploding);
	create_root();

	const logged = await errors_during(async () => {
		const loop = start_frame_loop(exploding);
		await new Promise((resolve) => setTimeout(resolve, 60));
		loop.stop();
	});

	check('the loop keeps ticking after a commit throws', ticks > 1, true);
	check('a failure that is no refusal may have been applied, so it is not resent op by op', batches, 1);
	check('and it reaches the log rather than vanishing', logged, ['[gpuix-svelte] commit failed: Error: boom']);
}

// --- one op native refuses costs that op, not the frame --------------------
{
	const native = new TestGpuixRenderer(200, 200);
	set_native(native);
	// Nothing parses a `rootStyle`, so this reaches native the way a key style.ts does not know yet would.
	const root = create_root({ flexGrow: 'nope' } as unknown as GpuiStyle);
	const child = renderer.createElement('div');
	renderer.setAttribute(child, 'testId', 'kept');
	renderer.insert(root, child, null);
	const first = () => JSON.parse(native.getTreeJson()).children?.[0];

	const logged = await errors_during(() => {
		commit();
		check('the rest of the batch still lands', first()?.testId, 'kept');

		renderer.setAttribute(child, 'style', 'font-size: 10px');
		commit();
		check('and the ids it created keep working', first()?.style?.fontSize, 10);

		const cycle: Record<string, unknown> = {};
		cycle.self = cycle;
		renderer.setAttribute(child, 'motion', cycle);
		renderer.setAttribute(child, 'style', 'font-size: 12px');
		commit();
		check('a value that cannot be serialized costs only its own op', first()?.style?.fontSize, 12);

		renderer.setAttribute(child, 'motion', {
			toJSON() {
				throw new RangeError('not a TypeError');
			}
		});
		renderer.setAttribute(child, 'style', 'font-size: 14px');
		commit();
		check('so does one whose toJSON throws anything else', first()?.style?.fontSize, 14);

		// Native's other kind of refusal, at decoding rather than at resolving a style, so its wording is covered too.
		queue_destroy('nope' as unknown as number);
		renderer.setAttribute(child, 'style', 'font-size: 16px');
		commit();
		check('an op native cannot decode costs only its own op', first()?.style?.fontSize, 16);
	});
	check('each of those was a real refusal of one op', logged.map((line) => line.split(':')[0]), [
		'[gpuix-svelte] native refused setStyle',
		'[gpuix-svelte] native refused setCustomProp',
		'[gpuix-svelte] native refused setCustomProp',
		'[gpuix-svelte] native refused destroyElement'
	]);

	const refusals_of_text: unknown[] = [];
	const error = console.error;
	console.error = (line: unknown) => void refusals_of_text.push(line);
	const cut = '\u{1F600}'.slice(0, 1);
	const wording = `whole \u{1F600} cut ${cut} literal \\ud83d`;
	const text = renderer.createTextNode(wording);
	renderer.insert(child, text, null);
	const labelled = renderer.createElement('div');
	renderer.setAttribute(labelled, 'testId', cut);
	renderer.insert(root, labelled, null);
	commit();
	console.error = error;
	check(
		'a string cut mid-emoji reaches native as U+FFFD, in text and props alike, and nothing is refused',
		[first()?.children?.[0]?.children?.[0]?.text, JSON.parse(native.getTreeJson()).children?.[1]?.testId, refusals_of_text],
		['whole \u{1F600} cut \uFFFD literal \\ud83d', '\uFFFD', []]
	);
	check('while the shadow node keeps the string Svelte gave it, for its own diffing', text.data === wording, true);
}

// --- a refused frame on a window that has gone ------------------------------
{
	// Never init()ed, so the first op that applies fails to wake the window, as on a closed one.
	const window = new GpuixRenderer();
	const logged: unknown[] = [];
	const error = console.error;
	console.error = (line: unknown) => void logged.push(line);
	let batches = 0;
	set_native({
		applyBatch(json: string) {
			batches++;
			return window.applyBatch(json);
		}
	});
	create_root({ flexGrow: 'nope' } as unknown as GpuiStyle);
	let thrown: unknown = null;
	try {
		commit();
	} catch (failure) {
		thrown = failure;
	}
	console.error = error;
	check('a refused frame on a window that has gone is one failure for the frame loop, not a misleading line per op', [batches, logged, thrown instanceof Error], [2, [], true]);
}

// --- the wasm build throws a plain string -----------------------------------
{
	const logged: unknown[] = [];
	const error = console.error;
	console.error = (line: unknown) => void logged.push(line);
	set_native({
		applyBatch(json: string) {
			if (json.includes('"setStyle"')) throw 'Batch op 0 setStyle parse error: nope';
			return [];
		}
	});
	create_root();
	commit();
	console.error = error;
	check('its refusal is still named', logged, ['[gpuix-svelte] native refused setStyle: Batch op 0 setStyle parse error: nope']);
}

// --- tick() going false ends the process, whatever timers are pending ------
{
	check('the shipped binding asks for the frame loop that ends it', new GpuixRenderer(() => {}).requiresTick(), true);

	const exit = process.exit;
	let exit_code: unknown = 'not called';
	process.exit = ((code?: number) => {
		exit_code = code;
	}) as typeof process.exit;
	const keep_alive = setInterval(() => {}, 1000);
	let running = true;
	const loop = start_frame_loop({ requiresTick: () => true, tick: () => running });
	running = false;
	await new Promise((resolve) => setTimeout(resolve, 60));
	loop.stop();
	clearInterval(keep_alive);
	process.exit = exit;
	check('tick() going false exits with 0 past a pending interval', exit_code, 0);
}

// --- a throwing handler must not escape the native callback ---------------
{
	const native = new TestGpuixRenderer();
	set_native(native);
	const root = create_root();
	const anchor = renderer.createComment('');
	renderer.insert(root, anchor, null);

	const button = renderer.createElement('div');
	renderer.addEventListener(button, 'click', () => {
		throw new Error('handler blew up');
	});
	renderer.insert(root, button, anchor);
	commit();
	native.flush();

	let seen: string | null = null;
	let escaped: string | null = null;
	const logged = await errors_during(() => {
		try {
			handle_event({ elementId: button.nativeId!, eventType: 'click' }, (e) => (seen = e.eventType));
		} catch (error) {
			escaped = (error as Error).message;
		}
	});

	check('the exception does not reach the caller', escaped, null);
	check('it reaches the log instead', logged, ['[gpuix-svelte] event handler failed: Error: handler blew up']);
	check("and the host's onEvent still runs", seen, 'click');

	console.log('-- and this one a failed onEvent --');
	try {
		handle_event({ elementId: button.nativeId!, eventType: 'click' }, () => {
			throw new Error('onEvent blew up');
		});
	} catch (error) {
		escaped = (error as Error).message;
	}
	check('a throwing onEvent does not reach the caller either, which in a window ends the process', escaped, null);
}

// --- a remount retires the old root inside the new tree's batch -----------
{
	const native = new TestGpuixRenderer();
	set_native(native);
	const first = create_root();
	commit();
	native.flush();
	check('first root is live', JSON.parse(native.getTreeJson()).id, first.nativeId);

	let batches = 0;
	let shipped = '';
	const applyBatch = native.applyBatch.bind(native);
	native.applyBatch = (json) => (batches++, (shipped = json), applyBatch(json));

	// What `render()` does on a remount, in the same order.
	const retiring = first.nativeId!;
	set_native(native);
	const second = create_root();
	queue_destroy(retiring);
	commit();
	native.flush();

	check('the swap costs exactly one batch', batches, 1);
	check('the new root survives it', JSON.parse(native.getTreeJson()).id, second.nativeId);
	check('and the old root is gone', native.getRetainedElementCount(), 1);
	check('native 0.11 focus dim is off by default', shipped.includes('["setKeyboardFocusDim",false]'), true);

	create_root(undefined, true);
	commit();
	check('and on when asked for', shipped.includes('["setKeyboardFocusDim",true]'), true);

	set_keyboard_focus_dim(false);
	commit();
	check('set_keyboard_focus_dim switches it at runtime', shipped, '[["setKeyboardFocusDim",false]]');

	create_root(undefined, null);
	commit();
	check('a null dim leaves it alone', shipped.includes('setKeyboardFocusDim'), false);
	check(
		'render ships the option on a new window or when it changed, never on a remount, so a runtime switch survives',
		[
			focus_dim_on_render(undefined, undefined, true),
			focus_dim_on_render(true, undefined, true),
			focus_dim_on_render(true, true, true),
			focus_dim_on_render(undefined, false, false),
			focus_dim_on_render(true, false, false),
			focus_dim_on_render(false, true, false),
			focus_dim_on_render(true, true, false)
		],
		[false, true, true, null, true, false, null]
	);
}

// --- render() and render_hot() themselves, not a copy of their order --------
{
	const native = new TestGpuixRenderer();
	const batches: Mutation[][] = [];
	const applyBatch = native.applyBatch.bind(native);
	native.applyBatch = (json) => (batches.push(JSON.parse(json)), applyBatch(json));
	const slot = {
		native,
		root: null as ShadowNode | null,
		component: null as { toggle(show: boolean): void } | null,
		loop: { stop() {} },
		keys: []
	};
	// render() opens a window only for a native it creates itself, so a filled slot takes it past that.
	(globalThis as unknown as Record<symbol, unknown>)[Symbol.for('gpuix.svelte.host')] = slot;

	const Reorder = (await import('./Reorder.svelte')).default;
	const dim_shipped_by_render = (options: RenderOptions = {}) => {
		batches.length = 0;
		render(Reorder, { titlebar: false, ...options });
		return batches.flat().find((op) => op[0] === 'setKeyboardFocusDim')?.[1] ?? null;
	};

	const dims = [dim_shipped_by_render()];
	const retiring = JSON.parse(native.getTreeJson()).id;
	dims.push(dim_shipped_by_render());
	const swap = batches.find((ops) => ops.some((op) => op[0] === 'setRoot'));
	check(
		"render() ships the new root and then the old root's destroy in one batch",
		swap?.filter((op) => op[0] === 'setRoot' || (op[0] === 'destroyElement' && op[1] === retiring)).map((op) => op[0]),
		['setRoot', 'destroyElement']
	);

	dims.push(dim_shipped_by_render({ keyboardFocusDim: true }), dim_shipped_by_render({ keyboardFocusDim: true }));
	check('render() goes by focus_dim_on_render and records what it applied', dims, [false, null, true, null]);

	renderer.addEventListener(slot.root!, 'click', () => slot.component!.toggle(false));
	const shown = native.getAllText().includes('IF');
	handle_event({ elementId: slot.root!.nativeId!, eventType: 'click' });
	check("a handler's update reaches native before handle_event returns", [shown, native.getAllText().includes('IF')], [true, false]);

	// Left behind for the next run to clear: the watcher below is never closed, and Windows may refuse to delete what it holds.
	const dir = new URL('./.hot-tmp/lifecycle/', import.meta.url);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	const app = new URL('App.svelte', dir);
	const until = async (done: () => boolean, each?: () => void) => {
		for (const end = Date.now() + 10_000; !done() && Date.now() < end; ) {
			each?.();
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	};

	writeFileSync(app, '<div>one</div>');
	let mounted: string[] = [];
	const logged = await errors_during(async (lines) => {
		await render_hot(app, { titlebar: false });
		mounted = native.getAllText();
		// Under load a watcher that has only just started can miss a save, so this one repeats until it is heard.
		await until(
			() => lines.length > 0,
			() => writeFileSync(app, '{#if')
		);
		writeFileSync(app, '<div>two</div>');
		await until(() => native.getAllText().includes('two'));
	});
	check('a save that does not compile is logged and takes nothing down', logged[0]?.startsWith('[gpuix-svelte] reload failed:'), true);
	check('and the next save still reloads', [mounted, native.getAllText()], [['one'], ['two']]);
}

set_auto_commit(false);

finish('lifecycle', 33);
