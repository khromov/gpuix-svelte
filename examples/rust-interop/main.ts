/**
 * Four ways to talk to the same Rust code from a gpuix-svelte app, none of which
 * rebuilds @gpuix/native. `cargo build` runs here, before the window, so a first
 * launch compiles in the terminal rather than behind a blank window.
 */

import { render_hot } from 'gpuix-svelte';
import { ensure_built } from './transports/cargo.ts';

ensure_built();

render_hot(new URL('./App.svelte', import.meta.url), {
	title: 'gpuix-svelte ↔ Rust',
	width: 1000,
	height: 720
});
