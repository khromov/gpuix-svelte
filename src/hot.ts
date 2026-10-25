/**
 * Split out of `render.ts` so a browser bundle of the package never resolves
 * `node:fs` — hot reload is the only thing here that needs it.
 */

import { watch } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { render } from './render.ts';
import type { AnyComponent, RenderOptions } from './types.ts';

// Bun keys ES modules by path alone, so the `?v=N` that busts Node's cache reaches nothing
// there, but it re-evaluates one dropped from `require.cache`, where Node never puts an ES module.
const module_cache = createRequire(import.meta.url).cache;

/** The newest `url` and the components under it; `.svelte.ts` modules keep their single instance. */
export async function import_fresh(url: URL, version: number): Promise<Record<string, unknown>> {
	for (const key of Object.keys(module_cache)) {
		if (key.endsWith('.svelte') && !key.includes('node_modules')) delete module_cache[key];
	}
	return import(`${url.href}?v=${version}`);
}

/**
 * An in-process watch keeps one Svelte runtime for the life of the process, so the
 * old tree unmounts properly; `bun --hot` would re-evaluate that runtime.
 *
 * `entry` is the root `.svelte` component, as a path or a `file:` URL.
 */
export async function render_hot(entry: string | URL, options: RenderOptions = {}): Promise<void> {
	// A bare Windows path is not a valid import specifier ("D:" parses as a URL
	// scheme), so the cache-buster goes on a file:// URL.
	const url = entry instanceof URL ? entry : pathToFileURL(entry);
	const path = fileURLToPath(url);

	let version = 0;
	const load = async () => (await import_fresh(url, ++version)).default as AnyComponent;

	render(await load(), options);

	let timer: ReturnType<typeof setTimeout> | undefined;
	const stale = new Set<string>();
	watch(dirname(path), { recursive: true }, (_event, file) => {
		if (!file) return;

		// Modules (`.svelte.ts` state included) load once per process, which is what
		// lets their state outlive a remount — so an edit there needs a restart.
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
