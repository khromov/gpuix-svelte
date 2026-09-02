/**
 * The structure mirrors `@gpuix/react`'s `render()` — a `globalThis` slot so
 * `render_hot` remounts onto the same window, and a paced `setTimeout` loop
 * driving `tick()`.
 */

import { watch } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GpuixRenderer } from '@gpuix/native';
import { mount, unmount, flushSync } from 'svelte';
import renderer, {
	set_native,
	create_root,
	commit,
	is_dirty,
	dispatch,
	set_auto_commit,
	queue_destroy,
	on_window_key
} from './renderer.js';

/**
 * ~125fps, above any common refresh rate. `setImmediate` instead of a paced
 * timeout burns ~73% CPU at idle (see the comment in @gpuix/react's renderer).
 */
const FRAME_MS = 8;

const SLOT = Symbol.for('gpuix.svelte.host');

function host() {
	return (globalThis[SLOT] ??= { native: null, root: null, component: null, loop: null, keys: [] });
}

/**
 * A throwing handler must not escape into the native callback, and must not
 * cost the host its own `onEvent`.
 */
export function handle_event(event, onEvent) {
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

export function start_frame_loop(native) {
	if (!native.requiresTick()) {
		// Windows/Linux: GPUI owns a blocking UI thread, so there is no frame loop
		// to poll `is_dirty()` and commits have to schedule themselves.
		set_auto_commit(true);
		return {
			stop() {
				set_auto_commit(false);
			}
		};
	}

	let stopped = false;
	let timer = null;

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
 * @param {any} Component a compiled `.svelte` component
 * @param {{ title?: string, width?: number, height?: number, props?: Record<string, any>,
 *           rootStyle?: Record<string, any>, onEvent?: (e: any) => void,
 *           onKeyDown?: (e: any) => void, onKeyUp?: (e: any) => void }} [options]
 *   `onKeyDown`/`onKeyUp` are `on_window_key` handlers kept across remounts.
 */
export function render(Component, options = {}) {
	const { props = {}, rootStyle, onEvent, onKeyDown, onKeyUp, ...window_options } = options;
	const slot = host();
	const remount = slot.component != null;

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
	let retiring = null;
	if (slot.root && slot.root.nativeId !== null) {
		commit();
		retiring = slot.root.nativeId;
	}

	set_native(slot.native);

	for (const off of slot.keys) off();
	slot.keys = [];
	if (onKeyDown) slot.keys.push(on_window_key('keydown', onKeyDown));
	if (onKeyUp) slot.keys.push(on_window_key('keyup', onKeyUp));

	const root = create_root(rootStyle);
	// Queued after `setRoot`, so the tree is never rootless mid-batch — on
	// Windows/Linux the UI thread paints without waiting for us.
	if (retiring !== null) queue_destroy(retiring);
	// A comment anchor, so `mount` doesn't append a stray text node of its own.
	const anchor = renderer.createComment('');
	renderer.insert(root, anchor, null);

	slot.root = root;
	slot.component = mount(Component, { renderer, target: root, anchor, props });

	flushSync();
	commit();

	if (!slot.loop) slot.loop = start_frame_loop(slot.native);

	// A window can't be inspected from a terminal but a PNG can, and Preview.app
	// reloads on write, so this doubles as a live view.
	const shot = process.env.GPUIX_SCREENSHOT;
	if (shot) {
		setTimeout(() => {
			try {
				slot.native.captureScreenshot(shot);
				console.log(`[gpuix-svelte] screenshot -> ${shot}`);
			} catch (err) {
				console.error('[gpuix-svelte] screenshot failed:', err.message);
			}
		}, 600);
	}

	console.log(remount ? '[gpuix-svelte] remount complete' : '[gpuix-svelte] mount complete');
	return slot.component;
}


/**
 * Watching here rather than leaning on `bun --hot` keeps one Svelte runtime for
 * the life of the process, so the old tree unmounts properly.
 *
 * @param {string | URL} entry path to the root `.svelte` component
 * @param {Parameters<typeof render>[1]} [options]
 */
export async function render_hot(entry, options = {}) {
	// A bare Windows path is not a valid import specifier ("D:" parses as a URL
	// scheme), so the cache-buster is appended to a file:// URL instead.
	const url = entry instanceof URL ? entry : pathToFileURL(entry);
	const path = fileURLToPath(url);

	let version = 0;
	const load = async () => (await import(`${url.href}?v=${++version}`)).default;

	render(await load(), options);

	let timer = null;
	const stale = new Set();
	watch(dirname(path), { recursive: true }, (_event, file) => {
		if (!file) return;

		// JS modules (`.svelte.js` state included) load once per process, which is what
		// lets their state outlive a remount — so an edit there needs a restart, not a reload.
		if (file.endsWith('.js') && !file.includes('node_modules')) {
			if (!stale.has(file)) {
				stale.add(file);
				console.warn(`[gpuix-svelte] ${file} changed — modules load once per process, restart to pick it up`);
			}
			return;
		}
		if (!file.endsWith('.svelte')) return;

		// Editors write in bursts; coalesce them.
		clearTimeout(timer);
		timer = setTimeout(async () => {
			try {
				render(await load(), options);
			} catch (err) {
				console.error('[gpuix-svelte] reload failed:', err.message);
			}
		}, 60);
	});
}
