/**
 * `@media` in a <style> and media_query(): nothing native evaluates either, so the compiler keeps
 * the query on the rule, the renderer matches it against the window's size and restyles exactly
 * the elements that depend on it when that size changes, through the same poll as window_size.
 */

import { fileURLToPath } from 'node:url';
import { TestGpuixRenderer } from '@gpuix/native';
import { media_query, set_css_vars, type Mutation } from 'gpuix-svelte';
import { compile_svelte } from '../src/compile.ts';
import { media_matches, parse_media_query } from '../src/media.ts';
import { mount_headless, find_test_id, click_test_id, all_text, wait, check, finish } from 'gpuix-svelte/test';

const FIXTURE = fileURLToPath(new URL('./Media.svelte', import.meta.url));

// --- the parser ---------------------------------------------------------------
const at = (query: string, width: number, height = 600) => {
	const list = parse_media_query(query);
	return list === null ? null : media_matches(list, { width, height });
};

check('min-width is inclusive', [at('(min-width: 600px)', 600), at('(min-width: 600px)', 599)], [true, false]);
check('max-width is inclusive', [at('(max-width: 599px)', 599), at('(max-width: 599px)', 600)], [true, false]);
check('a plain width is an exact match', [at('(width: 600px)', 600), at('(width: 600px)', 601)], [true, false]);
check('height too', [at('(min-height: 500px)', 800, 500), at('(max-height: 499px)', 800, 500)], [true, false]);
check('the range syntax, feature first', [at('(width >= 600px)', 600), at('(width < 600px)', 600), at('(width > 600px)', 600)], [true, false, false]);
check('and value first, which flips the comparison', [at('(600px <= width)', 600), at('(600px < width)', 600), at('(900px > width)', 600)], [true, false, true]);
check('a two-sided range', [at('(600px <= width < 900px)', 600), at('(600px <= width < 900px)', 899), at('(600px <= width < 900px)', 900)], [true, true, false]);
check('`and` needs every feature', [at('(min-width: 600px) and (max-width: 900px)', 700), at('(min-width: 600px) and (max-width: 900px)', 950)], [true, false]);
check('a comma is any of them', [at('(max-width: 500px), (min-width: 900px)', 950), at('(max-width: 500px), (min-width: 900px)', 700)], [true, false]);
check('`not` flips the alternative it starts', [at('not (min-width: 600px)', 500), at('not (min-width: 600px)', 600)], [true, false]);
check('a square window is portrait', [at('(orientation: landscape)', 800, 600), at('(orientation: portrait)', 600, 600), at('(orientation: portrait)', 500, 800)], [true, true, true]);
check('screen and all are what a window is, print is not', [at('screen and (min-width: 600px)', 700), at('only screen', 700), at('all', 700), at('print', 700), at('not print', 700)], [true, true, true, false, true]);
check('rem and em are 16 px', [at('(min-width: 40rem)', 640), at('(min-width: 40em)', 640), at('(min-width: 40rem)', 639)], [true, true, false]);
check('a bare feature asks for a size at all', [at('(width)', 1), at('(orientation)', 1)], [true, true]);
check('a unitless value is only valid at zero', [at('(min-width: 0)', 1), at('(min-width: 600)', 700)], [true, null]);
check('case does not matter', at('SCREEN AND (MIN-WIDTH: 600PX)', 700), true);
check(
	'what a window cannot answer parses to null',
	['(prefers-color-scheme: dark)', '(hover: hover)', '(min-width: 50vw)', '(min-width: 600px', 'garbage', '(min-width: 600px) or (width)', 'only', 'and (width)', '(width) and', '(width) (height)', '(600px <= width < 900px <= height)'].map((q) => parse_media_query(q)),
	Array(11).fill(null)
);

// --- the compiler --------------------------------------------------------------
const warnings: string[] = [];
const warn = console.warn;
console.warn = (message) => warnings.push(String(message));
const code = compile_svelte(FIXTURE);
console.warn = warn;

check('a rule under @media carries its query', code.includes('"classes":["grid"],"tag":null,"pseudo":null,"style":{"flexDirection":"column","gap":8},"media":["(max-width: 599px)"]'), true);
check('a rule under nested @media carries both, outermost first', code.includes('"media":["(max-width: 599px)","(orientation: landscape)"]'), true);
check('a var() under @media still ships as text', code.includes('"css":"color: var(--narrow-ink)","media":["(max-width: 599px)"]'), true);
check('a rule outside any @media carries none', code.includes('"classes":["plain"],"tag":null,"pseudo":null,"style":{"color":"gray"}}'), true);
const refused = warnings.filter((w) => w.includes('has no GPUI equivalent'));
check('a query a window cannot answer is refused, naming what it can', refused.some((w) => w.includes('`@media (prefers-color-scheme: dark)`') && w.includes('width and height')), true);
check('so is a query in a unit a window has no value for', refused.some((w) => w.includes('`@media screen and (min-width: 50vw)`')), true);
check('other at-rules are refused as before', refused.some((w) => w.includes('`@supports (display: flex)`')), true);
check('and nothing else was', refused.length, 3);

// --- the renderer --------------------------------------------------------------
// On the prototype, so the batches a poll ships are seen too.
let ops: Mutation[] = [];
const apply_batch = TestGpuixRenderer.prototype.applyBatch;
TestGpuixRenderer.prototype.applyBatch = function (json) {
	ops.push(...(JSON.parse(json) as Mutation[]));
	return apply_batch.call(this, json);
};

set_css_vars({ 'narrow-ink': '#ff0000' });
const Media = (await import('./Media.svelte')).default;
console.warn = (message) => warnings.push(String(message));
const { native, unmount } = mount_headless(Media, { width: 720, height: 520 });
console.warn = warn;
const style = (id: string) => find_test_id(id)?.style ?? {};
const pick = (id: string, ...keys: string[]) => keys.map((k) => style(id)[k] ?? null);
const query = () => all_text().find((t) => /^(wide|narrow)\//.test(t));
const restyled = () => new Set(ops.filter((op) => op[0] === 'setStyle').map((op) => op[1]));
const id_of = (test_id: string) => find_test_id(test_id)?.id;

// A poll is 100 ms, and a loaded Windows runner's timers are coarse.
async function until(done: () => boolean) {
	for (let waited = 0; waited < 2000 && !done(); waited += 25) await wait(25);
}

check('the headless window is wide enough for the fixture', native.getWindowSize().width >= 600, true);
check('rules whose query holds apply, the others do not', pick('grid', 'flexDirection', 'gap', 'padding'), ['row', 16, 20]);
check('a nested @media needs both queries', pick('nested', 'opacity'), [null]);
check('an inactive var() rule is not even read', pick('tinted', 'color'), [null]);
check('an <svg> inherits the colour the active rules give', [style('row').color, style('icon').color], ['blue', 'blue']);
check('media_query answers the same size', query(), 'wide/false/false');
check('an unanswerable media_query warned once, naming the query', warnings.filter((w) => w.includes('media_query("(prefers-color-scheme: dark)")')).length, 1);

let reads = 0;
native.getWindowSize = () => (reads++, { width: 500, height: 400 });
ops = [];
await until(() => style('grid').flexDirection === 'column' && query()?.startsWith('narrow') === true);
check('a narrower window restyles within a poll', pick('grid', 'flexDirection', 'gap', 'padding'), ['column', 8, null]);
check('the nested rule holds in landscape', pick('nested', 'opacity'), [0.5]);
check('the var() rule resolves once active', pick('tinted', 'color'), ['#ff0000']);
check('a later rule of equal weight wins when its query holds, and the <svg> follows', [style('row').color, style('icon').color], ['red', 'red']);
check('and media_query flipped with it', query(), 'narrow/false/false');
const touched = restyled();
check(
	'only the elements that depend on the size were restyled',
	['grid', 'nested', 'tinted', 'row', 'icon', 'switch'].map((id) => touched.has(id_of(id)!)).concat(touched.has(id_of('plain')!), touched.has(id_of('query')!)),
	[true, true, true, true, true, true, false, false]
);

native.getWindowSize = () => (reads++, { width: 500, height: 800 });
await until(() => style('nested').opacity == null);
check('turning portrait drops the nested rule and keeps the rest', [pick('nested', 'opacity')[0], style('grid').flexDirection], [null, 'column']);

click_test_id('switch');
check('a class swap away from an @media rule restyles at once', pick('switch', 'opacity', 'color'), [null, 'gray']);
native.getWindowSize = () => (reads++, { width: 900, height: 500 });
ops = [];
await until(() => style('grid').flexDirection === 'row');
check('a wider window restyles back', pick('grid', 'flexDirection', 'padding'), ['row', 20]);
check('the element that stopped depending on the size was left alone', restyled().has(id_of('switch')!), false);
check('the query reads wide again', query(), 'wide/false/false');

unmount();
await wait(10);
const stopped_at = reads;
await wait(300);
check('the poll stops once nothing depends on the size', reads, stopped_at);
check('media_query outside any effect reads the window once', [media_query('(min-width: 600px)').current, reads], [true, stopped_at + 1]);

// A fixture that reads neither window_size nor an @media rule, so any read below is the renderer's own.
const Styled = (await import('./Styled.svelte')).default;
const plain = mount_headless(Styled, { width: 720, height: 520 });
let plain_reads = 0;
plain.native.getWindowSize = () => (plain_reads++, { width: 1, height: 1 });
await wait(250);
check('a tree without @media rules never watches the window', plain_reads, 0);

TestGpuixRenderer.prototype.applyBatch = apply_batch;
finish('media', 46);
