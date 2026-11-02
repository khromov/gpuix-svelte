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
		identifier: 'com.example.gpuix-svelte-starter',
		// Where a built app looks for a newer version of itself; the release workflow publishes it
		// there (`npm create gpuix-svelte -- --github owner/repo` fills this in). `publicKey` from
		// `gpuix-svelte update keygen` makes the app refuse a manifest you did not sign.
		// See the Updating page of the docs.
		// update: { manifest: 'https://github.com/<owner>/<repo>/releases/latest/download/update.json' }
	}
});
