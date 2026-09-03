/**
 * The UI headlessly: mount Substrate with a stubbed worker, capture a note through
 * GPUI's real hit testing, open it, go back with Escape, and delete it through
 * the confirm dialog.
 */

if (!process.versions.bun) {
	console.error('[smoke] needs Bun — `npm run test:brain`');
	process.exit(1);
}

process.env.GPUIX_BRAIN_THEME = 'dark';

import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dispatch } from 'gpuix-svelte';
import {
	mount_headless,
	wait,
	focus,
	unfocus,
	find,
	find_all,
	find_test_id,
	click_text,
	click_test_id,
	press,
	painted,
	all_text,
	screenshot,
	check,
	finish
} from 'gpuix-svelte/test';
import type { ClickOptions } from 'gpuix-svelte/test';
import { create_app } from '../lib/app.ts';
import { MlStub } from '../lib/ml-stub.ts';
import { push, route } from '../lib/router.svelte.ts';
import { DARK, LIGHT } from '../lib/theme.ts';
import { set_mode } from '../lib/theme.svelte.ts';
import { ui } from '../lib/ui.svelte.ts';

const RSS = `<rss version="2.0"><channel><title>Newsonaut</title><link>https://feed.test/</link>
<item><title>Mycelium and the wood wide web</title><link>https://feed.test/post-1</link><guid>post-1</guid>
<description>Fungal networks trade sugar for phosphorus.</description></item></channel></rss>`;

const app = await create_app({
	data_dir: mkdtempSync(join(tmpdir(), 'substrate-smoke-')),
	ml: new MlStub(),
	seed: true,
	fetch: async (url) =>
		String(url).includes('rss.xml')
			? new Response(RSS, { headers: { 'content-type': 'application/rss+xml' } })
			: new Response('<html><body><article><p>The full post about mycelium.</p></article></body></html>', { headers: { 'content-type': 'text/html' } })
});
await app.feeds.add('https://feed.test/rss.xml');
await app.ingest.idle();

const App = (await import('../App.svelte')).default;
// 538 is the headless height cap; anything laid out below it cannot be hit.
const { native } = mount_headless(App, { props: { app }, width: 1100, height: 538 });

/** A click, then the timers and dynamic imports a route change runs through. */
async function tap(text: string, opts?: ClickOptions) {
	click_text(text, opts);
	await wait();
}

await wait();
await wait();
check('brand painted', painted().includes('Substrate'));
// Off-screen rows of the virtual timeline are retained but not painted.
check('seeded note in the timeline', all_text().some((t) => t.includes('Compost notes')));
check('sidebar counts painted', painted().includes('Everything'));

// The palette reaches every <style> through set_css_vars, so a mode switch is one restyle.
const root_bg = () => find_test_id('root')!.style!.backgroundColor;
check('dark palette applied through css vars', root_bg(), DARK.bg);
set_mode('light');
await wait();
check('switching the mode restyles', root_bg(), LIGHT.bg);
set_mode('dark');
await wait();

const textarea = find((n) => n.type === 'textarea');
check('capture textarea exists', textarea != null);
dispatch({ elementId: textarea!.id, eventType: 'change', value: 'Buy compost for the raised beds' });
await wait();
await tap('Save');
await app.ingest.idle();
await wait();
check('new note appears in the timeline', painted().includes('Buy compost for the raised beds'));
const note = app.store.list_items({ limit: 1 })[0];
check('new note is in the store', note.body, 'Buy compost for the raised beds');

await tap('Buy compost for the raised beds');
await wait();
check('card click opens the item route', route.path, `/item/${note.id}`);
check('item page paints the body', painted().includes('Buy compost for the raised beds'));
check('window title follows the route', ui.title, 'Item');

press('escape');
await wait();
check('escape goes back', route.path, '/');

await tap('Buy compost for the raised beds');
await wait();
await tap('Substrate');
check('brand click goes home', route.path, '/');

// A long body is one <markdown> row per block under a virtual Scroller: every block stays in
// the tree, but only those near the viewport are built and painted.
const paragraphs = Array.from({ length: 150 }, (_, i) => `Paragraph ${i} of the long page.`);
const long_note = app.add_note({ title: 'Long page', body: paragraphs.join('\n\n') });
await app.ingest.idle();
push(`/item/${long_note.id}`);
await wait();
await wait();
check('long page keeps a markdown row per block', find_all((n) => n.type === 'markdown').length, 150);
check('and paints the first block', painted().includes('Paragraph 0 of the long page.'));
check('but not the last', painted().includes('Paragraph 149 of the long page.'), false);
const body_list = find_test_id('item-body')!;
let last_block = -1;
body_list.children!.forEach((row, i) => {
	if (row.children?.some((c) => c.type === 'markdown')) last_block = i;
});
native.scrollToItem(body_list.id, last_block);
await wait();
check('scrolling to the end paints the last block', painted().includes('Paragraph 149 of the long page.'));
await tap('Substrate');

// Typing `k` into the search box offers `kind:`; picking a kind completes and searches.
const search_input = find((n) => n.type === 'input');
focus(search_input!);
dispatch({ elementId: search_input!.id, eventType: 'change', value: 'k' });
await wait();
check('typing k suggests kind:', ui.suggest?.items.map((i) => i.label).join(','), 'kind:');
check('suggestion painted', painted().includes('filter by kind — note, link, image or audio'));
await tap('kind:');
check('picking kind: suggests the kinds', ui.suggest?.items.map((i) => i.label).join(','), 'kind:note,kind:link,kind:image,kind:audio');
await tap('kind:image');
await wait(250);
check('completion searches by kind', route.path === '/search' && route.query.q, 'kind:image');
check('kind listing paints the image', painted().includes('Tic-tac-toe icon'));
// The thumbnail is a row in the database until something asks for a path, so an <img>
// in the tree at all is the proof that the blob reached the cache.
check('the thumbnail blob materialised into an <img>', find_all((n) => n.type === 'img').length > 0);
check('and its cache file is on disk', existsSync(app.blobs.file(app.list({ kind: 'image' })[0].thumb_blob)!));
// Escape in the box clears it; the window handler sees `editing` and leaves the route
// alone. blur() is a no-op headlessly, so unfocus() stands in for the box letting go.
focus(search_input!);
press('escape');
await wait();
check('escape clears the search box', route.path, '/search');
unfocus();
press('escape');
await wait();
await wait();
check('escape from the window leaves search', route.path, '/');

await tap('Buy compost for the raised beds');
await wait();
await tap('Delete');
check('confirm dialog opens', ui.modals, 1);
check('dialog painted on top', painted().includes('Delete this item?'));
click_test_id('modal-confirm');
await wait();
check('confirm deletes the item', app.get_item(note.id), null);
check('delete navigates back', route.path, '/');
await wait();
check('deleted note gone from the timeline', all_text().some((t) => t.includes('Buy compost for the raised beds')), false);

push('/feeds');
await wait();
await wait();
const feed = app.feeds.list()[0];
check('the feeds route lists the subscription', painted().includes('Newsonaut'));
check('and says how much it brought in', painted().includes('1 items'));
await tap('Options');
check('the options panel opens', painted().includes('Fetch the full article'));
await tap('Fetch the full article');
check('a toggle writes through to the feed', app.feeds.get(feed.id)!.full_text, false);

push('/');
await wait();
await wait();
check('the timeline carries a feeds switch', painted().includes('Include feeds'));
check('and shows the feed entry', painted().includes('Mycelium and the wood wide web'));
await tap('Include feeds');
check('unticking it hides feed items', painted().includes('Mycelium and the wood wide web'), false);
check('and the choice is stored', app.settings.get('timeline.includeFeeds'), false);

push('/search?q=mycelium');
await wait();
await wait(250);
await wait();
check('search filters carry the same switch', painted().includes('Include feeds'));
check('feed items are out of the results', painted().includes('No matches'));
await tap('Include feeds');
await wait(250);
await wait();
check('ticking it brings them back', painted().includes('Mycelium and the wood wide web'));
check('and persists as a setting', app.settings.get('search.includeFeeds'), true);

await tap('Mycelium and the wood wide web');
await wait();
check('the item view says when its page was fetched', painted().includes('Fetched'));
check('and which feed it came from', painted().includes('Newsonaut'));

push('/settings');
await wait();
await wait();
check('settings carries the search switch', all_text().some((t) => t.includes('Include feeds when you search')));

console.log('screenshot:', screenshot(join(tmpdir(), 'substrate-smoke.png')));

app.close();
finish('smoke');
