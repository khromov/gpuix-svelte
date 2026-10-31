// The entry `npm run build` compiles: a binary carries no source to hot-reload, so it imports the
// component statically and mounts it with `render`.
import { render } from 'gpuix-svelte';
import App from './App.svelte';

render(App, {
	title: 'gpuix-svelte starter',
	width: 640,
	height: 480,
	// What `npm run build` packages the executable as; the window takes only its Linux app id from it.
	app: {
		identifier: 'com.example.gpuix-svelte-starter'
	}
});
