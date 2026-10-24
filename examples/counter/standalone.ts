// The static entry: `render_hot` re-imports from disk, which a bundle has no
// source for, so the QuickJS build mounts the component through a static import
// and the dev server re-imports this whole entry to remount.
import { render } from 'gpuix-svelte';
import Counter from './Counter.svelte';

render(Counter, {
	title: 'GPUIX + Svelte',
	width: 820,
	height: 560
});
