import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./HackerNews.svelte', import.meta.url), {
	title: 'GPUIX + Svelte — Hacker News',
	width: 760,
	height: 820
});
