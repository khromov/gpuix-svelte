// The static entry for the QuickJS build (`npm run demo:hn:qjs`): the host's
// `fetch` and `URL` are what this example exercises there.
import { render } from 'gpuix-svelte';
import HackerNews from './HackerNews.svelte';

render(HackerNews, {
	title: 'Hacker News',
	width: 720,
	height: 820
});
