/**
 * Draw-time stats for Substrate's routes, from GPUI's own debug frame overlay: boots the
 * app against a copy of the data (the real brain is never written), visits each route,
 * and prints how long a frame takes at idle and while wheel events scroll the content
 * column. Scroll lag here is native per-frame layout, so this is the number to read
 * before looking at any JS.
 *
 *   npm run brain:frames -- [--keep] [route ...]     default: / /settings and the longest item
 *
 * `--keep` leaves the window open with the overlay on, for scrolling by hand.
 */

if (!process.versions.bun) {
	console.error('[frames] needs Bun — `npm run brain:frames`');
	process.exit(1);
}

process.env.GPUIX_BRAIN_OFFLINE = '1';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const wanted = args.filter((a) => !a.startsWith('--'));

const { Database } = await import('bun:sqlite');
const { render, get_native } = await import('gpuix-svelte');
const { create_app } = await import('../lib/app.ts');
const { MlStub } = await import('../lib/ml-stub.ts');
const { default_root } = await import('../lib/paths.ts');
const { push } = await import('../lib/router.svelte.ts');
const { WINDOW } = await import('../lib/window.ts');
const App = (await import('../App.svelte')).default;

const source = process.env.GPUIX_BRAIN_DIR || default_root();
const data_dir = mkdtempSync(join(tmpdir(), 'substrate-frames-'));
const copy = join(data_dir, 'substrate.sqlite');
// VACUUM INTO reads through the WAL, so the copy is consistent even while the app is open.
new Database(join(source, 'substrate.sqlite'), { readonly: true }).run('VACUUM INTO ?', [copy]);
const longest = new Database(copy, { readonly: true }).query<{ id: number }, []>('SELECT id FROM items ORDER BY length(body) DESC LIMIT 1').get();
const routes = wanted.length ? wanted : ['/', '/settings', ...(longest ? [`/item/${longest.id}`] : [])];
console.log(`[frames] ${source} copied to ${data_dir}`);

const app = await create_app({ data_dir, ml: new MlStub(), autoload: false });
render(App, { ...WINDOW, props: { app } });
const native = get_native()!;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

await sleep(1500);
const { width, height } = native.getWindowSize();
native.setDebugFrameOverlay('full');

const IDLE_MS = 2000;
const WHEEL_EVENTS = 90;
const rows: string[][] = [['route', 'idle frames', 'idle max', 'scroll p90', 'p99', 'max', 'fps']];
for (const path of routes) {
	push(path);
	// A lazy route import, then the related-items query on an item page.
	await sleep(1200);
	native.resetDebugFrameOverlayStats();
	await sleep(IDLE_MS);
	const idle = native.getDebugFrameOverlayStats();

	native.resetDebugFrameOverlayStats();
	const started = performance.now();
	for (let i = 0; i < WHEEL_EVENTS; i++) {
		// The content column sits right of the sidebar.
		native.simulateScrollWheel(width * 0.62, height * 0.6, 0, -30);
		await sleep(16);
	}
	const elapsed = performance.now() - started;
	const scroll = native.getDebugFrameOverlayStats();
	const ms = (n?: number) => (n === undefined ? '-' : `${n.toFixed(1)} ms`);
	rows.push([path, `${idle.frames}/${IDLE_MS / 1000}s`, ms(idle.maxMs), ms(scroll.p90Ms), ms(scroll.p99Ms), ms(scroll.maxMs), ((scroll.frames * 1000) / elapsed).toFixed(0)]);
}

const widths = (rows[0] ?? []).map((_, col) => Math.max(...rows.map((row) => row[col]?.length ?? 0)));
for (const row of rows) console.log(row.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join('  '));

if (keep) {
	console.log('[frames] window left open with the overlay on; close it to exit');
} else {
	app.close();
	process.exit(0);
}
