/**
 * Like `@gpuix/react`'s `render()`, a `globalThis` slot so `hot.ts` remounts onto the same window,
 * but with a frame loop of its own rather than `@gpuix/native/runtime`'s `startFrameLoop`, which has
 * no room for the commit, the frame waiters or VoiceOver's pace. Its only `node:*` imports are
 * previous-instance.ts's `node:fs` and screen-reader.ts's `node:child_process`, which Bun's browser
 * build stubs, so it bundles for the browser as-is.
 */

import { GpuixRenderer, type EventPayload, type WindowOptions } from '@gpuix/native';
import type { DebugFrameOverlayMode } from '@gpuix/native/host';
import { mount, unmount, flushSync } from 'svelte';
import renderer, {
	set_native,
	set_tab_navigation,
	commit,
	is_dirty,
	dispatch,
	set_auto_commit,
	set_on_dirty,
	queue_destroy,
	on_window_key,
	on_selection_change
} from './renderer.ts';
import { set_debug_overlay } from './window.ts';
import { create_window_root, wants_titlebar } from './titlebar.ts';
import { wait_for_previous_instance } from './previous-instance.ts';
import { voiceover_running } from './screen-reader.ts';
import type { AnyComponent, AppOptions, RenderOptions, ShadowNode } from './types.ts';

/** ~125fps, above the 60 and 120 Hz most displays run at; `setImmediate` instead burns most of a core at idle. */
const FRAME_MS = 8;

/** Native answers one accessibility request per `tick()`, and at 8 ms each VoiceOver gives up on the app ("not responding"). */
const VOICEOVER_FRAME_MS = 1;

/** Where display-link wakes drive the ticks (macOS), the timer only pumps a window whose link has stopped: hidden, minimised or occluded. */
const IDLE_FRAME_MS = 100;

/** Input reaches JS only on a tick and never wakes it, so the loop keeps `FRAME_MS` this long after the last input or drawn frame. */
const ACTIVE_MS = 2000;

/** Longer than a frame at 60 Hz, so while the display link runs its next wake comes before this timer does. */
const WAKE_WAIT_MS = 25;

/** Events a paint sends, which say nothing about anyone using the window. */
const PAINT_EVENTS = new Set(['layout', 'scrollChange', 'motionComplete', 'highlight', 'visibleRange']);

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
	// A named property, since Bun's `trim` takes any computed key on `globalThis` for a way to reach `eval` and every Bun API.
	const slots = globalThis as unknown as { __gpuix_svelte_host?: Host };
	return (slots.__gpuix_svelte_host ??= { native: null, root: null, component: null, loop: null, keys: [] });
}

/**
 * A throw escaping into the native callback ends the process, so neither a handler nor the
 * host's `onEvent` may let one through, and a handler's must not cost the host its `onEvent`.
 */
export function handle_event(event: EventPayload, onEvent?: (event: EventPayload) => void) {
	if (!PAINT_EVENTS.has(event.eventType)) running_loop?.input();
	try {
		dispatch(event);
		// Run Svelte's effects now, so the
		// mutations they produce make it into this frame's batch.
		flushSync();
		commit();
	} catch (error) {
		console.error('[gpuix-svelte] event handler failed:', error);
	}
	try {
		onEvent?.(event);
	} catch (error) {
		console.error('[gpuix-svelte] onEvent failed:', error);
	}
}

const frame_waiters: Array<() => void> = [];

/** What reaches the running frame loop between its ticks. */
let running_loop: { soon(): void; input(): void } | null = null;

/** Resolves after the frame loop's next `tick()`, which it brings forward to a frame after the last, or a frame's worth of time where there is no loop. */
export function next_frame(): Promise<void> {
	return new Promise((resolve) => {
		if (!running_loop) return void setTimeout(resolve, FRAME_MS);
		frame_waiters.push(resolve);
		running_loop.soon();
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

export function start_frame_loop(
	native: Pick<GpuixRenderer, 'requiresTick' | 'tick'> & Partial<Pick<GpuixRenderer, 'setFrameWakeCallback'>>
): { stop(): void } {
	if (!native.requiresTick()) {
		// Only the wasm build, which drives its own frames off the canvas: with no loop
		// to poll `is_dirty()`, commits have to schedule themselves. Every desktop platform
		// ticks, and `tick()` going false below is what ends the process with its last window.
		set_auto_commit(true);
		return {
			stop() {
				set_auto_commit(false);
			}
		};
	}

	let stopped = false;
	let waking = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let due = 0;
	let started = 0;
	let last_wake = -Infinity;
	let last_active = -Infinity;

	/** Never pushes a pending tick back, only forward. */
	const schedule = (delay: number) => {
		const at = performance.now() + delay;
		if (timer !== null) {
			if (due <= at) return;
			clearTimeout(timer);
		}
		due = at;
		timer = setTimeout(loop, delay);
	};
	const soon = () => schedule(Math.max(0, FRAME_MS - (performance.now() - started)));

	const frame_ms = () => {
		if (voiceover_running(started)) return VOICEOVER_FRAME_MS;
		if (!waking) return FRAME_MS;
		if (started - last_wake < WAKE_WAIT_MS) return WAKE_WAIT_MS;
		return started - last_active < ACTIVE_MS ? FRAME_MS : IDLE_FRAME_MS;
	};

	const stop = () => {
		stopped = true;
		running_loop = null;
		set_on_dirty(null);
		if (waking) native.setFrameWakeCallback?.(null);
		if (timer !== null) clearTimeout(timer);
		timer = null;
		for (const resolve of frame_waiters.splice(0)) resolve();
	};

	function loop() {
		if (stopped) return;
		if (timer !== null) clearTimeout(timer);
		timer = null;

		started = performance.now();
		// The reschedule below is the only thing keeping the window alive, so neither a bad
		// mutation nor a failing pump may escape past it.
		try {
			if (is_dirty()) commit();
		} catch (error) {
			console.error('[gpuix-svelte] commit failed:', error);
		}
		let open = true;
		try {
			open = native.tick();
		} catch (error) {
			console.error('[gpuix-svelte] tick failed:', error);
		}
		if (open === false) {
			stop();
			process.exit(0);
			return;
		}
		for (const resolve of frame_waiters.splice(0)) resolve();

		schedule(Math.max(0, frame_ms() - (performance.now() - started)));
	}

	// Only macOS has the wake, which arrives once the display link has queued a frame, and the link stops while nothing draws.
	waking =
		native.setFrameWakeCallback?.(() => {
			last_wake = last_active = performance.now();
			loop();
		}) === true;
	running_loop = {
		soon,
		input() {
			last_active = performance.now();
			soon();
		}
	};
	// A timer or a fetch changes the tree between wakes, and an idle window's next tick may be a long way off.
	set_on_dirty(soon);
	loop();

	return { stop };
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

/**
 * The identifier becomes the app id because that is what a Linux desktop matches a window's `.desktop` file by,
 * and an automated run opens behind what the person at the machine is typing into unless the app asks for focus.
 */
export function window_options_for(options: WindowOptions, app: AppOptions | undefined, automated = false): WindowOptions {
	const merged = { ...options };
	if (merged.title == null && app?.name) merged.title = app.name;
	// Native takes the "Hide" and "Quit" menu items' name from the title otherwise.
	if (merged.appName == null && app?.name) merged.appName = app.name;
	if (merged.appId == null && app?.identifier) merged.appId = app.identifier;
	if (merged.focus == null && automated) merged.focus = false;
	return merged;
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
		...own_window_options
	} = options;
	const automated = typeof process !== 'undefined' && !!process.env.GPUIX_AUTOMATION && process.env.GPUIX_AUTOMATION !== '0';
	const window_options = window_options_for(own_window_options, app, automated);
	const slot = host();
	const remount = slot.component != null;
	const created = !slot.native;

	if (!slot.native) {
		// After a self-update, the instance that installed it is still exiting; its window must be gone first.
		wait_for_previous_instance();
		slot.native = new GpuixRenderer((err, event) => {
			if (err) {
				console.error('[gpuix-svelte] native event error:', err);
				return;
			}
			if (!event) return;

			handle_event(event, onEvent);
		});

		slot.native.init(window_options);
		// Spelled out again, not read through `automated` or env(): only then does build()'s define fold the branch and its import away.
		if (typeof process !== 'undefined' && process.env.GPUIX_AUTOMATION && process.env.GPUIX_AUTOMATION !== '0') start_automation(slot.native);
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
