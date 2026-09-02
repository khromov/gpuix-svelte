/**
 * The data and native layers without a window, a model or the network: pure
 * modules, the store with a stubbed worker, and the real client against a fake one.
 */

if (!process.versions.bun) {
	console.error('[brain] needs Bun — `npm run test:brain`');
	process.exit(1);
}

import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse_appearance } from '../lib/appearance.js';
import { create_app } from '../lib/app.js';
import { chunk_markdown } from '../lib/chunk.js';
import { normalize_base_url, parse_sse } from '../lib/llm.js';
import { MlClient } from '../lib/ml-client.js';
import { MlStub } from '../lib/ml-stub.js';
import { chunk_body, fts_query, match_ranges, parse_query, query_terms, rrf, snippet_around } from '../lib/rank.js';
import { init_recorder } from '../lib/recorder.js';
import { decode_entities, extract, normalize_url, pick_title } from '../lib/scrape.js';
import { VectorIndex, from_blob, to_blob } from '../lib/vectors.js';
import { decode_wav, encode_wav, wav_header } from '../lib/wav.js';

let failures = 0;
function check(label, actual, expected = true) {
	const ok = actual === expected;
	if (!ok) failures++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       want ${JSON.stringify(expected)}\n       got  ${JSON.stringify(actual)}`}`);
}

// --- wav
{
	const rate = 44100;
	const stereo = new Float32Array(rate * 2);
	for (let i = 0; i < rate; i++) stereo[i * 2] = stereo[i * 2 + 1] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate);
	const bytes = encode_wav(stereo, rate, 2);
	const h = wav_header(bytes);
	check('wav header channels', h.channels, 2);
	check('wav header rate', h.sampleRate, rate);
	const d = decode_wav(bytes);
	check('wav resampled to 16k', d.sampleRate, 16000);
	check('wav length ±2', Math.abs(d.samples.length - 16000) <= 2);
	let peak = 0;
	let crossings = 0;
	for (let i = 1; i < d.samples.length; i++) {
		peak = Math.max(peak, Math.abs(d.samples[i]));
		if (d.samples[i - 1] < 0 !== d.samples[i] < 0) crossings++;
	}
	check('wav peak survives', Math.abs(peak - 0.5) < 0.05);
	check('wav pitch survives (zero crossings ≈ 880)', Math.abs(crossings - 880) <= 6);

	// 24-bit extensible, with LIST and FLLR chunks ahead of data, as CoreAudio writes.
	const frames = 100;
	const data = new Uint8Array(frames * 2 * 3);
	const view = new DataView(data.buffer);
	for (let i = 0; i < frames; i++) {
		const l = Math.round(0.25 * 8388607);
		const r = Math.round(-0.25 * 8388607);
		view.setUint8(i * 6, l & 0xff);
		view.setUint8(i * 6 + 1, (l >> 8) & 0xff);
		view.setUint8(i * 6 + 2, (l >> 16) & 0xff);
		view.setUint8(i * 6 + 3, r & 0xff);
		view.setUint8(i * 6 + 4, (r >> 8) & 0xff);
		view.setUint8(i * 6 + 5, (r >> 16) & 0xff);
	}
	const fmt = new Uint8Array(40);
	const fv = new DataView(fmt.buffer);
	fv.setUint16(0, 0xfffe, true);
	fv.setUint16(2, 2, true);
	fv.setUint32(4, 16000, true);
	fv.setUint32(8, 16000 * 6, true);
	fv.setUint16(12, 6, true);
	fv.setUint16(14, 24, true);
	fv.setUint16(16, 22, true);
	fv.setUint16(18, 24, true);
	fv.setUint32(20, 3, true);
	fv.setUint16(24, 1, true);
	const chunk = (id, body) => {
		const out = new Uint8Array(8 + body.length + (body.length & 1));
		for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
		new DataView(out.buffer).setUint32(4, body.length, true);
		out.set(body, 8);
		return out;
	};
	const parts = [chunk('fmt ', fmt), chunk('LIST', new Uint8Array(13)), chunk('FLLR', new Uint8Array(4000)), chunk('data', data)];
	const total = parts.reduce((n, p) => n + p.length, 0);
	const file = new Uint8Array(12 + total);
	file.set([82, 73, 70, 70]);
	new DataView(file.buffer).setUint32(4, 4 + total, true);
	file.set([87, 65, 86, 69], 8);
	let at = 12;
	for (const p of parts) {
		file.set(p, at);
		at += p.length;
	}
	const ext = decode_wav(file);
	check('extensible 24-bit wav decodes', ext.samples.length, frames);
	check('stereo downmix averages channels', Math.abs(ext.samples[10]) < 1e-4);
	let threw = false;
	try {
		wav_header(new Uint8Array(10));
	} catch {
		threw = true;
	}
	check('truncated header throws', threw);
}

// --- scrape
{
	const html = `<!doctype html><html lang="en"><head><title>Fixture &amp; Friends</title>
<meta property="og:title" content="Fixture Title"><meta property="og:image" content="/img/hero.png?a=1&amp;b=2">
<meta name="description" content="A test page"><link rel="canonical" href="https://example.com/post/1/">
<script>var x = "SCRIPT TEXT";</script><style>.a{}</style></head>
<body><header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
<div class="sidebar">SIDEBAR TEXT</div>
<article><h2>Heading &#8217;quoted&#8217;</h2><p>First para with <em>emphasis</em> &amp; entity.</p>
<ul><li>one</li><li>two</li></ul><pre>code  block\n  indented</pre><p>${'filler text '.repeat(60)}</p></article>
<footer>FOOTER TEXT</footer></body></html>`;
	const page = extract(html, { baseUrl: 'https://example.com/post/1/' });
	check('og:title wins', page.title, 'Fixture Title');
	check('og:image is absolute and decoded', page.imageUrl, 'https://example.com/img/hero.png?a=1&b=2');
	check('canonical', page.canonical, 'https://example.com/post/1/');
	check('lang', page.lang, 'en');
	check('description', page.description, 'A test page');
	check('nav dropped', page.text.includes('Home'), false);
	check('script dropped', page.text.includes('SCRIPT TEXT'), false);
	check('sidebar class dropped', page.text.includes('SIDEBAR'), false);
	check('footer dropped', page.text.includes('FOOTER'), false);
	check('heading marker', page.text.includes('## Heading ’quoted’'));
	check('list marker', page.text.includes('- one'));
	check('entities decoded', page.text.includes('emphasis & entity'));
	check('code fence kept', page.text.includes('```\ncode block'));
	check('article is the candidate', page.candidates[0]?.name, 'article');
	check('text starts inside the article', page.text.startsWith('## Heading'));
	check('normalize_url strips utm and hash', normalize_url('HTTPS://Example.com/a/b/?utm_source=x&q=1#frag'), 'https://example.com/a/b?q=1');
	check('decode_entities numeric', decode_entities('&#x41;&#66;&rsquo;&bogus;'), 'AB’&bogus;');
}

// --- llm
{
	const enc = new TextEncoder();
	const stream = new ReadableStream({
		start(c) {
			c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Hel'));
			c.enqueue(enc.encode('"}}]}\r\n\r\n: keepalive\r\n\r\ndata: {"a":1}\ndata: {"b":2}\n\n'));
			c.enqueue(enc.encode('data: {"choices":[],"usage":{}}\n\ndata: [DONE]'));
			c.close();
		}
	});
	const events = [];
	for await (const e of parse_sse(stream)) events.push(e);
	check('sse events', events.join('|'), '{"choices":[{"delta":{"content":"Hel"}}]}|{"a":1}\n{"b":2}|{"choices":[],"usage":{}}|[DONE]');
	check('ollama base url', normalize_base_url('http://localhost:11434'), 'http://localhost:11434/v1');
	check('openai base url', normalize_base_url('https://api.openai.com'), 'https://api.openai.com/v1');
	check('openrouter base url kept', normalize_base_url('https://openrouter.ai/api/v1/'), 'https://openrouter.ai/api/v1');
	check('pasted endpoint trimmed', normalize_base_url('localhost:1234/v1/chat/completions'), 'http://localhost:1234/v1');
}

// --- appearance, rank, chunk, vectors
{
	check('darwin light', parse_appearance('darwin', 1, ''), 'light');
	check('darwin dark', parse_appearance('darwin', 0, 'Dark\n'), 'dark');
	check('win32 dark', parse_appearance('win32', 0, '  AppsUseLightTheme  REG_DWORD  0x0'), 'dark');

	const fused = rrf({ a: [{ id: 1 }, { id: 2 }], b: [{ id: 3 }, { id: 2 }] });
	check('rrf: twice second beats once first', fused[0].id, 2);
	check('rrf signals', fused[0].signals.join('+'), 'a+b');
	check('fts_query quotes and prefixes', fts_query('foo "bar'), '"foo" "bar"*');
	check('fts_query empty', fts_query('  '), null);
	check('chunk_body strips heading path', chunk_body('Title › Section\n\nBody here', 'Title'), 'Body here');

	check('parse_query strips kind:', JSON.stringify(parse_query('compost kind:note')), '{"text":"compost","kinds":["text"],"unknown":[]}');
	check('parse_query several kinds and aliases', parse_query('kind:links,img is:voice foo').kinds.join(','), 'link,image,audio');
	check('parse_query unknown kind reported', parse_query('kind:bogus x').unknown.join(','), 'bogus');
	check('parse_query kind only', JSON.stringify(parse_query('kind:image')), '{"text":"","kinds":["image"],"unknown":[]}');

	const terms = query_terms('Compost "worms"*');
	check('query_terms longest first, no fts syntax', terms.join(','), 'compost,worms');
	const long = `${'filler '.repeat(80)}the compost heap needs turning ${'more '.repeat(80)}`;
	const around = snippet_around(long, terms, 120);
	check('snippet windows around the first term', around.includes('compost heap') && around.startsWith('…') && around.endsWith('…'));
	check('snippet is null without a match', snippet_around('nothing here', terms), null);
	check('match_ranges finds every occurrence', JSON.stringify(match_ranges('Compost, worms, compost.', terms)), '[[0,7],[9,14],[16,23]]');

	const site = { siteName: 'Newsonaut', hostname: 'newsonaut.com' };
	check('pick_title: headline beats a site-wide <title>', pick_title({ og: '', tag: 'Newsonaut: Turning inner space into outer space', headline: 'Hang on to your Firefox!', ...site }), 'Hang on to your Firefox!');
	check('pick_title: og:title wins', pick_title({ og: 'Real title', tag: 'Real title | Newsonaut', headline: 'Something', ...site }), 'Real title');
	check('pick_title: site suffix stripped', pick_title({ og: '', tag: 'Real title | Newsonaut', headline: 'Real title', ...site }), 'Real title');
	check('pick_title: og equal to site name is ignored', pick_title({ og: 'Newsonaut', tag: 'Post about soil | Newsonaut', headline: undefined, ...site }), 'Post about soil');

	const md = `# Title\n\nIntro para. Second sentence here.\n\n## Section\n\n${'word '.repeat(1200)}\n\n\`\`\`js\nconst a = 1;\n\nconst b = 2;\n\`\`\`\n\nTail.`;
	const chunks = chunk_markdown(md);
	check('chunks respect max words', chunks.every((c) => c.words <= 500));
	check('heading path recorded', chunks[1].heading, 'Title › Section');
	check('fence never split', chunks.some((c) => c.text.includes('```js\nconst a = 1;\n\nconst b = 2;\n```')));
	check('empty body → no chunks', chunk_markdown('').length, 0);
	check('short body → one chunk', chunk_markdown('Just a line.').length, 1);

	const index = new VectorIndex(4, 1);
	const unit = (...v) => {
		const n = Math.hypot(...v);
		return Float32Array.from(v.map((x) => x / n));
	};
	index.add(1, 10, unit(1, 0, 0, 0));
	index.add(2, 10, unit(0, 1, 0, 0));
	index.add(3, 20, unit(1, 1, 0, 0));
	check('index grows', index.size, 3);
	check('top_k order', index.top_k(unit(1, 0, 0, 0), 2).map((h) => h.id).join(','), '1,3');
	check('exclude_group', index.top_k(unit(1, 0, 0, 0), 3, { exclude_group: 10 }).map((h) => h.id).join(','), '3');
	index.remove([1]);
	check('swap-remove keeps others', index.top_k(unit(0, 1, 0, 0), 1)[0].id, 2);
	const blob = to_blob(unit(3, 4, 0, 0));
	const shifted = new Uint8Array(blob.length + 1);
	shifted.set(blob, 1);
	check('from_blob copes with misalignment', from_blob(shifted.subarray(1), 4)[0].toFixed(2), '0.60');
}

// --- store + ingest with the stub
const icon = fileURLToPath(new URL('../../tic-tac-toe/icon.png', import.meta.url));
const PAGE = `<html lang="en"><head><title>Soil page</title><meta property="og:title" content="All about loam"><meta property="og:image" content="/hero.png"></head><body><nav>NAV</nav><article><h1>Loam</h1><p>Loam is soil composed of sand, silt and clay. Gardeners love it because it drains well but holds water.</p></article></body></html>`;
const fixture_fetch = async (url) => {
	if (url.endsWith('/hero.png')) return new Response(await Bun.file(icon).bytes(), { headers: { 'content-type': 'image/png' } });
	if (url.includes('fail')) return new Response('nope', { status: 500 });
	return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
const dir = mkdtempSync(join(tmpdir(), 'substrate-test-'));
{
	const ml = new MlStub();
	const app = await create_app({ data_dir: dir, ml, fetch: fixture_fetch });
	const note = app.add_note({ body: 'Turn the compost every two weeks. Worms like coffee grounds.' });
	check('note gets a derived title', note.title, 'Turn the compost every two weeks.');
	const { item: link, existed } = await app.add_link('https://example.com/soil?utm_source=x');
	check('link is new', existed, false);
	check('link dedupes by normalized url', (await app.add_link('https://example.com/soil')).existed, true);
	const image = await app.add_image(icon);
	check('image has dimensions', image.width, 1024);
	check('image has a thumbnail', existsSync(image.thumb_path));
	const wav = join(dir, 'memo.wav');
	await Bun.write(wav, encode_wav(Float32Array.from({ length: 44100 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / 44100)), 44100));
	const audio = await app.add_audio(wav);
	await app.ingest.idle();

	check('note ready', app.get_item(note.id).status, 'ready');
	check('link scraped title', app.get_item(link.id).title, 'All about loam');
	check('link body from article', app.get_item(link.id).body.includes('drains well'));
	check('link thumb fetched', existsSync(app.get_item(link.id).thumb_path ?? ''));
	check('audio converted', Math.round(app.get_item(audio.id).duration), 1);
	check('audio transcribed by stub', app.get_item(audio.id).body.startsWith('Stub transcript'));
	check('image ready', app.get_item(image.id).status, 'ready');
	check('chunk vectors indexed', app.vectors.size, 3);
	check('image vector indexed', app.images.size, 1);
	check('chunk blob is 768 floats', app.store.chunks_of(note.id).length, 1);

	const r = await app.search('compost worms');
	check('search finds the note first', r.hits[0]?.item.id, note.id);
	check('search reports both signals', r.hits[0]?.signals.sort().join('+'), 'fts+vector');
	check('nothing degraded with the stub', r.degraded.length, 0);
	check('kind filter excludes', (await app.search('compost', { kinds: ['link'] })).hits.some((h) => h.item.id === note.id), false);
	check('kind: in the query filters', (await app.search('compost kind:link')).hits.some((h) => h.item.id === note.id), false);
	check('kind: alone lists that kind', (await app.search('kind:image')).hits.map((h) => h.item.id).join(','), String(image.id));
	check('kind: outranks the option', (await app.search('compost kind:note', { kinds: ['link'] })).hits[0]?.item.id, note.id);
	check('image search by name (stub hashes the query)', (await app.search('3.png', { kinds: ['image'] })).hits[0]?.item.id, image.id);
	ml.status.clip.state = 'unloaded';
	check('an unloaded model is still asked while the worker is up', (await app.search('3.png', { kinds: ['image'] })).hits[0]?.signals.join(','), 'clip');
	ml.status.clip.state = 'ready';

	app.update_note(note.id, { body: 'Turn the compost weekly. Snails hate copper tape.' });
	await app.ingest.idle();
	check('update re-embeds', (await app.search('snails copper')).hits[0]?.item.id, note.id);
	check('vector count stable after update', app.vectors.size, 3);

	check('delete returns true', app.delete_item(note.id), true);
	check('delete drops vectors', app.vectors.size, 2);
	check('delete drops fts', (await app.search('snails')).hits.length, 0);

	const { item: bad } = await app.add_link('https://example.com/fail');
	await app.ingest.idle();
	check('http 500 marks error', app.get_item(bad.id).status, 'error');
	check('attempts counted', app.get_item(bad.id).attempts, 1);

	ml.fail_next('transcribe', { transient: false, message: 'boom' });
	const audio2 = await app.add_audio(wav);
	await app.ingest.idle();
	check('permanent failure → error', app.get_item(audio2.id).error, 'boom');
	app.retry(audio2.id);
	await app.ingest.idle();
	check('retry recovers', app.get_item(audio2.id).status, 'ready');

	app.settings.set('llm.model', 'x');
	check('settings roundtrip', app.settings.get('llm.model'), 'x');
	check('secrets masked', app.settings.all()['llm.apiKey'], '');
	app.close();
}
{
	const app = await create_app({ data_dir: dir, ml: new MlStub(), fetch: fixture_fetch });
	check('restart restores vectors', app.vectors.size, 3);
	check('restart restores image vectors', app.images.size, 1);
	check('restart keeps items', app.snapshot().counts.total, 5);
	app.close();
}

// --- MlClient against the fake worker
{
	const client = new MlClient({ worker_path: fileURLToPath(new URL('./fake-worker.js', import.meta.url)), models_dir: dir, autoload: false });
	await client.start();
	check('worker up', client.status.worker, 'up');
	await client.load('embed');
	check('status forwarded', client.status.embed.state, 'ready');
	const vecs = await client.embed_texts(['a', 'b', 'c'], { batch: 2 });
	check('batched embeddings', vecs.length, 3);
	check('typed arrays cross ipc', vecs[0] instanceof Float32Array && vecs[0].length === 768);
	const q = await client.embed_query('a');
	let dot = 0;
	for (let i = 0; i < 768; i++) dot += q[i] * vecs[0][i];
	check('same text → same vector', dot.toFixed(3), '1.000');
	let progressed = false;
	await client.transcribe('/x.wav', { on_progress: () => (progressed = true) });
	check('progress forwarded', progressed);
	const code = await client.embed_texts(['__crash__']).catch((e) => e.code);
	check('crash rejects pending', code, 'WORKER_CRASHED');
	await new Promise((r) => setTimeout(r, 1500));
	check('auto restart', client.status.worker, 'up');
	check('works after restart', (await client.embed_query('z')).length, 768);
	await client.stop();
	check('stopped', client.status.worker, 'down');
}

// --- recorder shim compiles and loads (no prompt, no recording)
if (process.platform === 'darwin' && process.env.GPUIX_BRAIN_RECORDER !== '0') {
	const rec = await init_recorder();
	check('recorder shim loads', rec.available, true);
	check('recorder idle', rec.isRecording(), false);
	check('auth status is a known value', ['notDetermined', 'authorized', 'denied', 'restricted'].includes(rec.authStatus()));
}

if (failures > 0) {
	console.error(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log('\nbrain ok');
process.exit(0);
