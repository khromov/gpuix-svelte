/**
 * The structure mirrors `@gpuix/react`'s `render()` — a `globalThis` slot so
 * `hot.ts` remounts onto the same window, and a paced `setTimeout` loop
 * driving `tick()`. Node-free, so it bundles for the browser as-is.
 */

import { GpuixRenderer, type EventPayload } from '@gpuix/native';
import type { DebugFrameOverlayMode } from '@gpuix/native/host';
import { mount, unmount, flushSync } from 'svelte';
import renderer, {
	set_native,
	create_root,
	commit,
	is_dirty,
	dispatch,
	set_auto_commit,
	queue_destroy,
	on_window_key,
	on_selection_change
} from './renderer.ts';
import { set_debug_overlay } from './window.ts';
import type { AnyComponent, RenderOptions, ShadowNode } from './types.ts';

/**
 * ~125fps, above any common refresh rate. `setImmediate` instead of a paced
 * timeout burns ~73% CPU at idle (see the comment in @gpuix/react's renderer).
 */
const FRAME_MS = 8;

const SLOT = Symbol.for('gpuix.svelte.host');

/** A browser bundle has no `process` at all, and both knobs it gates are desktop-only. */
const env = (name: string): string | undefined => globalThis.process?.env?.[name];

interface Host {
	native: GpuixRenderer | null;
	root: ShadowNode | null;
	component: Record<string, unknown> | null;
	loop: { stop(): void } | null;
	keys: Array<() => void>;
	overlay?: DebugFrameOverlayMode;
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
		// Run Svelte's effects now rather than on the next microtask, so the
		// mutations they produce make it into this frame's batch.
		flushSync();
		commit();
	} catch (error) {
		console.error('[gpuix-svelte] event handler failed:', error);
	}
	onEvent?.(event);
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

		timer = setTimeout(loop, Math.max(0, FRAME_MS - (performance.now() - started)));
	};

	loop();

	return {
		stop() {
			stopped = true;
			if (timer !== null) clearTimeout(timer);
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

/** Mounts a compiled `.svelte` component into the window, creating it on the first call. */
export function render(Component: AnyComponent, options: RenderOptions = {}): Record<string, unknown> {
	const { props = {}, rootStyle, onEvent, onKeyDown, onKeyUp, onSelectionChange, debugFrameOverlay, ...window_options } = options;
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

	const overlay = overlay_on_render(env('GPUIX_FPS'), debugFrameOverlay, slot.overlay, created);
	if (overlay) set_debug_overlay(overlay as DebugFrameOverlayMode);
	slot.overlay = debugFrameOverlay;

	for (const off of slot.keys) off();
	slot.keys = [];
	if (onKeyDown) slot.keys.push(on_window_key('keydown', onKeyDown));
	if (onKeyUp) slot.keys.push(on_window_key('keyup', onKeyUp));
	if (onSelectionChange) slot.keys.push(on_selection_change(onSelectionChange));

	const root = create_root(rootStyle);
	// Queued after `setRoot`, so the tree is never rootless mid-batch — on
	// Windows/Linux the UI thread paints without waiting for us.
	if (retiring !== null) queue_destroy(retiring);
	// A comment anchor, so `mount` doesn't append a stray text node of its own.
	const anchor = renderer.createComment('');
	renderer.insert(root, anchor, null);

	slot.root = root;
	const component = mount(Component, { renderer, target: root, anchor, props });
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
