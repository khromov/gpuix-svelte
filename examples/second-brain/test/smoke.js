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
import { TestGpuixRenderer } from '@gpuix/native';
import { mount, flushSync } from 'svelte';
import renderer, { set_native, create_root, commit, dispatch } from '../../../src/renderer.js';
import { create_app } from '../lib/app.js';
import { MlStub } from '../lib/ml-stub.js';
import { route } from '../lib/router.svelte.js';
import { ui } from '../lib/ui.svelte.js';

let failures = 0;
function check(label, actual, expected = true) {
	const ok = actual === expected;
	if (!ok) failures++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       want ${JSON.stringify(expected)}\n       got  ${JSON.stringify(actual)}`}`);
}

const app = await create_app({ data_dir: mkdtempSync(join(tmpdir(), 'substrate-smoke-')), ml: new MlStub(), seed: true });
await app.ingest.idle();

const native = new TestGpuixRenderer(1100, 538);
set_native(native);
const root = create_root();
const anchor = renderer.createComment('');
renderer.insert(root, anchor, null);

const App = (await import('../App.svelte')).default;
mount(App, { renderer, target: root, anchor, props: { app } });

async function settle(ms = 30) {
	await new Promise((r) => setTimeout(r, ms));
	flushSync();
	commit();
	native.flush();
}
const painted = () => native.getPaintedText().join('\n');
const tree = () => JSON.parse(native.getTreeJson());

function find_all(pred) {
	const hits = [];
	(function walk(n) {
		if (!n) return;
		if (pred(n)) hits.push(n);
		for (const c of n.children ?? []) walk(c);
	})(tree());
	return hits;
}
const find = (pred) => find_all(pred)[0] ?? null;
const find_text = (content, { last = false } = {}) => {
	const all = find_all((n) => n.type === 'text' && n.text === content);
	return last ? all.at(-1) ?? null : all[0] ?? null;
};

// A decorative label passes the click through to its button, which is the point.
async function click_text(content, opts) {
	const node = find_text(content, opts);
	if (!node) throw new Error(`no text "${content}" in the tree`);
	const [x, y, w, h] = native.getElementBounds(node.id);
	native.simulateClick(x + w / 2, y + h / 2);
	for (const e of native.drainEvents()) dispatch(e);
	await settle();
}

await settle();
await settle();
check('brand painted', painted().includes('Substrate'));
check('seeded note painted', painted().includes('Compost notes'));
check('sidebar counts painted', painted().includes('Everything'));

const textarea = find((n) => n.type === 'textarea');
check('capture textarea exists', textarea != null);
dispatch({ elementId: textarea.id, eventType: 'change', value: 'Buy compost for the raised beds' });
await settle();
await click_text('Save');
await app.ingest.idle();
await settle();
check('new note appears in the timeline', painted().includes('Buy compost for the raised beds'));
const note = app.store.list_items({ limit: 1 })[0];
check('new note is in the store', note.body, 'Buy compost for the raised beds');

await click_text('Buy compost for the raised beds');
await settle();
await settle();
check('card click opens the item route', route.path, `/item/${note.id}`);
check('item page paints the body', painted().includes('Buy compost for the raised beds'));
check('window title follows the route', ui.title, 'Item');

// The tree's root is the renderer's container; the app's root is its first element.
const root_node = tree().children.find((n) => n.type === 'div');
dispatch({ elementId: root_node.id, eventType: 'keyDown', key: 'escape', modifiers: { cmd: false, shift: false, ctrl: false, alt: false } });
await settle();
check('escape goes back', route.path, '/');

await click_text('Buy compost for the raised beds');
await settle();
await settle();
await click_text('Substrate');
await settle();
check('brand click goes home', route.path, '/');

// Typing `k` into the search box offers `kind:`; picking a kind completes and searches.
const search_input = find((n) => n.type === 'input');
native.focusElement(search_input.id);
native.flush();
for (const e of native.drainEvents()) dispatch(e);
dispatch({ elementId: search_input.id, eventType: 'focus' });
dispatch({ elementId: search_input.id, eventType: 'change', value: 'k' });
await settle();
check('typing k suggests kind:', ui.suggest?.items.map((i) => i.label).join(','), 'kind:');
check('suggestion painted', painted().includes('filter by kind — note, link, image or audio'));
await click_text('kind:');
await settle();
check('picking kind: suggests the kinds', ui.suggest?.items.map((i) => i.label).join(','), 'kind:note,kind:link,kind:image,kind:audio');
await click_text('kind:image');
await settle(250);
await settle();
check('completion searches by kind', route.path === '/search' && route.query.q, 'kind:image');
check('kind listing paints the image', painted().includes('Tic-tac-toe icon'));
dispatch({ elementId: search_input.id, eventType: 'keyDown', key: 'escape', modifiers: {} });
await settle();
check('escape clears the search box', route.path, '/search');
dispatch({ elementId: root_node.id, eventType: 'keyDown', key: 'escape', modifiers: {} });
await settle();
await settle();
check('escape from the root leaves search', route.path, '/');

await click_text('Buy compost for the raised beds');
await settle();
await settle();
await click_text('Delete');
check('confirm dialog opens', ui.modal != null);
check('dialog painted on top', painted().includes('Delete this item?'));
// The toolbar's Delete is under the scrim now; the dialog's is the last one in the tree.
await click_text('Delete', { last: true });
await settle();
check('confirm deletes the item', app.get_item(note.id), null);
check('delete navigates back', route.path, '/');
await settle();
check('deleted note gone from the timeline', painted().includes('Buy compost for the raised beds'), false);

const shot = join(tmpdir(), 'substrate-smoke.png');
native.captureScreenshot(shot);
console.log('screenshot:', shot);

app.close();
if (failures > 0) {
	console.error(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log('\nsmoke ok');
process.exit(0);
