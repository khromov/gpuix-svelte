import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./QuickJsFixture.svelte', import.meta.url), {
	title: 'QuickJS Svelte integration',
	width: 520,
	height: 680
});
