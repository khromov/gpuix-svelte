/**
 * Split out of `render.ts` so a browser bundle of the package never resolves
 * `node:fs` — hot reload is the only thing here that needs it.
 */

import { watch } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { render } from './render.ts';
import type { RenderOptions } from './types.ts';

/**
 * Watching here rather than leaning on `bun --hot` keeps one Svelte runtime for
 * the life of the process, so the old tree unmounts properly.
 *
 * `entry` is the path to the root `.svelte` component.
 */
export async function render_hot(entry: string | URL, options: RenderOptions = {}): Promise<void> {
	// A bare Windows path is not a valid import specifier ("D:" parses as a URL
	// scheme), so the cache-buster is appended to a file:// URL instead.
	const url = entry instanceof URL ? entry : pathToFileURL(entry);
	const path = fileURLToPath(url);

	let version = 0;
	const load = async () => (await import(`${url.href}?v=${++version}`)).default;

	render(await load(), options);

	let timer: ReturnType<typeof setTimeout> | undefined;
	const stale = new Set<string>();
	watch(dirname(path), { recursive: true }, (_event, file) => {
		if (!file) return;

		// Modules (`.svelte.ts` state included) load once per process, which is what
		// lets their state outlive a remount — so an edit there needs a restart, not a reload.
		if (/\.[jt]s$/.test(file) && !file.includes('node_modules')) {
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
				console.error('[gpuix-svelte] reload failed:', (err as Error).message);
			}
		}, 60);
	});
}
