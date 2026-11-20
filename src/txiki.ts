import { render as render_native } from './render.ts';
import type { AnyComponent, RenderOptions } from './types.ts';

export * from './web.ts';

export function render(component: AnyComponent, options: RenderOptions = {}): Record<string, unknown> {
	return render_native(component, options);
}

/** The mobile bundler replaces a static component path with the component itself. */
export function render_hot(entry: string | URL, options: RenderOptions = {}): Promise<void> {
	const value: unknown = entry;
	if (typeof value === 'function') {
		render(value as AnyComponent, options);
		return Promise.resolve();
	}
	return Promise.reject(new Error('[gpuix-svelte] txiki.js render_hot() needs a literal component entry bundled by the gpuix-svelte --txiki CLI'));
}
