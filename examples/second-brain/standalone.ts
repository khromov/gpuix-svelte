// `render_hot` re-imports the component from disk on every save, and a binary
// has no source on disk, so the compiled entry mounts it through a static import.
import { render } from 'gpuix-svelte';
import App from './App.svelte';
import { create_app } from './lib/app.ts';
import { WINDOW } from './lib/window.ts';

const app = await create_app();
render(App, { ...WINDOW, props: { app } });
