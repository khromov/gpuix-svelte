/**
 * `:root { --name: value }` in a component's <style>. The compiler takes the rule out of the sheet and
 * registers it by file, and the renderer ranks it as a browser's cascade would: by the order the files
 * loaded, under set_css_vars() (the inline style on <html> in the DOM build), by the window's size
 * where it sits under @media, and replaced in place when `render_hot` evaluates its file again.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TestGpuixRenderer } from '@gpuix/native';
import { commit, is_dirty, parse_css_text, set_css_vars, type AnyComponent, type Mutation } from 'gpuix-svelte';
import { define_root_vars } from 'gpuix-svelte/renderer';
import { compile_svelte } from '../src/compile.ts';
import { compile_source } from '../src/compile-core.ts';
import { import_fresh } from '../src/hot.ts';
import { mount_headless, find_test_id, settle, wait, check, finish } from 'gpuix-svelte/test';

const FIXTURE = fileURLToPath(new URL('./RootVars.svelte', import.meta.url));

const warn = console.warn;
function capture(): string[] {
	const into: string[] = [];
	console.warn = (message) => into.push(String(message));
	return into;
}
const undefined_vars = (warnings: string[]) => warnings.filter((w) => w.includes('is not defined'));

// --- the compiler ---------------------------------------------------------------
const compile_warnings = capture();
const code = compile_svelte(FIXTURE);
console.warn = warn;

check('a :root rule registers its variables by file, named without the --', /\$define_root_vars\("[a-z0-9]+", \[\{"vars":\{"surface":"#101010","pad":"4px 8px",/.test(code), true);
check('!important is kept apart from the value', code.includes('"important":{"locked":"#0000aa"}'), true);
check(':global(:root) and a :root in a selector list declare too', [code.includes('{"vars":{"global":"#0a0a0a"}}'), code.includes('{"vars":{"listed":"3px"}}')], [true, true]);
check('a :root rule under @media carries its query', code.includes('{"vars":{"gap":"4px"},"media":["(max-width: 599px)"]}'), true);

const refused = compile_warnings.filter((w) => w.includes('has no GPUI equivalent'));
check('a property that is no variable is refused in :root', refused.some((w) => w.includes('`:root { color }`')), true);
check('so is a :root with anything attached, naming set_css_vars()', refused.some((w) => w.includes('`:root.dark`') && w.includes('set_css_vars()')), true);
check('so is a variable declared on anything else', [refused.some((w) => w.includes('`.scoped { --local }`')), refused.some((w) => w.includes('`.listed { --listed }`'))], [true, true]);
check('and a query a window cannot answer, as around any rule', refused.some((w) => w.includes('`@media (prefers-color-scheme: dark)`')), true);
check('nothing else was, and each refusal names the file', [refused.length, refused.every((w) => w.includes(FIXTURE))], [5, true]);
check('a refused declaration ships nowhere, while the rule it sat in keeps the rest', [code.includes('#ffffff'), code.includes('#eeeeee'), code.includes('2px'), code.includes('"css":"margin: var(--local, 7px); opacity: 0.5"')], [false, false, false, true]);
check('and a rule left with nothing to declare is not shipped', [code.includes('"classes":["listed"],"tag":null,"pseudo":null,"style":{}'), code.includes('"classes":["listed"],"tag":null,"pseudo":null,"css":"border-width: var(--listed)"')], [false, true]);

const call = (source: string, path = 'App.svelte', hot = false) => /\$define_root_vars\((".*)\);/.exec(compile_source(source, path, 'gpuix-svelte/renderer', () => {}, hot))?.[1] ?? null;
const RED = '<div>x</div><style>:root { --a: red; }</style>';
const key = (registered: string | null) => registered?.split(',')[0];
check('the key is the file and not what it declares, so an edit replaces the rule', [key(call(RED)) === key(call(RED.replace('red', 'blue'))), call(RED) === call(RED.replace('red', 'blue')), key(call(RED)) === key(call(RED, 'Other.svelte'))], [true, false, false]);
check('a file that a reload evaluates again says so, and only that one', [call(RED, 'App.svelte', true)?.endsWith(', true'), call(RED)?.endsWith(']'), compile_svelte(FIXTURE, '?v=2').includes('}], true);')], [true, true, true]);
check('a component without a :root rule registers none', call('<div class="a">x</div><style>.a { color: red; }</style>'), null);

// --- the renderer ---------------------------------------------------------------
let ops: Mutation[] = [];
const apply_batch = TestGpuixRenderer.prototype.applyBatch;
TestGpuixRenderer.prototype.applyBatch = function (json) {
	ops.push(...(JSON.parse(json) as Mutation[]));
	return apply_batch.call(this, json);
};

const mount_warnings = capture();
const RootVars = (await import('./RootVars.svelte')).default;
check('the variables are there once the module is, with nothing mounted and no set_css_vars()', parse_css_text('color: var(--surface); padding: var(--pad)'), {
	color: '#101010',
	paddingTop: 4,
	paddingRight: 8,
	paddingBottom: 4,
	paddingLeft: 8
});
const { native } = mount_headless(RootVars, { width: 720, height: 520 });
console.warn = warn;

const style = (id: string) => find_test_id(id)?.style ?? {};
const pick = (id: string, ...keys: string[]) => keys.map((k) => style(id)[k] ?? null);
const id_of = (test_id: string) => find_test_id(test_id)?.id;
const restyled = () => new Set(ops.filter((op) => op[0] === 'setStyle').map((op) => op[1]));

// A poll is 100 ms, and a loaded Windows runner's timers are coarse.
async function until(done: () => boolean) {
	for (let waited = 0; waited < 2000 && !done(); waited += 25) await wait(25);
}

check('the headless window is wide enough for the fixture', native.getWindowSize().width >= 600, true);
check('a class rule reads them', pick('card', 'backgroundColor', 'paddingTop', 'paddingRight'), ['#101010', 4, 8]);
check('the file evaluated later wins, as the sheet a browser loaded later does', [pick('card', 'borderColor')[0], pick('child', 'color')[0], pick('card', 'outlineColor')[0]], ['#aaaaaa', '#aaaaaa', '#cccccc']);
check('a variable may read another, fall back, or come from :global(:root)', pick('derived', 'color', 'backgroundColor', 'borderColor'), ['#ff3e00', '#abcabc', '#0a0a0a']);
check('a variable refused on a class is not defined, and the :root half of a selector list is', [pick('scoped', 'margin', 'opacity'), pick('listed', 'borderWidth')], [[7, 0.5], [3]]);
check('nothing was reported undefined', undefined_vars(mount_warnings), []);

ops = [];
const idle = is_dirty();
set_css_vars({ surface: '#222222', js: '#111111', locked: '#00aa00' });
check('a change to the variables asks the frame loop for a commit', [idle, is_dirty()], [false, true]);
settle();
check('set_css_vars() outranks a :root rule, as the inline style it is in the DOM build', pick('card', 'backgroundColor'), ['#222222']);
check('and feeds a :root variable that reads it', pick('derived', 'backgroundColor'), ['#111111']);
check('but loses to a declaration marked !important', pick('locked', 'color'), ['#0000aa']);
check('only what reads a variable was restyled', [ops.every(([op]) => op === 'setStyle'), restyled().has(id_of('card')!), restyled().has(id_of('plain')!)], [true, true, false]);
set_css_vars({ surface: null, js: '' });
settle();
check('unsetting one gives the :root value back, and an empty string unsets too', [pick('card', 'backgroundColor')[0], pick('derived', 'backgroundColor')[0]], ['#101010', '#abcabc']);

check('a variable no sheet has declared yet falls back', pick('lazy', 'color'), ['#777777']);
await import('./RootVarsLazy.svelte');
settle();
check('a sheet loaded later restyles what reads it, and outranks the ones before it', [pick('lazy', 'color')[0], pick('card', 'borderColor')[0]], ['#123123', '#dddddd']);

check('a :root rule under @media waits for its query', pick('gap', 'gap'), [16]);
native.getWindowSize = () => ({ width: 500, height: 400 });
ops = [];
await until(() => style('gap').gap === 4);
check('and applies within a poll of the window narrowing, with no element under @media to keep it watched', pick('gap', 'gap'), [4]);
check('restyling what reads a variable', [restyled().has(id_of('gap')!), restyled().has(id_of('plain')!)], [true, false]);
native.getWindowSize = () => ({ width: 900, height: 500 });
await until(() => style('gap').gap === 16);
check('and back', pick('gap', 'gap'), [16]);

// --- render_hot -----------------------------------------------------------------
// Last, because on Bun every component loaded after the first reload counts as one a reload evaluates again.
const dir = new URL('./.hot-tmp/', import.meta.url);
const hot = new URL('HotRoot.svelte', dir);
const READS = '.hot { color: var(--hot-a, #fa11ba); border-width: var(--hot-b, 9px); background-color: var(--surface); outline-color: var(--hot-c, #c0ffee); border-color: var(--hot-order); }';
const write_hot = (script: string, markup: string, css: string) =>
	writeFileSync(hot, `${script}<div class="hot" testId="hot">hot</div>\n${markup}\n<style>\n${css}\n${READS}\n</style>\n`);
const PALETTE = "<script>import './HotPalette.svelte';</script>\n";
const reload = async (version: number) => (await import_fresh(hot, version)).default as AnyComponent;

mkdirSync(dir, { recursive: true });
try {
	writeFileSync(new URL('HotPalette.svelte', dir), '<div>palette</div>\n<style>:root { --hot-c: #cccccc; }</style>\n');
	// The cycle is here and not in the shared fixture, because happy-dom recurses on one until the stack runs out.
	write_hot(
		PALETTE,
		'<div class="gone" testId="gone">gone</div>',
		':root { --hot-a: #111111; --hot-b: 3px; --hot-d: #dddddd; --hot-order: #111111; --loop-a: var(--loop-b); --loop-b: var(--loop-a, #00ff00); }\n.gone { color: var(--hot-d); background-color: var(--loop-a, #0000ff); border-color: var(--loop-b); border-width: 1px; }'
	);
	const cyclic = capture();
	const first = mount_headless(await reload(1));
	console.warn = warn;
	check('a file under render_hot declares like any other', pick('hot', 'color', 'borderWidth', 'outlineColor', 'backgroundColor'), ['#111111', 3, '#cccccc', '#101010']);
	check('every variable of a cycle is invalid: a fallback is used, a bare read dropped, and neither is reported', [pick('gone', 'backgroundColor', 'borderColor', 'borderWidth'), undefined_vars(cyclic)], [['#0000ff', null, 1], []]);

	// A sheet that loaded after the hot file, and one that does not reload.
	define_root_vars('later', [{ vars: { 'hot-order': '#999999', 'hot-e': '#eeeeee' } }]);

	write_hot(PALETTE, '<div class="kept" testId="kept">kept</div>', ':root { --hot-a: #222222; --hot-order: #222222; }\n.kept { color: var(--hot-e); }');
	const edited = await reload(2);
	// As render() remounts: the old tree is unmounted and committed before the new one goes up.
	const outgoing = capture();
	await first.unmount();
	commit();
	console.warn = warn;
	check('the outgoing tree is not reported for reading a variable the edit removed', undefined_vars(outgoing), []);
	mount_headless(edited);
	check('an edited :root rule takes over: the new value in, the removed variable out', pick('hot', 'color', 'borderWidth'), ['#222222', 9]);
	check('in the place its file had, so a sheet loaded after it still wins', pick('hot', 'borderColor'), ['#999999']);

	const live = capture();
	define_root_vars('later', [{ vars: { 'hot-order': '#999999' } }]);
	settle();
	console.warn = warn;
	check('a tree that is up is reported, once', undefined_vars(live).filter((w) => w.includes('var(--hot-e)')).length, 1);

	write_hot('', '', '');
	const stripped = await reload(3);
	ops = [];
	mount_headless(stripped);
	check('a :root rule deleted from the file goes with the reload, as does the rule of a file no longer imported', pick('hot', 'color', 'outlineColor'), ['#fa11ba', '#c0ffee']);
	check('while a file that does not reload keeps what it declared', pick('hot', 'backgroundColor', 'borderColor'), ['#101010', '#999999']);
	check('and the new tree is styled once, not again for what the remount dropped', ops.filter((op) => op[0] === 'setStyle' && op[1] === id_of('hot')).length, 1);
} finally {
	rmSync(dir, { recursive: true, force: true });
}

TestGpuixRenderer.prototype.applyBatch = apply_batch;
finish('root-vars', 42);
