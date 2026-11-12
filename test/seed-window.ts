/**
 * `render()` reuses a native it finds in its `globalThis` slot, so a headless one seeded there runs
 * all of `render()` but opening the window and starting the frame loop.
 */

import { TestGpuixRenderer } from '@gpuix/native';

export function seed_window({ created = false } = {}) {
	const native = new TestGpuixRenderer();
	let reads = 0;
	(globalThis as unknown as { __gpuix_svelte_host: unknown }).__gpuix_svelte_host = {
		// `render()` reads this twice: empty the first time tells it the window is new, and filled the second keeps it from opening one.
		get native() {
			return created && reads++ === 0 ? null : native;
		},
		root: null,
		component: null,
		loop: { stop() {} },
		keys: []
	};
	return native;
}
