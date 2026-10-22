// Retakes an og:image: serves a static directory, opens one of its pages in headless Chrome over
// the DevTools protocol at 1200x630 and device scale 2, and writes the capture downscaled to
// 1200x630. Needs Chrome (or $CHROME pointing at a Chromium) and nothing else.
//
//   node scripts/og.ts                     # homepage/index.html#og → homepage/og.png
//   node scripts/og.ts --root dist/docs --path overview.html --out docs/assets/og-docs.png
//
// --wait is the settle time in ms after load and fonts (default 800). The page's #og fragment
// hides the navigation, buttons and OS switcher through :root:has(#og:target) rules.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, extname, join, normalize, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values: o } = parseArgs({
	options: {
		root: { type: 'string', default: 'homepage' },
		path: { type: 'string', default: '/#og' },
		out: { type: 'string', default: 'homepage/og.png' },
		wait: { type: 'string', default: '800' }
	}
});

const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;
const TIMEOUT = 60_000;
const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain; charset=utf-8'
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

function serve(root: string): Promise<{ server: Server; origin: string }> {
	const server = createServer((req, res) => {
		let file = normalize(join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
		if (!file.startsWith(root)) return void res.writeHead(403).end();
		if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
		if (!existsSync(file)) return void res.writeHead(404).end('not found');
		res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(readFileSync(file));
	});
	return new Promise((done) =>
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			const port = typeof address === 'object' && address ? address.port : 0;
			done({ server, origin: `http://127.0.0.1:${port}` });
		})
	);
}

function launch(chrome: string, profile: string): { child: ChildProcess; port: Promise<string> } {
	const child = spawn(
		chrome,
		['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', 'about:blank'],
		{ stdio: ['ignore', 'ignore', 'pipe'] }
	);
	const port = new Promise<string>((done, fail) => {
		let log = '';
		child.stderr?.on('data', (chunk: Buffer) => {
			log += chunk;
			const m = log.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
			if (m) done(m[1]);
		});
		child.on('exit', (code) => fail(new Error(`Chrome exited (${code}): ${log.slice(-400)}`)));
	});
	return { child, port };
}

type Message = { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { message: string } };

async function connect(port: string) {
	const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
	const page = targets.find((t) => t.type === 'page');
	if (!page) throw new Error('Chrome opened no page target');
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((open, fail) => {
		ws.onopen = open;
		ws.onerror = fail;
	});
	let seq = 0;
	const pending = new Map<number, { done: (r: Record<string, unknown>) => void; fail: (e: Error) => void }>();
	const events: ((m: Message) => void)[] = [];
	ws.onmessage = (ev) => {
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
	const send = (method: string, params: Record<string, unknown> = {}) =>
		new Promise<Record<string, unknown>>((done, fail) => {
			const id = ++seq;
			pending.set(id, { done, fail });
			ws.send(JSON.stringify({ id, method, params }));
		});
	return { ws, send, events };
}

const root = resolve(o.root);
const out = resolve(o.out);
const profile = mkdtempSync(join(tmpdir(), 'gpuix-og-'));
const chrome = find_chrome();
const { server, origin } = await serve(root);
const { child, port } = launch(chrome, profile);
const problems: string[] = [];

const cleanup = () => {
	child.kill('SIGKILL');
	server.close();
	rmSync(profile, { recursive: true, force: true });
};
setTimeout(() => {
	console.error(`[og] timed out after ${TIMEOUT / 1000} s`);
	cleanup();
	process.exit(1);
}, TIMEOUT).unref();

try {
	const { ws, send, events } = await connect(await port);
	events.push((m) => {
		if (m.method === 'Runtime.exceptionThrown') {
			const details = m.params?.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
			problems.push(`exception: ${details?.exception?.description ?? details?.text}`);
		}
		if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
			const args = m.params.args as { value?: unknown; description?: string }[];
			problems.push(`console.error: ${args.map((a) => a.value ?? a.description).join(' ')}`);
		}
	});
	await send('Page.enable');
	await send('Runtime.enable');
	await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false });
	await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

	const loaded = new Promise<void>((done) => events.push((m) => m.method === 'Page.loadEventFired' && done()));
	await send('Page.navigate', { url: `${origin}/${o.path.replace(/^\//, '')}` });
	await Promise.race([loaded, sleep(20_000)]);
	await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
	await sleep(Number(o.wait));

	// The clip's scale halves the device-scale-2 raster, so text and edges are supersampled.
	const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 / SCALE } });
	writeFileSync(out, Buffer.from(String(data), 'base64'));
	ws.close();
} finally {
	cleanup();
}

for (const problem of problems) console.error(`[og] ${problem}`);
console.log(`[og] ${o.root}/${o.path.replace(/^\//, '')} → ${o.out} (${WIDTH}x${HEIGHT})`);
process.exit(problems.length ? 1 : 0);
