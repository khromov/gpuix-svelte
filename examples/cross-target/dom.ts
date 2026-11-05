/**
 * The entry Vite serves: the same `render()` call as a GPUI app makes, with the DOM twin of
 * `gpuix-svelte` behind it. `title` becomes the page title; the window size is the page's.
 */

import { render } from 'gpuix-svelte';
import CrossTarget from './CrossTarget.svelte';

render(CrossTarget, { title: 'GPUIX + Svelte — Cross-target', width: 720, height: 520 });
