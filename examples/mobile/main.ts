import { render } from 'gpuix-svelte';
import MobileCounter from './MobileCounter.svelte';

render(MobileCounter, {
	title: 'Mobile Counter',
	app: { name: 'Mobile Counter', identifier: 'dev.gpuix.svelte.mobilecounter' }
});
