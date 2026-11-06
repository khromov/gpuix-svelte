// Retakes every screenshot the homepage, the README and the docs carry, so a restyled example
// shows up everywhere at once: the window captures through gpuix-svelte/automation (a real window
// per example, driven to the state each image documents), the web capture and the README image
// (four of those captures with CSS window chrome on a dark background) through headless Chrome
// over the DevTools protocol, and the two og images through scripts/og.ts. Runs through the bin
// (`npm run shots`), since the automation module needs the custom-renderer conditions; needs
// macOS or Windows for the windows, Bun for the web build and Chrome (or $CHROME) for the rest.
// glass.png and app-icon.png are not retaken: the first needs a desktop behind it. The hero's
// wallpapers are plain and stay as they are.
//
//   npm run shots                       # everything, in dependency order
//   npm run shots -- --only hn,demos    # a subset: counter, tictactoe, styling, hn, desktop,
//                                       # tutorial, starter, web, demos, og, og-docs

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { launch, type App, type Locator, type TreeNode } from 'gpuix-svelte/automation';

const root = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = join(root, 'homepage/assets/shots');
const README_IMAGE = join(root, '.github/resources/demos.png');
const WORK = join(root, 'dist/shots');
const SETTLE = 600;
const WATCHDOG = 15 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (line: string) => console.log(`[shots] ${line}`);

// ---------------------------------------------------------------- windows

interface WindowShot {
	entry: string;
	out: string;
	env?: Record<string, string>;
	ready: (app: App) => Promise<unknown>;
}

const apps = new Set<App & { process: ChildProcess }>();

async function wait_for(label: string, condition: () => Promise<boolean>, timeout = 30_000) {
	const until = Date.now() + timeout;
	while (!(await condition())) {
		if (Date.now() > until) throw new Error(`timed out waiting for ${label}`);
		await sleep(250);
	}
}

const present = (locator: Locator, label: string) => wait_for(label, async () => (await locator.count()) > 0);
const painted = (app: App) => wait_for('the first paint', async () => (await app.call('getPaintedText', {})).text.length > 0);

const center = ({ bounds }: TreeNode) => ({ x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 });

// The cells carry no text or test id, so they are the nine 80×80 boxes of the painted tree.
async function play_x_to_a_win(app: App) {
	await painted(app);
	const { tree } = await app.call('getTree', {});
	const cells: TreeNode[] = [];
	const walk = (node: TreeNode) => {
		if (Math.round(node.bounds?.width ?? 0) === 80 && Math.round(node.bounds?.height ?? 0) === 80) cells.push(node);
		node.children?.forEach(walk);
	};
	if (tree) walk(tree);
	if (cells.length !== 9) throw new Error(`tic-tac-toe: ${cells.length} cells of 80×80 in the tree, not 9`);
	cells.sort((a, b) => a.bounds!.y - b.bounds!.y || a.bounds!.x - b.bounds!.x);
	for (const i of [0, 3, 1, 4, 2]) await app.mouse.click(center(cells[i]));
	await present(app.getByText('X wins!'), 'X to win');
	await present(app.getByText('X: 1'), 'the score');
}

// starter/ has its own package.json, so from there `gpuix-svelte` does not self-reference; a copy under dist/ does.
function starter_entry() {
	const dir = join(WORK, 'starter');
	mkdirSync(dir, { recursive: true });
	for (const file of ['app.ts', 'App.svelte']) copyFileSync(join(root, 'starter', file), join(dir, file));
	return 'dist/shots/starter/app.ts';
}

const WINDOWS: Record<string, WindowShot> = {
	counter: {
		entry: 'examples/counter/main.ts',
		out: join(SHOTS, 'counter.png'),
		async ready(app) {
			for (let i = 0; i < 3; i++) await app.getByTestId('plus').click();
			await present(app.getByText('3 clicks'), 'the third click');
		}
	},
	tictactoe: { entry: 'examples/tic-tac-toe/main.ts', out: join(SHOTS, 'tictactoe.png'), ready: play_x_to_a_win },
	styling: { entry: 'examples/styling-playground/main.ts', out: join(SHOTS, 'styling.png'), ready: painted },
	hn: {
		entry: 'examples/hacker-news/main.ts',
		out: join(SHOTS, 'hn.png'),
		ready: (app) => present(app.getByText('comments'), 'the stories')
	},
	desktop: { entry: 'examples/desktop-apis/main.ts', out: join(SHOTS, 'desktop.png'), ready: painted },
	tutorial: { entry: 'examples/tutorial/main.ts', out: join(SHOTS, 'tutorial-3.png'), env: { GPUIX_TUTORIAL_STEP: '3' }, ready: painted },
	starter: {
		get entry() {
			return starter_entry();
		},
		out: join(SHOTS, 'hot-before.png'),
		async ready(app) {
			for (let i = 0; i < 2; i++) await app.getByTestId('plus').click();
			await present(app.getByTestId('count').getByText('2'), 'the second click');
		}
	}
};

async function capture_window(name: string, { entry, out, env, ready }: WindowShot) {
	const app = await launch({ entry, cwd: root, env });
	apps.add(app);
	try {
		await ready(app);
		await sleep(SETTLE);
		// The last click leaves the pointer over its button, whose native :hover is restyled only by a
		// move that follows a read after the move that left it; moves alone leave it hovered.
		await app.mouse.move({ x: 2, y: 2 });
		await painted(app);
		await app.mouse.move({ x: 3, y: 3 });
		await sleep(SETTLE);
		await app.screenshot({ path: out });
		log(`${name} → ${out} (${png_size(out).join('×')})`);
	} finally {
		await app.close();
		apps.delete(app);
	}
}

function png_size(path: string): [number, number] {
	const png = readFileSync(path);
	return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

// ---------------------------------------------------------------- chrome

type Message = { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message: string } };
interface Page {
	send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
	evaluate<T>(expression: string): Promise<T>;
	events: ((m: Message) => void)[];
	errors: string[];
}

const browsers = new Set<{ child: ChildProcess; profile: string }>();

// Chrome's helpers can still hold the profile after the kill; a leftover temp directory is not worth failing a step whose PNG is written.
function remove_profile(profile: string) {
	try {
		rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
	} catch (error) {
		console.warn(`[shots] could not remove ${profile}: ${(error as Error).message}`);
	}
}

function find_chrome(): string {
	const candidates = [
		process.env.CHROME,
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/Applications/Chromium.app/Contents/MacOS/Chromium',
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
		...['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].flatMap((name) =>
			(process.env.PATH ?? '').split(delimiter).map((dir) => join(dir, name))
		)
	];
	const found = candidates.find((p) => p && existsSync(p));
	if (!found) throw new Error('no Chrome found; set CHROME to a Chrome or Chromium executable');
	return found;
}

async function with_page<T>(
	{ width, height, scale, flags = [] }: { width: number; height: number; scale: number; flags?: string[] },
	fn: (page: Page) => Promise<T>
): Promise<T> {
	const profile = mkdtempSync(join(tmpdir(), 'gpuix-shots-'));
	const child = spawn(
		find_chrome(),
		['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', ...flags, 'about:blank'],
		{ stdio: ['ignore', 'ignore', 'pipe'] }
	);
	const browser = { child, profile };
	browsers.add(browser);
	let ws: WebSocket | undefined;
	try {
		const port = await new Promise<string>((done, fail) => {
			let text = '';
			child.stderr?.on('data', (chunk: Buffer) => {
				text += chunk;
				const m = text.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
				if (m) done(m[1]);
			});
			child.on('exit', (code) => fail(new Error(`Chrome exited (${code}): ${text.slice(-400)}`)));
		});
		const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
		const target = targets.find((t) => t.type === 'page');
		if (!target) throw new Error('Chrome opened no page target');
		const socket = (ws = new WebSocket(target.webSocketDebuggerUrl));
		await new Promise((open, fail) => {
			socket.onopen = open;
			socket.onerror = fail;
		});
		let seq = 0;
		const pending = new Map<number, { done: (r: Record<string, unknown>) => void; fail: (e: Error) => void }>();
		const events: Page['events'] = [];
		const errors: string[] = [];
		socket.onmessage = (ev) => {
			const m = JSON.parse(String(ev.data)) as Message;
			const call = m.id === undefined ? undefined : pending.get(m.id);
			if (m.id !== undefined && call) {
				pending.delete(m.id);
				if (m.error) call.fail(new Error(m.error.message));
				else call.done(m.result ?? {});
			} else if (m.method) {
				for (const on of events) on(m);
			}
		};
		const send: Page['send'] = (method, params = {}) =>
			new Promise((done, fail) => {
				const id = ++seq;
				pending.set(id, { done, fail });
				socket.send(JSON.stringify({ id, method, params }));
			});
		const evaluate = async <T>(expression: string) => {
			const { result, exceptionDetails } = (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
				result: { value: T };
				exceptionDetails?: { text: string };
			};
			if (exceptionDetails) throw new Error(`in the page: ${exceptionDetails.text}`);
			return result.value;
		};
		events.push((m) => {
			if (m.method === 'Runtime.exceptionThrown') {
				const details = m.params?.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
				errors.push(`exception: ${details?.exception?.description ?? details?.text}`);
			}
			if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
				const args = m.params.args as { value?: unknown; description?: string }[];
				errors.push(`console.error: ${args.map((a) => a.value ?? a.description).join(' ')}`);
			}
		});
		await send('Page.enable');
		await send('Runtime.enable');
		await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
		return await fn({ send, evaluate, events, errors });
	} finally {
		ws?.close();
		child.kill('SIGKILL');
		browsers.delete(browser);
		// Chrome's helper processes outlive the kill by a moment and still write to the profile.
		if (child.exitCode === null && child.signalCode === null) await new Promise((exited) => child.once('exit', exited));
		remove_profile(profile);
	}
}

async function open(page: Page, url: string) {
	const loaded = new Promise<void>((done) => page.events.push((m) => m.method === 'Page.loadEventFired' && done()));
	await page.send('Page.navigate', { url });
	await Promise.race([loaded, sleep(20_000)]);
	await page.evaluate('document.fonts.ready.then(() => true)');
	await page.evaluate('Promise.all([...document.images].map((i) => i.decode().catch(() => {}))).then(() => true)');
}

async function shoot(page: Page, params: Record<string, unknown>): Promise<Buffer> {
	const { data } = await page.send('Page.captureScreenshot', params);
	return Buffer.from(String(data), 'base64');
}

function report(page: Page, name: string) {
	for (const error of page.errors) console.error(`[shots] ${name}: ${error}`);
}

// ---------------------------------------------------------------- the README image

interface Placed {
	shot: string;
	title: string;
	left: number;
	top: number;
	zoom: number;
}

const SHOT_TITLES: Record<string, string> = {
	counter: 'GPUIX + Svelte',
	tictactoe: 'GPUIX + Svelte — Tic-tac-toe',
	hn: 'GPUIX + Svelte — Hacker News'
};
// The logical window widths the examples' main.ts files ask for; the captures are 2× of these.
const WIDTHS: Record<string, number> = { counter: 820, tictactoe: 480, hn: 760 };

const CHROME_CSS = `
.at{position:absolute}
.win{position:relative;overflow:hidden;border-radius:10px;background:#000;box-shadow:0 0 0 .5px rgba(0,0,0,.6),0 24px 60px rgba(0,0,0,.55)}
.win img{display:block;width:100%}
.bar{position:relative;display:flex;align-items:center;justify-content:center;height:28px;padding:0 72px;background:#2a2a2a;box-shadow:inset 0 -1px rgba(0,0,0,.55);white-space:nowrap;font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:rgba(255,255,255,.85)}
.lights{position:absolute;left:8px;top:8px;display:flex;gap:8px}
.lights i{width:12px;height:12px;border-radius:50%;background:#ff5f57;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.22)}
.lights i:nth-child(2){background:#febc2e}
.lights i:nth-child(3){background:#28c840}
.glass{border-radius:19px;background:transparent}
`;

function window_html({ shot, title, left, top, zoom }: Placed) {
	const src = pathToFileURL(join(SHOTS, `${shot}.png`)).href;
	// zoom on the positioned element itself would scale left/top with it, hence the wrapper.
	return `<div class="at" style="left:${left}px;top:${top}px"><div class="win" style="width:${WIDTHS[shot]}px;zoom:${zoom}"><div class="bar"><span class="lights"><i></i><i></i><i></i></span>${title}</div><img src="${src}" alt=""></div></div>`;
}

// The README image: 3598×2592, which is 1799×1296 at 2×, the four windows of the old desktop
// screenshot on a dark gradient. The control center keeps its own capture (glass.png), bar and all.
async function capture_demos() {
	mkdirSync(WORK, { recursive: true });
	const glass = pathToFileURL(join(SHOTS, 'glass.png')).href;
	const file = join(WORK, 'demos.html');
	const windows = [
		window_html({ shot: 'hn', title: SHOT_TITLES.hn, left: 48, top: 48, zoom: 0.9 }),
		window_html({ shot: 'tictactoe', title: SHOT_TITLES.tictactoe, left: 800, top: 48, zoom: 0.9 }),
		`<div class="at" style="left:1382px;top:48px"><div class="win glass" style="width:370px"><img src="${glass}" alt=""></div></div>`,
		// Below the glass panel with clear air between them, and a little smaller so it stays inside the canvas.
		window_html({ shot: 'counter', title: SHOT_TITLES.counter, left: 940, top: 790, zoom: 0.84 })
	];
	writeFileSync(
		file,
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
html,body{margin:0;width:1799px;height:1296px;overflow:hidden;background:#000}
body{position:relative;background:radial-gradient(90% 80% at 50% 35%,#17171c,#0a0a0c 65%,#050506)}
${CHROME_CSS}</style></head><body>${windows.join('')}</body></html>`
	);
	await with_page({ width: 1799, height: 1296, scale: 2 }, async (page) => {
		await open(page, pathToFileURL(file).href);
		await sleep(300);
		const png = await shoot(page, { format: 'png', clip: { x: 0, y: 0, width: 1799, height: 1296, scale: 1 } });
		writeFileSync(README_IMAGE, png);
		log(`demos → ${README_IMAGE} (${png_size(README_IMAGE).join('×')}, ${Math.round(png.length / 1024)} KB)`);
		report(page, 'demos');
	});
}

// ---------------------------------------------------------------- the web build

const servers = new Set<Server>();

// What scripts/web.ts serves, without Bun: the isolation headers the shared-memory wasm needs.
function serve_web(): Promise<string> {
	const out = join(root, 'dist/web');
	const page = join(root, 'examples/tic-tac-toe/index.html');
	const types: Record<string, string> = { '.wasm': 'application/wasm', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
	const server = createServer((req, res) => {
		const pathname = new URL(req.url ?? '/', 'http://x').pathname;
		const file = pathname === '/' ? page : join(out, pathname.slice(1));
		if ((!file.startsWith(out) && file !== page) || !existsSync(file)) return void res.writeHead(404).end('not found');
		const type = Object.entries(types).find(([ext]) => file.endsWith(ext))?.[1] ?? 'application/octet-stream';
		res.writeHead(200, { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Content-Type': type });
		res.end(readFileSync(file));
	});
	servers.add(server);
	return new Promise((done) =>
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			done(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`);
		})
	);
}

async function capture_web() {
	run('bun', [join(root, 'scripts/web.ts'), '--build-only']);
	const origin = await serve_web();
	const out = join(SHOTS, 'web-tictactoe.png');
	try {
		// SwiftShader gives headless Chrome a GPU; GPUI's wasm never goes idle, so the wait is a fixed one.
		await with_page({ width: 480, height: 640, scale: 1, flags: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] }, async (page) => {
			await open(page, origin);
			await wait_for('the GPUI canvas', () => page.evaluate<boolean>('document.querySelector("canvas") !== null'), 60_000);
			await sleep(3000);
			const png = await shoot(page, { format: 'png' });
			writeFileSync(out, png);
			log(`web → ${out} (${png_size(out).join('×')})`);
			report(page, 'web');
		});
	} finally {
		server_close();
	}
}

function server_close() {
	for (const server of servers) server.close();
	servers.clear();
}

function run(command: string, args: string[]) {
	log(`${command} ${args.map((a) => a.replace(root, '')).join(' ')}`);
	// bun is a .cmd shim on Windows, which only a shell can run; process.execPath is a real path. A shell
	// splits on spaces, so a path with one is quoted for it, as the bin does.
	const shell = process.platform === 'win32' && command !== process.execPath;
	const argv = shell ? args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : args;
	const { status } = spawnSync(command, argv, { cwd: root, stdio: 'inherit', shell });
	if (status !== 0) throw new Error(`${command} ${args[0]} failed (${status})`);
}

// ---------------------------------------------------------------- steps

const STEPS: Record<string, () => Promise<void>> = {
	...Object.fromEntries(Object.entries(WINDOWS).map(([name, shot]) => [name, () => capture_window(name, shot)])),
	web: capture_web,
	demos: capture_demos,
	og: async () => run(process.execPath, [join(root, 'scripts/og.ts')]),
	'og-docs': async () => {
		run(process.execPath, [join(root, 'scripts/docs.ts')]);
		run(process.execPath, [join(root, 'scripts/og.ts'), '--root', 'dist/docs', '--path', 'overview.html', '--out', 'docs/assets/og-docs.png']);
	}
};

const { values: o } = parseArgs({ options: { only: { type: 'string' } } });
const only = o.only?.split(',').map((s) => s.trim()).filter(Boolean);
const unknown = only?.filter((name) => !(name in STEPS)) ?? [];
if (unknown.length) {
	console.error(`[shots] unknown: ${unknown.join(', ')} — the steps are ${Object.keys(STEPS).join(', ')}`);
	process.exit(2);
}
const steps = Object.keys(STEPS).filter((name) => !only || only.includes(name));

function cleanup() {
	for (const app of apps) app.process.kill();
	for (const { child, profile } of browsers) {
		child.kill('SIGKILL');
		remove_profile(profile);
	}
	server_close();
	rmSync(WORK, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		cleanup();
		process.exit(1);
	});
}
setTimeout(() => {
	console.error(`[shots] timed out after ${WATCHDOG / 60_000} min`);
	process.exit(1);
}, WATCHDOG).unref();

let failed = false;
for (const name of steps) {
	try {
		await STEPS[name]();
	} catch (error) {
		failed = true;
		console.error(`[shots] ${name} failed: ${(error as Error).message}`);
	}
}
process.exit(failed ? 1 : 0);
