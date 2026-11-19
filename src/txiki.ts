import { render as render_native } from './render.ts';
import { get_native } from './renderer.ts';
import { prompt_for_paths as prompt_for_paths_native, set_window_title as set_window_title_native } from './window.ts';
import type { PathPromptOptions } from '@gpuix/native';
import type { AnyComponent, RenderOptions } from './types.ts';

export * from './web.ts';

export async function prompt_for_paths(options?: PathPromptOptions): Promise<string[] | null> {
	require_window_method('promptForPaths');
	return prompt_for_paths_native(options);
}

function require_window_method(name: string): (...args: unknown[]) => unknown {
	const native = get_native() as (Record<string, unknown> & object) | null;
	const method = native?.[name];
	if (typeof method !== 'function') throw new Error(`[gpuix-svelte] ${name} is not supported by this txiki.js host`);
	return method.bind(native);
}

export function set_window_title(title: string): void {
	require_window_method('setWindowTitle');
	set_window_title_native(title);
}
export const activate_window = () => require_window_method('activateWindow')();
export const minimize_window = () => require_window_method('minimizeWindow')();
export const zoom_window = () => require_window_method('zoomWindow')();
export const toggle_fullscreen = () => require_window_method('toggleFullscreen')();

export function render(component: AnyComponent, options: RenderOptions = {}): Record<string, unknown> {
	if (options.app?.update) throw new Error('[gpuix-svelte] app updates are not supported by the txiki.js runtime');
	return render_native(component, options);
}

/** The txiki.js CLI owns file watching; the CLI bundles this entry and reloads it on change. */
export function render_hot(entry: string | URL, options: RenderOptions = {}): Promise<void> {
	if (options.app?.update) return Promise.reject(new Error('[gpuix-svelte] app updates are not supported by the txiki.js runtime'));
	const value: unknown = entry;
	if (typeof value === 'function') {
		render(value as AnyComponent, options);
		return Promise.resolve();
	}
	return Promise.reject(new Error('[gpuix-svelte] txiki.js render_hot() needs a literal component entry bundled by the gpuix-svelte --txiki CLI'));
}
