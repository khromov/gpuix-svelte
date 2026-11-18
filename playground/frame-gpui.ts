/**
 * The GPUI result frame: GPUI's wasm build painting a canvas, as `demo:web` runs it. Every batch
 * the renderer ships is copied to the page, which rebuilds the element tree from them.
 */

import type { AnyComponent } from 'gpuix-svelte';
import { ROOT_STYLE, connect, forward_console, post } from './frame.ts';

forward_console();

try {
	// Dynamic, so a browser the wasm cannot start in is reported instead of failing the module graph.
	const { GpuixRenderer } = await import('@gpuix/native');
	const { render } = await import('gpuix-svelte');
	const { set_remounting } = await import('gpuix-svelte/renderer');

	const apply = GpuixRenderer.prototype.applyBatch;
	GpuixRenderer.prototype.applyBatch = function (json: string) {
		const destroyed = apply.call(this, json);
		post({ type: 'batch', ops: JSON.parse(json) });
		return destroyed;
	};

	// Every run is a reload: the module's `:root` rules are in before `render` unmounts the tree the last run left up.
	connect((component) => render(component as AnyComponent, { rootStyle: ROOT_STYLE }), set_remounting);
} catch (error) {
	post({ type: 'fatal', text: error instanceof Error ? error.message : String(error) });
}
