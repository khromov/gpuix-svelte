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

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dispatch } from 'gpuix-svelte';
import {
	mount_headless,
	wait,
	focus,
	unfocus,
	find,
	find_test_id,
	click_text,
	click_test_id,
	press,
	painted,
	screenshot,
	check,
	finish
} from 'gpuix-svelte/test';
import { create_app } from '../lib/app.js';
import { MlStub } from '../lib/ml-stub.js';
import { route } from '../lib/router.svelte.js';
import { DARK, LIGHT } from '../lib/theme.js';
import { set_mode } from '../lib/theme.svelte.js';
import { ui } from '../lib/ui.svelte.js';

const app = await create_app({ data_dir: mkdtempSync(join(tmpdir(), 'substrate-smoke-')), ml: new MlStub(), seed: true });
await app.ingest.idle();

const App = (await import('../App.svelte')).default;
// 538 is the headless height cap; anything laid out below it cannot be hit.
const { native } = mount_headless(App, { props: { app }, width: 1100, height: 538 });

/** A click, then the timers and dynamic imports a route change runs through. */
async function tap(text, opts) {
	click_text(text, opts);
	await wait();
}

await wait();
await wait();
check('brand painted', painted().includes('Substrate'));
check('seeded note painted', painted().includes('Compost notes'));
check('sidebar counts painted', painted().includes('Everything'));

// The palette reaches every <style> through set_css_vars, so a mode switch is one restyle.
const root_bg = () => find_test_id('root').style.backgroundColor;
check('dark palette applied through css vars', root_bg(), DARK.bg);
set_mode('light');
await wait();
check('switching the mode restyles', root_bg(), LIGHT.bg);
set_mode('dark');
await wait();

const textarea = find((n) => n.type === 'textarea');
check('capture textarea exists', textarea != null);
dispatch({ elementId: textarea.id, eventType: 'change', value: 'Buy compost for the raised beds' });
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

// Typing `k` into the search box offers `kind:`; picking a kind completes and searches.
const search_input = find((n) => n.type === 'input');
focus(search_input);
dispatch({ elementId: search_input.id, eventType: 'change', value: 'k' });
await wait();
check('typing k suggests kind:', ui.suggest?.items.map((i) => i.label).join(','), 'kind:');
check('suggestion painted', painted().includes('filter by kind — note, link, image or audio'));
await tap('kind:');
check('picking kind: suggests the kinds', ui.suggest?.items.map((i) => i.label).join(','), 'kind:note,kind:link,kind:image,kind:audio');
await tap('kind:image');
await wait(250);
check('completion searches by kind', route.path === '/search' && route.query.q, 'kind:image');
check('kind listing paints the image', painted().includes('Tic-tac-toe icon'));
// Escape in the box clears it; the window handler sees `editing` and leaves the route
// alone. blur() is a no-op headlessly, so unfocus() stands in for the box letting go.
focus(search_input);
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
check('deleted note gone from the timeline', painted().includes('Buy compost for the raised beds'), false);

console.log('screenshot:', screenshot(join(tmpdir(), 'substrate-smoke.png')));

app.close();
finish('smoke');
