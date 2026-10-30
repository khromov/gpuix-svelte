/**
 * The structure mirrors `@gpuix/react`'s `render()` — a `globalThis` slot so
 * `hot.ts` remounts onto the same window, and a paced `setTimeout` loop
 * driving `tick()`. It imports no `node:*` module, so it bundles for the browser as-is.
 */

import { GpuixRenderer, type EventPayload } from '@gpuix/native';
import type { DebugFrameOverlayMode } from '@gpuix/native/host';
import { mount, unmount, flushSync } from 'svelte';
import renderer, {
	set_native,
	set_tab_navigation,
	commit,
	is_dirty,
	dispatch,
	set_auto_commit,
	queue_destroy,
	on_window_key,
	on_selection_change
} from './renderer.ts';
import { set_debug_overlay } from './window.ts';
import { create_window_root, wants_titlebar } from './titlebar.ts';
import type { AnyComponent, AppOptions, RenderOptions, ShadowNode } from './types.ts';

/**
 * ~125fps, above the 60 and 120 Hz most displays run at. `setImmediate` instead of a paced
 * timeout burns ~73% CPU at idle (see the comment in @gpuix/react's renderer).
 */
const FRAME_MS = 8;

const SLOT = Symbol.for('gpuix.svelte.host');

/** A browser bundle has no `process` at all, and every knob read through this is desktop-only. */
const env = (name: string): string | undefined => globalThis.process?.env?.[name];

interface Host {
	native: GpuixRenderer | null;
	root: ShadowNode | null;
	component: Record<string, unknown> | null;
	loop: { stop(): void } | null;
	keys: Array<() => void>;
	overlay?: DebugFrameOverlayMode;
	focus_dim?: boolean;
}

function host(): Host {
	const slots = globalThis as unknown as Record<symbol, Host | undefined>;
	return (slots[SLOT] ??= { native: null, root: null, component: null, loop: null, keys: [] });
}

/**
 * A throwing handler must not escape into the native callback, and must not
 * cost the host its own `onEvent`.
 */
export function handle_event(event: EventPayload, onEvent?: (event: EventPayload) => void) {
	try {
		dispatch(event);
		// Run Svelte's effects now, so the
		// mutations they produce make it into this frame's batch.
		flushSync();
		commit();
	} catch (error) {
		console.error('[gpuix-svelte] event handler failed:', error);
	}
	onEvent?.(event);
}

const frame_waiters: Array<() => void> = [];
let looping = false;

/** Resolves after the frame loop's next `tick()`, or a frame's worth of time where there is no loop. */
export function next_frame(): Promise<void> {
	return new Promise((resolve) => {
		if (looping) frame_waiters.push(resolve);
		else setTimeout(resolve, FRAME_MS);
	});
}

function start_automation(native: GpuixRenderer) {
	// stdout is the wire from here on, and a stray write without a newline would swallow the next frame.
	console.log = console.info = console.debug = console.error.bind(console);
	// A computed specifier keeps bundlers from pulling the server, and zod with it, into the web build.
	const server = './automation-server.ts';
	import(server).then(
		(module: typeof import('./automation-server.ts')) => module.serve_automation(native, next_frame),
		(error: unknown) => console.error('[gpuix-svelte] automation server failed to load:', error)
	);
}

function describe_app(path: string, info: AppOptions & { title?: string }) {
	// Computed like the automation server's, so only this branch pulls node:fs in; a minifier
	// may still fold it, which is why `build()` removes the branch itself.
	const writer = './app-info.ts';
	import(writer).then(
		(module: typeof import('./app-info.ts')) => module.report(path, info),
		(error: unknown) => {
			console.error('[gpuix-svelte] could not describe the app:', error);
			globalThis.process?.exit?.(1);
		}
	);
}

export function start_frame_loop(native: Pick<GpuixRenderer, 'requiresTick' | 'tick'>): { stop(): void } {
	if (!native.requiresTick()) {
		// Windows/Linux: GPUI owns a blocking UI thread, so there is no frame loop
		// to poll `is_dirty()` and commits have to schedule themselves. The wasm
		// build takes this path too — it drives its own frames off the canvas.
		set_auto_commit(true);
		return {
			stop() {
				set_auto_commit(false);
			}
		};
	}

	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const loop = () => {
		if (stopped) return;

		const started = performance.now();
		try {
			if (is_dirty()) commit();
		} catch (error) {
			// The reschedule below is the only thing keeping the window alive, so a
			// bad mutation must not escape past it.
			console.error('[gpuix-svelte] commit failed:', error);
		}

		if (native.tick() === false) {
			stopped = true;
			process.exit(0);
		}
		for (const resolve of frame_waiters.splice(0)) resolve();

		timer = setTimeout(loop, Math.max(0, FRAME_MS - (performance.now() - started)));
	};

	looping = true;
	loop();

	return {
		stop() {
			stopped = true;
			looping = false;
			if (timer !== null) clearTimeout(timer);
			for (const resolve of frame_waiters.splice(0)) resolve();
		}
	};
}

/**
 * `GPUIX_FPS` (`1` is `full`) applies once per window and outranks the option, which applies again
 * only when it changed: `render_hot` remounts with the same options, and a cycled mode must survive.
 */
export function overlay_on_render(
	fps: string | undefined,
	option: DebugFrameOverlayMode | undefined,
	applied: DebugFrameOverlayMode | undefined,
	created: boolean
): string | undefined {
	if (fps) return created ? (fps === '1' ? 'full' : fps) : undefined;
	return option === applied ? undefined : option;
}

/** The keyboard-focus dim to ship, or `null` to keep a runtime `set_keyboard_focus_dim` across a `render_hot` remount. */
export function focus_dim_on_render(option: boolean | undefined, applied: boolean | undefined, created: boolean): boolean | null {
	const enabled = option ?? false;
	return created || enabled !== applied ? enabled : null;
}

/** Native 0.11 cannot close a window, so the title bar's close button ends the app the way closing its only window would. */
function close(slot: Host) {
	try {
		if (slot.component) unmount(slot.component);
	} finally {
		globalThis.process?.exit?.(0);
	}
}

/** Mounts a compiled `.svelte` component into the window, creating it on the first call. */
export function render(Component: AnyComponent, options: RenderOptions = {}): Record<string, unknown> {
	const {
		props = {},
		rootStyle,
		onEvent,
		onKeyDown,
		onKeyUp,
		onSelectionChange,
		debugFrameOverlay,
		keyboardFocusDim,
		tabNavigation = true,
		titlebar,
		app,
		...window_options
	} = options;
	if (window_options.title == null && app?.name) window_options.title = app.name;

	// `gpuix-svelte/build` runs the entry this way to learn what to package it as, so no window;
	// it then defines this expression as `undefined`, so the compiled app has no such mode.
	const describe = typeof process === 'undefined' ? undefined : process.env.GPUIX_APP_INFO;
	if (describe) {
		describe_app(describe, { ...app, title: window_options.title });
		return {};
	}

	const slot = host();
	const remount = slot.component != null;
	const created = !slot.native;

	if (!slot.native) {
		slot.native = new GpuixRenderer((err, event) => {
			if (err) {
				console.error('[gpuix-svelte] native event error:', err);
				return;
			}
			if (!event) return;

			handle_event(event, onEvent);
		});

		slot.native.init(window_options);
		const automation = env('GPUIX_AUTOMATION');
		if (automation && automation !== '0') start_automation(slot.native);
		console.log('[gpuix-svelte] created native window');
	}

	if (slot.component) {
		try {
			unmount(slot.component);
		} catch {
			// `bun --hot` re-evaluates Svelte's runtime, so the previous component
			// belongs to a module instance this one cannot see and `unmount`
			// reports it as never mounted. Its GPUI subtree is destroyed below
			// either way, and its effects are unreachable from the new graph.
		}
		slot.component = null;
	}

	// Native ids are monotonic, so a missed teardown here can never collide with
	// the tree built next.
	let retiring: number | null = null;
	if (slot.root && slot.root.nativeId !== null) {
		commit();
		retiring = slot.root.nativeId;
	}

	set_native(slot.native);
	set_tab_navigation(tabNavigation);

	const overlay = overlay_on_render(env('GPUIX_FPS'), debugFrameOverlay, slot.overlay, created);
	if (overlay) set_debug_overlay(overlay as DebugFrameOverlayMode);
	slot.overlay = debugFrameOverlay;

	for (const off of slot.keys) off();
	slot.keys = [];
	if (onKeyDown) slot.keys.push(on_window_key('keydown', onKeyDown));
	if (onKeyUp) slot.keys.push(on_window_key('keyup', onKeyUp));
	if (onSelectionChange) slot.keys.push(on_selection_change(onSelectionChange));

	const bar = wants_titlebar(titlebar, env) ? { title: window_options.title ?? '', on_close: () => close(slot) } : null;
	const { root, target } = create_window_root(rootStyle, focus_dim_on_render(keyboardFocusDim, slot.focus_dim, created), bar);
	slot.focus_dim = keyboardFocusDim ?? false;
	// Queued after `setRoot`, so the tree is never rootless mid-batch — on
	// Windows/Linux the UI thread paints without waiting for us.
	if (retiring !== null) queue_destroy(retiring);
	// A comment anchor, so `mount` doesn't append a stray text node of its own.
	const anchor = renderer.createComment('');
	renderer.insert(target, anchor, null);

	slot.root = root;
	const component = mount(Component, { renderer, target, anchor, props });
	slot.component = component;

	flushSync();
	commit();

	if (!slot.loop) slot.loop = start_frame_loop(slot.native);

	// A window can't be inspected from a terminal but a PNG can, and Preview.app
	// reloads on write, so this doubles as a live view.
	const shot = env('GPUIX_SCREENSHOT');
	if (shot) {
		const native = slot.native;
		setTimeout(() => {
			try {
				// The wasm build has no `captureScreenshot`, and the env var may still be set.
				native.captureScreenshot?.(shot);
				console.log(`[gpuix-svelte] screenshot -> ${shot}`);
			} catch (err) {
				console.error('[gpuix-svelte] screenshot failed:', (err as Error).message);
			}
		}, 600);
	}

	console.log(remount ? '[gpuix-svelte] remount complete' : '[gpuix-svelte] mount complete');
	return component;
}
