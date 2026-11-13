/**
 * The entry Vite serves (`npm run demo:ui-dom`): the same `render()` call as the GPUI entry (main.ts) makes,
 * with the DOM build of `gpuix-svelte` behind it, so the toolkit draws as DOM elements in a page.
 */

import { render } from 'gpuix-svelte';
import Showcase from './Showcase.svelte';

render(Showcase, { title: 'gpuix-svelte-ui' });
