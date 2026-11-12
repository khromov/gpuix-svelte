/**
 * The DOM result frame: the same `render()` call on the package's DOM build. The page reloads this
 * frame for every run, so nothing a component left on `<html>` or `window` carries over.
 */

import type { AnyComponent } from 'gpuix-svelte';
import { render } from 'gpuix-svelte';
import { ROOT_STYLE, connect, forward_console, post } from './frame.ts';

forward_console();

let queued = false;
new MutationObserver(() => {
	if (queued) return;
	queued = true;
	requestAnimationFrame(() => {
		queued = false;
		post({ type: 'html', html: document.body.innerHTML });
	});
}).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });

connect((component) => render(component as AnyComponent, { rootStyle: ROOT_STYLE }));
