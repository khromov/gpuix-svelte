/**
 * Runs inside the Rust binary: rustyscript's embedded Deno loads this bundle, and
 * `rustyscript.functions.*` are Rust closures, so a message to Rust is a plain call.
 */

import { render } from 'gpuix-svelte';
import App from './App.svelte';

render(App, { title: 'Rust binary, embedded Svelte view', width: 760, height: 520 });
