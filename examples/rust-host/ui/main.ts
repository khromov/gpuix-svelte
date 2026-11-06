/**
 * The view half: the Rust host spawns this and owns every piece of state. Lines on
 * stdin are the host's messages, lines on stdout are the view's commands — so the
 * renderer's own logging moves to stderr before the window exists.
 */

import { render } from 'gpuix-svelte';
import App from './App.svelte';
import { connect } from './ipc.svelte.ts';

console.log = console.info = console.debug = (...args: unknown[]) => console.error(...args);

connect();

render(App, {
	title: 'Rust app, Svelte view',
	width: 760,
	height: 520,
	app: { name: 'Rust host demo', identifier: 'dev.gpuix.rust-host' }
});
