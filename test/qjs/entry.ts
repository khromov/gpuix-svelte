// Mounted on the QuickJS host by test/qjs.ts. A keystroke simulated through GPUI
// has to come back through the host's event queue into Svelte, and a re-import
// of this entry after an edit has to remount on the same window.
import { get_native, render } from 'gpuix-svelte';
import App from './App.svelte';

render(App, { title: 'qjs test', width: 320, height: 200 });
console.log('[qjs-test] mounted');

// Well after the first paint: a keystroke before the window has focus is lost.
setTimeout(() => {
	// The production renderer has `simulateKeystrokes`; the type only declares it on the test one.
	(get_native() as unknown as { simulateKeystrokes(keys: string): void } | null)?.simulateKeystrokes('space');
}, 800);
