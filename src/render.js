/**
 * App entry point: open a GPUI window and mount a Svelte component into it.
 *
 * The structure mirrors `@gpuix/react`'s `render()` — a `globalThis` slot so
 * `bun --hot` remounts onto the same window, and a paced `setTimeout` loop
 * driving `tick()`.
 */

import { watch } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GpuixRenderer } from '@gpuix/native';
import { mount, unmount, flushSync } from 'svelte';
import renderer, { set_native, create_root, commit, is_dirty, dispatch } from './renderer.js';

/**
 * ~125fps, above any common refresh rate. `setImmediate` instead of a paced
 * timeout burns ~73% CPU at idle (see the comment in @gpuix/react's renderer).
 */
const FRAME_MS = 8;

const SLOT = Symbol.for('gpuix.svelte.host');

function host() {
	return (globalThis[SLOT] ??= { native: null, root: null, component: null, loop: null });
}

function start_frame_loop(native) {
	if (!native.requiresTick()) {
		// Windows/Linux: GPUI owns a blocking UI thread and there is no JS frame
		// to hang a commit on, so drain on a microtask instead.
		return { stop() {} };
	}

	let stopped = false;
	let timer = null;

	const loop = () => {
		if (stopped) return;

		const started = performance.now();
		if (is_dirty()) commit();

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
 *           rootStyle?: Record<string, any>, onEvent?: (e: any) => void }} [options]
 */
export function render(Component, options = {}) {
	const { props = {}, rootStyle, onEvent, ...window_options } = options;
	const slot = host();
	const remount = slot.component != null;

	if (!slot.native) {
		slot.native = new GpuixRenderer((err, event) => {
			if (err) {
				console.error('[gpuix-svelte] native event error:', err);
				return;
			}
			if (!event) return;

			dispatch(event);
			// Run Svelte's effects now rather than on the next microtask, so the
			// mutations they produce make it into this frame's batch.
			flushSync();
			commit();
			onEvent?.(event);
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
	if (slot.root && slot.root.nativeId !== null) {
		commit();
		// via applyBatch — the direct destroyElement method is gone in 0.6
		slot.native.applyBatch(JSON.stringify([['destroyElement', slot.root.nativeId]]));
	}

	set_native(slot.native);

	const root = create_root(rootStyle);
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
 * `render()` plus reload-on-save for `.svelte` files.
 *
 * Watching here rather than leaning on `bun --hot` keeps one Svelte runtime for
 * the life of the process, so the old tree unmounts properly — see "Hot reload"
 * in README.md.
 *
 * @param {string | URL} entry path to the root `.svelte` component
 * @param {Parameters<typeof render>[1]} [options]
 */
export async function render_hot(entry, options = {}) {
	const path = entry instanceof URL ? fileURLToPath(entry) : entry;

	let version = 0;
	const load = async () => (await import(`${path}?v=${++version}`)).default;

	render(await load(), options);

	let timer = null;
	watch(dirname(path), { recursive: true }, (_event, file) => {
		if (!file || !file.endsWith('.svelte')) return;

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
