/**
 * The data and native layers without a window, a model or the network: pure
 * modules, the store with a stubbed worker, and the real client against a fake one.
 */

if (!process.versions.bun) {
  console.error("[brain] needs Bun — `npm run test:brain`");
  process.exit(1);
}

import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse_appearance } from "../lib/appearance.ts";
import { create_app } from "../lib/app.ts";
import { markdown_blocks } from "../lib/blocks.ts";
import { chunk_markdown } from "../lib/chunk.ts";
import { normalize_base_url, parse_sse } from "../lib/llm.ts";
import { MlClient } from "../lib/ml-client.ts";
import { MlStub } from "../lib/ml-stub.ts";
import {
  chunk_body,
  fts_query,
  match_ranges,
  parse_query,
  query_terms,
  rrf,
  snippet_around,
} from "../lib/rank.ts";
import { init_recorder } from "../lib/recorder.ts";
import { rss } from "../lib/feeds/rss.ts";
import {
  decode_entities,
  extract,
  normalize_url,
  pick_title,
} from "../lib/scrape.ts";
import type { Failure, Fetcher } from "../lib/types.ts";
import { VectorIndex, from_blob, to_blob } from "../lib/vectors.ts";
import { decode_mp3, encode_mp3 } from "../lib/mp3.ts";
import {
  build_wav_header,
  decode_wav,
  encode_wav,
  pcm16_from_float,
  wav_header,
  wav_info,
  WAV_HEADER_SIZE,
} from "../lib/wav.ts";
import { parse_mic_consent } from "../lib/recorder-win.ts";
import { check, finish } from "gpuix-svelte/test";

// --- wav
{
  const rate = 44100;
  const stereo = new Float32Array(rate * 2);
  for (let i = 0; i < rate; i++)
    stereo[i * 2] = stereo[i * 2 + 1] =
      0.5 * Math.sin((2 * Math.PI * 440 * i) / rate);
  const bytes = encode_wav(stereo, rate, 2);
  const h = wav_header(bytes);
  check("wav header channels", h.channels, 2);
  check("wav header rate", h.sampleRate, rate);
  const d = decode_wav(bytes);
  check("wav resampled to 16k", d.sampleRate, 16000);
  check("wav length ±2", Math.abs(d.samples.length - 16000) <= 2);
  let peak = 0;
  let crossings = 0;
  for (let i = 1; i < d.samples.length; i++) {
    peak = Math.max(peak, Math.abs(d.samples[i]));
    if (d.samples[i - 1] < 0 !== d.samples[i] < 0) crossings++;
  }
  check("wav peak survives", Math.abs(peak - 0.5) < 0.05);
  check(
    "wav pitch survives (zero crossings ≈ 880)",
    Math.abs(crossings - 880) <= 6,
  );

  // What the Windows recorder writes: a placeholder header, PCM appended as it arrives,
  // then the same builder again over the first 44 bytes once the total is known.
  const pcm = pcm16_from_float(new Float32Array(160).fill(0.5));
  const streamed = new Uint8Array(WAV_HEADER_SIZE + pcm.length);
  streamed.set(build_wav_header(0, 16000, 1));
  streamed.set(pcm, WAV_HEADER_SIZE);
  check(
    "unpatched header is repaired from the file size",
    wav_header(streamed).dataLength,
    pcm.length,
  );
  streamed.set(build_wav_header(pcm.length, 16000, 1));
  check(
    "patched header matches encode_wav",
    streamed,
    encode_wav(new Float32Array(160).fill(0.5)),
  );
  check("recorder output needs no sidecar", wav_info(streamed).ok, true);

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
  const chunk = (id: string, body: Uint8Array) => {
    const out = new Uint8Array(8 + body.length + (body.length & 1));
    for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
    new DataView(out.buffer).setUint32(4, body.length, true);
    out.set(body, 8);
    return out;
  };
  const parts = [
    chunk("fmt ", fmt),
    chunk("LIST", new Uint8Array(13)),
    chunk("FLLR", new Uint8Array(4000)),
    chunk("data", data),
  ];
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
  check("extensible 24-bit wav decodes", ext.samples.length, frames);
  check("stereo downmix averages channels", Math.abs(ext.samples[10]) < 1e-4);
  let threw = false;
  try {
    wav_header(new Uint8Array(10));
  } catch {
    threw = true;
  }
  check("truncated header throws", threw);
}

// --- mp3, both directions, entirely in-process
{
  const rate = 16000;
  const tone = Float32Array.from(
    { length: rate * 2 },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate),
  );
  const wav = encode_wav(tone, rate);
  const mp3 = await encode_mp3(wav);
  check("mp3 is smaller than the wav", mp3.length < wav.length / 4);
  check(
    "mp3 starts with a frame or an id3 tag",
    mp3[0] === 0xff || String.fromCharCode(mp3[0], mp3[1], mp3[2]) === "ID3",
  );

  const back = await decode_mp3(mp3);
  check(
    "mp3 decodes back to 16k mono",
    Math.abs(back.length - tone.length) < rate * 0.1,
  );
  let peak = 0;
  let crossings = 0;
  // Codec delay pads both ends, so measure the settled middle and expect 2 crossings
  // per cycle across however long that window turned out to be.
  const lo = Math.floor(back.length * 0.25) + 1;
  const hi = Math.floor(back.length * 0.75);
  for (let i = lo; i < hi; i++) {
    peak = Math.max(peak, Math.abs(back[i]));
    if (back[i - 1] < 0 !== back[i] < 0) crossings++;
  }
  check("mp3 peak survives the round trip", Math.abs(peak - 0.5) < 0.05);
  check(
    "mp3 pitch survives the round trip",
    Math.abs(crossings - (2 * 440 * (hi - lo)) / rate) <= 4,
  );
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
<ul><li>one</li><li>two</li></ul><pre>code  block\n  indented</pre><p>${"filler text ".repeat(60)}</p></article>
<footer>FOOTER TEXT</footer></body></html>`;
  const page = extract(html, { baseUrl: "https://example.com/post/1/" });
  check("og:title wins", page.title, "Fixture Title");
  check(
    "og:image is absolute and decoded",
    page.imageUrl,
    "https://example.com/img/hero.png?a=1&b=2",
  );
  check("canonical", page.canonical, "https://example.com/post/1/");
  check("lang", page.lang, "en");
  check("description", page.description, "A test page");
  check("nav dropped", page.text.includes("Home"), false);
  check("script dropped", page.text.includes("SCRIPT TEXT"), false);
  check("sidebar class dropped", page.text.includes("SIDEBAR"), false);
  check("footer dropped", page.text.includes("FOOTER"), false);
  check("heading marker", page.text.includes("## Heading ’quoted’"));
  check("list marker", page.text.includes("- one"));
  check("entities decoded", page.text.includes("emphasis & entity"));
  check("code fence kept", page.text.includes("```\ncode block"));
  check("article is the candidate", page.candidates[0]?.name, "article");
  check("text starts inside the article", page.text.startsWith("## Heading"));
  check(
    "normalize_url strips utm and hash",
    normalize_url("HTTPS://Example.com/a/b/?utm_source=x&q=1#frag"),
    "https://example.com/a/b?q=1",
  );
  check(
    "decode_entities numeric",
    decode_entities("&#x41;&#66;&rsquo;&bogus;"),
    "AB’&bogus;",
  );
}

// --- llm
{
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Hel'));
      c.enqueue(
        enc.encode(
          '"}}]}\r\n\r\n: keepalive\r\n\r\ndata: {"a":1}\ndata: {"b":2}\n\n',
        ),
      );
      c.enqueue(enc.encode('data: {"choices":[],"usage":{}}\n\ndata: [DONE]'));
      c.close();
    },
  });
  const events: string[] = [];
  for await (const e of parse_sse(stream)) events.push(e);
  check(
    "sse events",
    events.join("|"),
    '{"choices":[{"delta":{"content":"Hel"}}]}|{"a":1}\n{"b":2}|{"choices":[],"usage":{}}|[DONE]',
  );
  check(
    "ollama base url",
    normalize_base_url("http://localhost:11434"),
    "http://localhost:11434/v1",
  );
  check(
    "openai base url",
    normalize_base_url("https://api.openai.com"),
    "https://api.openai.com/v1",
  );
  check(
    "openrouter base url kept",
    normalize_base_url("https://openrouter.ai/api/v1/"),
    "https://openrouter.ai/api/v1",
  );
  check(
    "pasted endpoint trimmed",
    normalize_base_url("localhost:1234/v1/chat/completions"),
    "http://localhost:1234/v1",
  );
}

// --- appearance, rank, chunk, vectors
{
  check("darwin light", parse_appearance("darwin", 1, ""), "light");
  check("darwin dark", parse_appearance("darwin", 0, "Dark\n"), "dark");
  check(
    "win32 dark",
    parse_appearance("win32", 0, "  AppsUseLightTheme  REG_DWORD  0x0"),
    "dark",
  );

  // The three microphone consent keys: master, "let desktop apps…", per-executable.
  const allow = "    Value    REG_SZ    Allow";
  const deny = "    Value    REG_SZ    Deny";
  check(
    "consent: all three allow",
    parse_mic_consent(allow, allow, allow),
    "authorized",
  );
  check(
    "consent: master off wins",
    parse_mic_consent(deny, allow, allow),
    "denied",
  );
  check(
    "consent: desktop apps off wins",
    parse_mic_consent(allow, deny, allow),
    "denied",
  );
  check(
    "consent: per-app off wins",
    parse_mic_consent(allow, allow, deny),
    "denied",
  );
  // Absent keys mean inherit — treating that as notDetermined would refuse to record on a
  // machine that never had reason to write them.
  check(
    "consent: absent keys are allowed",
    parse_mic_consent("", "", ""),
    "authorized",
  );
  check(
    "consent: an error from reg is not a denial",
    parse_mic_consent(
      allow,
      allow,
      "ERROR: The system was unable to find the specified registry key",
    ),
    "authorized",
  );

  const fused = rrf({ a: [{ id: 1 }, { id: 2 }], b: [{ id: 3 }, { id: 2 }] });
  check("rrf: twice second beats once first", fused[0].id, 2);
  check("rrf signals", fused[0].signals.join("+"), "a+b");
  check("fts_query quotes and prefixes", fts_query('foo "bar'), '"foo" "bar"*');
  check("fts_query empty", fts_query("  "), null);
  check(
    "chunk_body strips heading path",
    chunk_body("Title › Section\n\nBody here", "Title"),
    "Body here",
  );

  check(
    "parse_query strips kind:",
    JSON.stringify(parse_query("compost kind:note")),
    '{"text":"compost","kinds":["text"],"unknown":[],"feeds":null}',
  );
  check(
    "parse_query several kinds and aliases",
    parse_query("kind:links,img is:voice foo").kinds!.join(","),
    "link,image,audio",
  );
  check(
    "parse_query unknown kind reported",
    parse_query("kind:bogus x").unknown.join(","),
    "bogus",
  );
  check(
    "parse_query kind only",
    JSON.stringify(parse_query("kind:image")),
    '{"text":"","kinds":["image"],"unknown":[],"feeds":null}',
  );
  check(
    "parse_query feeds:on",
    JSON.stringify(parse_query("soil feeds:on")),
    '{"text":"soil","kinds":null,"unknown":[],"feeds":true}',
  );
  check("parse_query feeds:off", parse_query("feeds:off soil").feeds, false);

  const terms = query_terms('Compost "worms"*');
  check(
    "query_terms longest first, no fts syntax",
    terms.join(","),
    "compost,worms",
  );
  const long = `${"filler ".repeat(80)}the compost heap needs turning ${"more ".repeat(80)}`;
  const around = snippet_around(long, terms, 120);
  check(
    "snippet windows around the first term",
    around!.includes("compost heap") &&
      around!.startsWith("…") &&
      around!.endsWith("…"),
  );
  check(
    "snippet is null without a match",
    snippet_around("nothing here", terms),
    null,
  );
  check(
    "match_ranges finds every occurrence",
    JSON.stringify(match_ranges("Compost, worms, compost.", terms)),
    "[[0,7],[9,14],[16,23]]",
  );

  const site = { siteName: "Newsonaut", hostname: "newsonaut.com" };
  check(
    "pick_title: headline beats a site-wide <title>",
    pick_title({
      og: "",
      tag: "Newsonaut: Turning inner space into outer space",
      headline: "Hang on to your Firefox!",
      ...site,
    }),
    "Hang on to your Firefox!",
  );
  check(
    "pick_title: og:title wins",
    pick_title({
      og: "Real title",
      tag: "Real title | Newsonaut",
      headline: "Something",
      ...site,
    }),
    "Real title",
  );
  check(
    "pick_title: site suffix stripped",
    pick_title({
      og: "",
      tag: "Real title | Newsonaut",
      headline: "Real title",
      ...site,
    }),
    "Real title",
  );
  check(
    "pick_title: og equal to site name is ignored",
    pick_title({
      og: "Newsonaut",
      tag: "Post about soil | Newsonaut",
      headline: undefined,
      ...site,
    }),
    "Post about soil",
  );

  const md = `# Title\n\nIntro para. Second sentence here.\n\n## Section\n\n${"word ".repeat(1200)}\n\n\`\`\`js\nconst a = 1;\n\nconst b = 2;\n\`\`\`\n\nTail.`;
  const chunks = chunk_markdown(md);
  check(
    "chunks respect max words",
    chunks.every((c) => c.words <= 500),
  );
  check("heading path recorded", chunks[1].heading, "Title › Section");
  check(
    "fence never split",
    chunks.some((c) =>
      c.text.includes("```js\nconst a = 1;\n\nconst b = 2;\n```"),
    ),
  );
  check("empty body → no chunks", chunk_markdown("").length, 0);
  check("short body → one chunk", chunk_markdown("Just a line.").length, 1);

  const page =
    "Intro para.\n\n# Heading\nRight after.\n\n- one\n\n- two\n1. three\n\nAfter list.\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
  const blocks = markdown_blocks(page);
  check(
    "markdown_blocks splits on blank lines and headings",
    blocks.slice(0, 3).join("|"),
    "Intro para.|# Heading|Right after.",
  );
  check(
    "markdown_blocks keeps a loose list together",
    blocks[3],
    "- one\n\n- two",
  );
  check(
    "markdown_blocks starts a block at an ordered list",
    blocks[4],
    "1. three",
  );
  check("markdown_blocks ends the list at prose", blocks[5], "After list.");
  check(
    "markdown_blocks keeps a fence whole",
    blocks[6],
    "```js\nconst a = 1;\n\nconst b = 2;\n```",
  );
  check(
    "markdown_blocks keeps table rows together",
    blocks[7],
    "| a | b |\n|---|---|\n| 1 | 2 |",
  );
  check("markdown_blocks count", blocks.length, 8);
  check(
    "markdown_blocks normalises CRLF",
    markdown_blocks("a\r\n\r\nb").join("|"),
    "a|b",
  );
  check(
    "markdown_blocks: an unterminated fence runs to the end",
    markdown_blocks("```\nx\n\ny").join("|"),
    "```\nx\n\ny",
  );
  check("markdown_blocks empty", markdown_blocks("").length, 0);

  const index = new VectorIndex(4, 1);
  const unit = (...v: number[]) => {
    const n = Math.hypot(...v);
    return Float32Array.from(v.map((x) => x / n));
  };
  index.add(1, 10, unit(1, 0, 0, 0));
  index.add(2, 10, unit(0, 1, 0, 0));
  index.add(3, 20, unit(1, 1, 0, 0));
  check("index grows", index.size, 3);
  check(
    "top_k order",
    index
      .top_k(unit(1, 0, 0, 0), 2)
      .map((h) => h.id)
      .join(","),
    "1,3",
  );
  check(
    "exclude_group",
    index
      .top_k(unit(1, 0, 0, 0), 3, { exclude_group: 10 })
      .map((h) => h.id)
      .join(","),
    "3",
  );
  index.remove([1]);
  check("swap-remove keeps others", index.top_k(unit(0, 1, 0, 0), 1)[0].id, 2);
  const blob = to_blob(unit(3, 4, 0, 0));
  const shifted = new Uint8Array(blob.length + 1);
  shifted.set(blob, 1);
  check(
    "from_blob copes with misalignment",
    from_blob(shifted.subarray(1), 4)[0].toFixed(2),
    "0.60",
  );
}

// --- store + ingest with the stub
const icon = fileURLToPath(
  new URL("../../tic-tac-toe/icon.png", import.meta.url),
);
const PAGE = `<html lang="en"><head><title>Soil page</title><meta property="og:title" content="All about loam"><meta property="og:image" content="/hero.png"></head><body><nav>NAV</nav><article><h1>Loam</h1><p>Loam is soil composed of sand, silt and clay. Gardeners love it because it drains well but holds water.</p></article></body></html>`;
const fixture_fetch: Fetcher = async (url) => {
  if (url.endsWith("/hero.png"))
    return new Response(await Bun.file(icon).bytes(), {
      headers: { "content-type": "image/png" },
    });
  if (url.includes("fail")) return new Response("nope", { status: 500 });
  return new Response(PAGE, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};
const dir = mkdtempSync(join(tmpdir(), "substrate-test-"));
{
  const ml = new MlStub();
  const app = await create_app({ data_dir: dir, ml, fetch: fixture_fetch });
  const note = app.add_note({
    body: "Turn the compost every two weeks. Worms like coffee grounds.",
  });
  check(
    "note gets a derived title",
    note.title,
    "Turn the compost every two weeks.",
  );
  const { item: link, existed } = await app.add_link(
    "https://example.com/soil?utm_source=x",
  );
  check("link is new", existed, false);
  check(
    "link dedupes by normalized url",
    (await app.add_link("https://example.com/soil")).existed,
    true,
  );
  const image = await app.add_image(icon);
  check("image has dimensions", image.width, 1024);
  check(
    "image bytes are in the database",
    (app.blobs.bytes(image.file_blob)?.length ?? 0) > 0,
  );
  check(
    "image has a thumbnail",
    (app.blobs.info(image.thumb_blob!)?.size ?? 0) > 0,
  );
  const cached = app.blobs.file(image.thumb_blob)!;
  check("a blob materialises into the cache", existsSync(cached));
  check("the cache path lives under cache/", cached.startsWith(app.dirs.cache));
  check(
    "materialising twice is the same path",
    app.blobs.file(image.thumb_blob),
    cached,
  );
  const wav = join(dir, "memo.wav");
  await Bun.write(
    wav,
    encode_wav(
      Float32Array.from(
        { length: 44100 },
        (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / 44100),
      ),
      44100,
    ),
  );
  const audio = await app.add_audio(wav);
  await app.ingest.idle();

  check("note ready", app.get_item(note.id)!.status, "ready");
  check("link scraped title", app.get_item(link.id)!.title, "All about loam");
  check(
    "link body from article",
    app.get_item(link.id)!.body.includes("drains well"),
  );
  check(
    "link thumb fetched",
    (app.blobs.info(app.get_item(link.id)!.thumb_blob!)?.size ?? 0) > 0,
  );
  check("audio converted", Math.round(app.get_item(audio.id)!.duration!), 1);
  check(
    "audio transcribed by stub",
    app.get_item(audio.id)!.body.startsWith("Stub transcript"),
  );
  check("image ready", app.get_item(image.id)!.status, "ready");
  check("chunk vectors indexed", app.vectors.size, 3);
  check("image vector indexed", app.images.size, 1);
  check("chunk blob is 768 floats", app.store.chunks_of(note.id).length, 1);

  const r = await app.search("compost worms");
  check("search finds the note first", r.hits[0]?.item.id, note.id);
  check(
    "search reports both signals",
    r.hits[0]?.signals.sort().join("+"),
    "fts+vector",
  );
  check("nothing degraded with the stub", r.degraded.length, 0);
  check(
    "kind filter excludes",
    (await app.search("compost", { kinds: ["link"] })).hits.some(
      (h) => h.item.id === note.id,
    ),
    false,
  );
  check(
    "kind: in the query filters",
    (await app.search("compost kind:link")).hits.some(
      (h) => h.item.id === note.id,
    ),
    false,
  );
  check(
    "kind: alone lists that kind",
    (await app.search("kind:image")).hits.map((h) => h.item.id).join(","),
    String(image.id),
  );
  check(
    "kind: outranks the option",
    (await app.search("compost kind:note", { kinds: ["link"] })).hits[0]?.item
      .id,
    note.id,
  );
  // MlStub hashes the basename of whatever path it is handed, which is now the cache file.
  const clip_name = basename(app.blobs.file(image.file_blob)!);
  check(
    "image search by name (stub hashes the query)",
    (await app.search(clip_name, { kinds: ["image"] })).hits[0]?.item.id,
    image.id,
  );
  ml.status.clip.state = "unloaded";
  check(
    "an unloaded model is still asked while the worker is up",
    (await app.search(clip_name, { kinds: ["image"] })).hits[0]?.signals.join(
      ",",
    ),
    "clip",
  );
  ml.status.clip.state = "ready";

  app.update_note(note.id, {
    body: "Turn the compost weekly. Snails hate copper tape.",
  });
  await app.ingest.idle();
  check(
    "update re-embeds",
    (await app.search("snails copper")).hits[0]?.item.id,
    note.id,
  );
  check("vector count stable after update", app.vectors.size, 3);

  check("delete returns true", app.delete_item(note.id), true);
  check("delete drops vectors", app.vectors.size, 2);
  check("delete drops fts", (await app.search("snails")).hits.length, 0);

  // Added and deleted again, so the counts the restart block asserts are unchanged.
  const throwaway = await app.add_image(icon, { title: "Throwaway" });
  await app.ingest.idle();
  const gone_blobs = app.blobs.of_item(throwaway.id);
  const gone_paths = gone_blobs.map((b) => app.blobs.file(b.id)!);
  check("every blob of an item materialises", gone_paths.every(existsSync));
  app.delete_item(throwaway.id);
  check(
    "delete cascades to the blob rows",
    gone_blobs.every((b) => app.blobs.info(b.id) === null),
  );
  check(
    "delete clears the cached files",
    gone_paths.every((p) => !existsSync(p)),
  );

  const { item: bad } = await app.add_link("https://example.com/fail");
  await app.ingest.idle();
  check("http 500 marks error", app.get_item(bad.id)!.status, "error");
  check("attempts counted", app.get_item(bad.id)!.attempts, 1);

  ml.fail_next("transcribe", { transient: false, message: "boom" });
  const audio2 = await app.add_audio(wav);
  await app.ingest.idle();
  check("permanent failure → error", app.get_item(audio2.id)!.error, "boom");
  app.retry(audio2.id);
  await app.ingest.idle();
  check("retry recovers", app.get_item(audio2.id)!.status, "ready");

  // An imported file is the user's master copy: stored verbatim, never re-encoded.
  check(
    "imported audio kept byte-exact",
    Buffer.from(app.blobs.bytes(app.get_item(audio.id)!.file_blob)!).equals(
      Buffer.from(await Bun.file(wav).bytes()),
    ),
  );
  check(
    "imported audio stays a wav",
    app.blobs.info(app.get_item(audio.id)!.file_blob!)?.ext,
    "wav",
  );
  check(
    "derived pcm dropped once transcribed",
    app.get_item(audio.id)!.meta.pcm_blob,
    null,
  );

  // A recording is ours, so it is re-encoded in place once the transcript exists.
  const memo = join(dir, "memo-16k.wav");
  await Bun.write(
    memo,
    encode_wav(
      Float32Array.from(
        { length: 16000 },
        (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / 16000),
      ),
      16000,
    ),
  );
  const memo_bytes = (await Bun.file(memo).bytes()).length;
  const recorded = await app.add_audio(memo, {
    recorded: true,
    title: "Voice memo",
  });
  await app.ingest.idle();
  const done = app.get_item(recorded.id)!;
  check(
    "recording re-encoded to mp3",
    app.blobs.info(done.file_blob!)?.ext,
    "mp3",
  );
  check(
    "recording got smaller",
    app.blobs.info(done.file_blob!)!.size < memo_bytes,
  );
  check("recording pcm cleared", done.meta.pcm_blob, null);
  check(
    "compacted recording still resolves",
    existsSync(app.blobs.file(done.file_blob)!),
  );
  check(
    "transcript survived compaction",
    done.body.startsWith("Stub transcript"),
  );

  // An imported MP3 is decoded in-process; there is no ffmpeg on the machine to fall back to.
  const imported_mp3 = join(dir, "clip.mp3");
  await Bun.write(
    imported_mp3,
    await encode_mp3(
      encode_wav(
        Float32Array.from(
          { length: 32000 },
          (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / 16000),
        ),
        16000,
      ),
    ),
  );
  const mp3_item = await app.add_audio(imported_mp3);
  await app.ingest.idle();
  const ready_mp3 = app.get_item(mp3_item.id)!;
  check("mp3 import succeeds", ready_mp3.status, "ready");
  check(
    "mp3 import keeps its mp3 original",
    app.blobs.info(ready_mp3.file_blob!)?.ext,
    "mp3",
  );
  check("mp3 import gets a duration", Math.round(ready_mp3.duration!), 2);
  check(
    "mp3 import gets transcribed",
    ready_mp3.body.startsWith("Stub transcript"),
  );
  check("mp3 import drops its pcm sidecar", ready_mp3.meta.pcm_blob, null);

  const unsupported = join(dir, "clip.m4a");
  await Bun.write(unsupported, new Uint8Array(2048));
  const bad_audio = await app.add_audio(unsupported);
  await app.ingest.idle();
  check(
    "an unsupported format fails clearly",
    app.get_item(bad_audio.id)!.error?.includes("import a WAV or MP3"),
    true,
  );
  check("and is not retried", app.get_item(bad_audio.id)!.status, "error");

  app.settings.set("llm.model", "x");
  check("settings roundtrip", app.settings.get("llm.model"), "x");
  check("secrets masked", app.settings.all()["llm.apiKey"], "");
  app.close();
}
{
  const app = await create_app({
    data_dir: dir,
    ml: new MlStub(),
    fetch: fixture_fetch,
  });
  check("restart restores vectors", app.vectors.size, 5);
  check("restart restores image vectors", app.images.size, 1);
  check("restart keeps items", app.snapshot().counts.total, 8);
  check(
    "media survives a reopen",
    (app.blobs.bytes(app.list({ kind: "image" })[0].file_blob)?.length ?? 0) >
      0,
  );
  app.close();
}

// --- feeds
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Newsonaut</title>
  <link>https://feed.test/</link>
  <description>Dispatches</description>
  <item>
    <title>Mycelium &amp; the wood wide web</title>
    <link>https://feed.test/post-1?utm_source=rss</link>
    <guid isPermaLink="false">post-1</guid>
    <pubDate>Tue, 01 Sep 2026 08:00:00 GMT</pubDate>
    <dc:creator>A. Gardener</dc:creator>
    <description><![CDATA[<p>Fungal networks trade <b>sugar</b> for phosphorus.</p>]]></description>
    <enclosure url="/hero.png" type="image/png" length="1" />
  </item>
  <item>
    <title>Charcoal in the beds</title>
    <link>https://feed.test/post-2</link>
    <guid isPermaLink="false">post-2</guid>
    <pubDate>Mon, 31 Aug 2026 08:00:00 GMT</pubDate>
    <content:encoded><![CDATA[<p>Biochar holds onto nutrients for centuries.</p>]]></content:encoded>
  </item>
</channel>
</rss>`;
const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atomsonaut</title>
  <link rel="self" href="https://feed.test/atom.xml"/>
  <link rel="alternate" href="https://feed.test/"/>
  <entry>
    <title>Quenching the clay</title>
    <id>urn:uuid:atom-1</id>
    <link rel="alternate" href="https://feed.test/atom-post-1"/>
    <updated>2026-09-02T10:00:00Z</updated>
    <author><name>B. Digger</name></author>
    <summary type="html">&lt;p&gt;Gypsum will not fix compaction.&lt;/p&gt;</summary>
  </entry>
</feed>`;
const HOMEPAGE = `<html><head><title>Blog</title><link rel="alternate" type="application/rss+xml" href="/rss.xml"></head><body><p>hello</p></body></html>`;
const ARTICLE = (word: string) =>
  `<html><head><title>Post</title></head><body><article><h1>Post</h1><p>The full article body mentions ${word} at length, which the feed summary never does.</p></article></body></html>`;

let fetches = 0;
const feed_fetch: Fetcher = async (url) => {
  fetches++;
  const path = String(url);
  if (path.endsWith("/hero.png"))
    return new Response(await Bun.file(icon).bytes(), {
      headers: { "content-type": "image/png" },
    });
  if (path.includes("atom.xml"))
    return new Response(ATOM, {
      headers: { "content-type": "application/atom+xml" },
    });
  if (path.includes("rss.xml") || path.includes("feed.xml"))
    return new Response(RSS, {
      headers: { "content-type": "application/rss+xml" },
    });
  if (path.startsWith("https://blog.test") && !path.includes(".xml"))
    return new Response(HOMEPAGE, { headers: { "content-type": "text/html" } });
  if (path.includes("post-1"))
    return new Response(ARTICLE("nitrogen"), {
      headers: { "content-type": "text/html" },
    });
  if (path.includes("post-2"))
    return new Response(ARTICLE("potassium"), {
      headers: { "content-type": "text/html" },
    });
  return new Response("nope", { status: 404 });
};

{
  const parsed = rss.parse(RSS, "https://feed.test/rss.xml");
  check("rss title", parsed.title, "Newsonaut");
  check("rss site url", parsed.site_url, "https://feed.test/");
  check("rss entries", parsed.entries.length, 2);
  check(
    "rss entity in a title",
    parsed.entries[0].title,
    "Mycelium & the wood wide web",
  );
  check("rss guid", parsed.entries[0].guid, "post-1");
  check(
    "rss link",
    parsed.entries[0].url,
    "https://feed.test/post-1?utm_source=rss",
  );
  check(
    "rss cdata html becomes text",
    parsed.entries[0].body,
    "Fungal networks trade sugar for phosphorus.",
  );
  check("rss author", parsed.entries[0].author, "A. Gardener");
  check(
    "rss enclosure image is absolute",
    parsed.entries[0].image_url,
    "https://feed.test/hero.png",
  );
  check(
    "rss date",
    new Date(parsed.entries[0].published_at!).toISOString(),
    "2026-09-01T08:00:00.000Z",
  );
  check(
    "content:encoded beats description",
    parsed.entries[1].body,
    "Biochar holds onto nutrients for centuries.",
  );

  const atom = rss.parse(ATOM, "https://feed.test/atom.xml");
  check("atom title", atom.title, "Atomsonaut");
  check(
    "atom skips rel=self for the site link",
    atom.site_url,
    "https://feed.test/",
  );
  check("atom id is the guid", atom.entries[0].guid, "urn:uuid:atom-1");
  check("atom link href", atom.entries[0].url, "https://feed.test/atom-post-1");
  check(
    "atom escaped html unescapes to text",
    atom.entries[0].body,
    "Gypsum will not fix compaction.",
  );
  check("atom nested author name", atom.entries[0].author, "B. Digger");
  check("sniff by content type", rss.sniff("", "application/rss+xml"));
  check("sniff by document element", rss.sniff(ATOM, "text/plain"));
  check("sniff refuses html", rss.sniff(HOMEPAGE, "text/html"), false);
  check(
    "unclosed tags still parse",
    rss.parse(
      "<rss><channel><title>Half<item><title>One</title></channel></rss>",
      "https://x.test/",
    ).entries.length,
    1,
  );
}

{
  const feed_dir = mkdtempSync(join(tmpdir(), "substrate-feeds-"));
  const app = await create_app({
    data_dir: feed_dir,
    ml: new MlStub(),
    fetch: feed_fetch,
  });

  // An entry captured by hand before the feed knew about it is adopted, not duplicated.
  const { item: manual } = await app.add_link("https://feed.test/post-2");

  const { feed, result } = await app.feeds.add("https://feed.test/rss.xml");
  await app.ingest.idle();
  check("feed title from the document", feed.title, "Newsonaut");
  check("backfill takes what the feed carries", result.added, 1);
  check(
    "an existing item is adopted",
    app.get_item(manual.id)!.feed_id,
    feed.id,
  );
  check("no duplicate for the adopted url", app.store.counts().total, 2);
  check("feed items counted", app.store.counts().feeds, 2);

  const first = app
    .list({ limit: 10 })
    .find((i) => i.meta.feed && i.source_url?.includes("post-1"))!;
  check(
    "entry keeps its publish date",
    new Date(first.created_at).toISOString(),
    "2026-09-01T08:00:00.000Z",
  );
  check(
    "utm stripped from the entry url",
    first.source_url,
    "https://feed.test/post-1",
  );
  check("full text is fetched by default", first.body.includes("nitrogen"));
  check("entry author recorded", first.meta.author, "A. Gardener");
  check("feed entries are ready", first.status, "ready");
  check(
    "an entry knows which poll picked it up",
    app.store.entry_of(first.id)?.guid,
    "post-1",
  );
  check(
    "a scraped entry records when it was read",
    (app.get_item(first.id)!.meta.fetched_at ?? 0) > 0,
  );

  check(
    "a second poll adds nothing",
    (await app.feeds.refresh(feed.id)).added,
    0,
  );
  await app.ingest.idle();
  check("and creates no items", app.store.counts().total, 2);

  // The feed's own words are searchable, but only when asked for.
  check(
    "feed items are out of search",
    (await app.search("nitrogen")).hits.length,
    0,
  );
  check(
    "feeds:on reveals them",
    (await app.search("nitrogen feeds:on")).hits[0]?.item.id,
    first.id,
  );
  check(
    "the option reveals them",
    (await app.search("nitrogen", { feeds: true })).hits[0]?.item.id,
    first.id,
  );
  check(
    "a pasted feed url still resolves",
    (await app.search("https://feed.test/post-1")).hits[0]?.item.id,
    first.id,
  );
  check(
    "rag retrieval skips feeds",
    (await app.search("nitrogen", { feeds: false })).hits.length,
    0,
  );
  app.settings.set("search.includeFeeds", true);
  check(
    "the setting reveals them",
    (await app.search("nitrogen")).hits[0]?.item.id,
    first.id,
  );
  app.settings.set("search.includeFeeds", false);

  const note = app.add_note({
    body: "Nitrogen notes: legumes fix it out of the air.",
  });
  await app.ingest.idle();
  check(
    "own items are unaffected",
    (await app.search("nitrogen")).hits[0]?.item.id,
    note.id,
  );

  // Feed content only: no article fetch, the body is what the document carried.
  const atom_feed = (
    await app.feeds.add("https://feed.test/atom.xml", { full_text: false })
  ).feed;
  await app.ingest.idle();
  const atom_item = app
    .list({ limit: 10 })
    .find((i) => i.feed_id === atom_feed.id)!;
  check(
    "feed-content-only body",
    atom_item.body,
    "Gypsum will not fix compaction.",
  );
  check("and no page was scraped", atom_item.meta.fetched_at === undefined);
  check(
    "the feed summary is kept as the excerpt",
    atom_item.meta.excerpt,
    "Gypsum will not fix compaction.",
  );

  // A blog address is followed to the feed it advertises.
  const found = await app.feeds.add("https://blog.test");
  check(
    "an html page resolves to its feed",
    found.feed.url,
    "https://blog.test/rss.xml",
  );
  check(
    "subscribing twice is refused",
    await app.feeds.add("https://blog.test/rss.xml").then(
      () => "ok",
      (e: Error) => e.message,
    ),
    "already subscribed to that feed",
  );
  app.feeds.remove(found.feed.id, { keep_items: false });
  check("removing a feed with its items", app.store.list_feeds().length, 2);

  // Retention keeps the newest entry and never lets the pruned one back in.
  app.feeds.update(feed.id, { retention_max: 1 });
  const pruned = await app.feeds.refresh(feed.id);
  check("retention prunes the older entry", pruned.pruned, 1);
  check(
    "retention keeps the newest",
    app.store.feed_entry_items(feed.id).length,
    1,
  );
  check(
    "a pruned entry is not fetched again",
    (await app.feeds.refresh(feed.id)).added,
    0,
  );

  // An entry you have edited is yours, whatever retention says.
  const kept = app.store.feed_entry_items(feed.id)[0];
  app.store.update_item(kept.id, { meta: { edited: true } });
  app.feeds.update(feed.id, { retention_max: 0 });
  check(
    "an edited entry survives retention",
    (await app.feeds.refresh(feed.id)).pruned,
    0,
  );

  // A feed the app was closed for polls at start; one just polled does not.
  app.store.update_feed(atom_feed.id, { last_polled_at: 0, last_error: null });
  const before = fetches;
  app.feeds.start();
  await new Promise((r) => setTimeout(r, 200));
  check("a missed poll is caught up at start", fetches > before);
  check(
    "and the feed is marked polled",
    app.store.get_feed(atom_feed.id)!.last_polled_at! > 0,
  );
  const after = fetches;
  app.feeds.stop();
  app.feeds.start();
  await new Promise((r) => setTimeout(r, 200));
  check("a feed that is up to date is left alone", fetches, after);
  app.feeds.stop();

  check(
    "a broken schedule is reported",
    app.feeds.next_run("not a cron"),
    null,
  );
  check(
    "a good schedule has a next run",
    (app.feeds.next_run("0 0 */2 * * *") ?? 0) > Date.now(),
  );
  app.close();
}

// --- MlClient against the fake worker
{
  const client = new MlClient({
    worker_path: fileURLToPath(new URL("./fake-worker.ts", import.meta.url)),
    models_dir: dir,
    autoload: false,
  });
  await client.start();
  check("worker up", client.status.worker, "up");
  await client.load("embed");
  check("status forwarded", client.status.embed.state, "ready");
  const vecs = await client.embed_texts(["a", "b", "c"], { batch: 2 });
  check("batched embeddings", vecs.length, 3);
  check(
    "typed arrays cross ipc",
    vecs[0] instanceof Float32Array && vecs[0].length === 768,
  );
  const q = await client.embed_query("a");
  let dot = 0;
  for (let i = 0; i < 768; i++) dot += q[i] * vecs[0][i];
  check("same text → same vector", dot.toFixed(3), "1.000");
  let progressed = false;
  await client.transcribe("/x.wav", { on_progress: () => (progressed = true) });
  check("progress forwarded", progressed);
  const code = await client
    .embed_texts(["__crash__"])
    .catch((e: Failure) => e.code);
  check("crash rejects pending", code, "WORKER_CRASHED");
  await new Promise((r) => setTimeout(r, 1500));
  check("auto restart", client.status.worker, "up");
  check("works after restart", (await client.embed_query("z")).length, 768);
  await client.stop();
  check("stopped", client.status.worker, "down");
}

// --- the recorder backend loads (no prompt, no recording). init_recorder is memoized, so
// both platforms share one block rather than racing for it.
if (
  (process.platform === "darwin" || process.platform === "win32") &&
  process.env.GPUIX_BRAIN_RECORDER !== "0"
) {
  const rec = await init_recorder();
  // A Windows box with no capture device is a legitimate unavailable, so only assert the
  // shape there; macOS always has the shim.
  if (process.platform === "darwin")
    check("recorder shim loads", rec.available, true);
  else
    check(
      "recorder reports availability with a reason",
      rec.available || typeof rec.reason === "string",
      true,
    );
  check("recorder idle", rec.isRecording(), false);
  check(
    "auth status is a known value",
    ["notDetermined", "authorized", "denied", "restricted"].includes(
      rec.authStatus(),
    ),
  );
  check("stop with nothing running is 0", await rec.stop(), 0);
  check("still idle after stop", rec.isRecording(), false);
}

finish("brain", recorder ? 209 : 206);
