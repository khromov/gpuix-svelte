// test/bundle.ts runs this under GPUIX_APP_INFO: it must report its `app` options and never open a window.
import { render } from 'gpuix-svelte';
import Counter from '../examples/counter/Counter.svelte';

render(Counter, {
	width: 320,
	height: 240,
	app: { name: 'Probe', identifier: 'test.probe', icon: './icon.png' }
});
