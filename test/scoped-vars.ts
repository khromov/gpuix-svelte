/**
 * A variable declared on an element, by a class rule or its inline style, is that element's and everything
 * inside it, as a custom property inherits in a browser. So one rule resolves differently from one
 * element to the next, and whatever changes what an element declares, or which elements are around
 * a reader, has to restyle the readers below it and nothing else.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TestGpuixRenderer } from '@gpuix/native';
import { build_style, commit, parse_css_text, renderer, set_css_vars, type AnyComponent, type Mutation, type ShadowNode, type StyleRule } from 'gpuix-svelte';
import { flushSync } from 'svelte';
import { compile_svelte } from '../src/compile.ts';
import { import_fresh } from '../src/hot.ts';
import { mount_headless, find, find_test_id, settle, wait, check, finish } from 'gpuix-svelte/test';

const FIXTURE = fileURLToPath(new URL('./ScopedVars.svelte', import.meta.url));

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

check('a rule that only declares variables ships, with them named without the --', code.includes('"classes":["themed"],"tag":null,"pseudo":null,"style":{},"vars":{"tint":"#aa0000"}'), true);
check('one that also styles keeps both halves', code.includes('"css":"color: var(--own); padding: var(--own-pad)","vars":{"own":"#000003","own-pad":"6px"}'), true);
check('under @media it carries the query', code.includes('"vars":{"space":"4px"},"media":["(max-width: 599px)"]'), true);
check('!important is taken off, as off any declaration that is not in :root', code.includes('"vars":{"pinned":"#aa5500"}'), true);
const refused = compile_warnings.filter((w) => w.includes('has no GPUI equivalent'));
check('a variable under :hover is refused, naming it, and nothing else is', [refused.length, refused[0]?.includes('`.reader:hover { --tint }`')], [1, true]);
check('while the rule keeps what it styles', [code.includes('"pseudo":"hover","style":{"opacity":0.5}}'), code.includes('#ffffff')], [true, false]);

// --- the renderer ---------------------------------------------------------------
let ops: Mutation[] = [];
const apply_batch = TestGpuixRenderer.prototype.applyBatch;
TestGpuixRenderer.prototype.applyBatch = function (json) {
	ops.push(...(JSON.parse(json) as Mutation[]));
	return apply_batch.call(this, json);
};

const mount_warnings = capture();
const ScopedVars = (await import('./ScopedVars.svelte')).default;
const { native, root, component } = mount_headless(ScopedVars, { width: 720, height: 520 });
console.warn = warn;

const style = (id: string) => find_test_id(id)?.style ?? {};
const pick = (id: string, ...keys: string[]) => keys.map((k) => style(id)[k] ?? null);
const bg = (id: string) => pick(id, 'backgroundColor')[0];
const color = (id: string) => pick(id, 'color')[0];
const id_of = (test_id: string) => find_test_id(test_id)?.id;
const restyled = () => new Set(ops.filter((op) => op[0] === 'setStyle').map((op) => op[1]));
function act(run: () => void) {
	ops = [];
	run();
	flushSync();
	settle();
}

check('the headless window is wide enough for the fixture', native.getWindowSize().width >= 600, true);
check('outside any declaring element a variable is the :root one', [bg('outside'), bg('outside-tail')], ['#00aa00', '#00aa00']);
check('a class rule declares it for the elements inside, a child component\'s included', [color('reader'), bg('by-class'), bg('by-class-tail')], ['#aa0000', '#aa0000', '#aa0000']);
check('an inline style declares it too, and the nearest declaration wins', bg('by-inline'), '#0000bb');
check('which is no style of its own, so nothing ships for it', parse_css_text('--tint: #aa0000; color: #010101'), { color: '#010101' });

const rule: StyleRule = { pseudo: null, css: 'color: var(--cached, #0f0f0f)' };
const declaring = { vars: new Map([['cached', '#1f1f1f']]), parent: null };
build_style({}, [rule], { vars: null, parent: null });
const parsed = rule.resolved;
build_style({}, [rule], { vars: null, parent: null });
check('a rule is parsed once for the elements no declaration reaches', [parsed, rule.resolved === parsed], [{ color: '#0f0f0f' }, true]);
check('and for itself by each element one does reach, leaving that parse be', [build_style({}, [rule], { vars: null, parent: declaring }), rule.resolved === parsed], [{ color: '#1f1f1f' }, true]);
check('a fallback reads it from there as well', pick('reader', 'borderColor'), ['#aa0000']);
check('an <svg> takes the colour its parent read from the variable', color('icon'), '#aa0000');
check('an element reads what it declares itself, the inline style over the rule', pick('self', 'color', 'padding'), ['#5e1f00', 6]);
check('a variable that reads another is worked out where it is declared, not where it is read', pick('computed', 'color', 'backgroundColor'), ['#111111', '#222222']);
check('a declaration on the element outranks a :root one marked !important', color('pinned'), '#aa5500');
check('a variable no element around the reader declares is reported, once, and one declared around it is not', [undefined_vars(mount_warnings).length, undefined_vars(mount_warnings)[0]?.includes('var(--own)')], [1, true]);

act(() => set_css_vars({ tint: '#123123', pinned: '#00ff00', free: '#313131' }));
check('set_css_vars() reaches a reader outside', bg('outside'), '#123123');
check('and one inside a declaring element, for a variable nothing nearer declares', color('free'), '#313131');
check('but an element\'s own declaration outranks it', [bg('by-class'), color('pinned')], ['#aa0000', '#aa5500']);
act(() => set_css_vars({ tint: null, pinned: null, free: null }));

act(() => component.set_alt(true));
check('a class change on the declaring element restyles what reads the variable below it', [color('reader'), color('icon'), bg('by-class'), bg('by-class-tail')], ['#aa00aa', '#aa00aa', '#aa00aa', '#aa00aa']);
check('leaving a nearer declaration its say', bg('by-inline'), '#0000bb');
check('and restyling no reader outside it, nor an element that reads no variable', [restyled().has(id_of('reader')!), restyled().has(id_of('outside')!), restyled().has(id_of('static')!)], [true, false, false]);

act(() => component.set_inline('#00bbbb'));
check('a change to an inline declaration does the same', [bg('by-inline'), bg('by-inline-tail')], ['#00bbbb', '#00bbbb']);
check('for the readers below that element alone', [restyled().has(id_of('by-inline')!), restyled().has(id_of('by-class')!)], [true, false]);
act(() => component.set_inline(null));
check('taking the declaration away gives the one further out its say', bg('by-inline'), '#aa00aa');
act(() => component.set_themed(false));
check('and with none left, the :root one', [color('reader'), bg('by-class'), bg('by-inline')], ['#00aa00', '#00aa00', '#00aa00']);
act(() => {
	component.set_themed(true);
	component.set_alt(false);
});
check('a declaration that comes back applies again', [color('reader'), bg('by-inline')], ['#aa0000', '#aa0000']);

// A poll is 100 ms, and a loaded Windows runner's timers are coarse.
async function until(done: () => boolean) {
	for (let waited = 0; waited < 2000 && !done(); waited += 25) await wait(25);
}
check('a declaration under @media waits for its query', pick('gap', 'gap'), [16]);
native.getWindowSize = () => ({ width: 500, height: 400 });
await until(() => style('gap').gap === 4);
check('and restyles the readers below when the window narrows', pick('gap', 'gap'), [4]);
native.getWindowSize = () => ({ width: 900, height: 500 });
await until(() => style('gap').gap === 16);
check('and when it widens again', pick('gap', 'gap'), [16]);

// --- nodes of the test's own, for what Svelte's own moves never do ---------------
function element(css: string, parent: ShadowNode | null = null) {
	const el = renderer.createElement('div');
	renderer.setAttribute(el, 'style', css);
	if (parent) renderer.insert(parent, el, null);
	return el;
}
const shipped = (el: ShadowNode, key: string) => find((n) => n.id === el.nativeId)?.style?.[key] ?? null;

const a = element('--v: #0a0a0a', root);
const b = element('--v: #0b0b0b', root);
const moved = element('color: var(--v)', a);
settle();
check('a reader takes the declaration of the element it is in', shipped(moved, 'color'), '#0a0a0a');
renderer.insert(b, moved, null);
settle();
check('and of the one it is moved into', shipped(moved, 'color'), '#0b0b0b');

renderer.remove(a);
renderer.insert(a, moved, null);
settle();
renderer.removeAttribute(a, 'style');
const returned = capture();
renderer.insert(root, a, null);
settle();
console.warn = warn;
check('an element that lost its declaration while out of the tree declares nothing when it is back', [shipped(moved, 'color'), a.vars], [null, null]);
check('which is reported like any undefined variable', undefined_vars(returned).filter((w) => w.includes('var(--v)')).length, 1);

const around = element('--across-b: var(--across-none, #0c0c0c)', root);
const across = element('--across-a: var(--across-b)', around);
const within = element('--across-b: var(--across-a)', across);
const crossing = element('color: var(--across-b)', within);
const loop = element('--loop-x: var(--loop-y); --loop-y: var(--loop-x)', root);
const looping = element('color: var(--loop-x, #0d0d0d); border-color: var(--loop-y); border-width: 1px', loop);
const cyclic = capture();
settle();
console.warn = warn;
check('a variable that reads its own name off an element further out is no cycle', shipped(crossing, 'color'), '#0c0c0c');
check('on one element they are: a fallback is used, a bare read dropped, and neither is reported', [shipped(looping, 'color'), shipped(looping, 'borderColor'), shipped(looping, 'borderWidth'), undefined_vars(cyclic)], ['#0d0d0d', null, 1, []]);

const late = element('', root);
const early = element('', late);
settle();
const racing = capture();
renderer.setAttribute(early, 'style', 'color: var(--raced)');
renderer.setAttribute(late, 'style', '--raced: #0e0e0e');
settle();
console.warn = warn;
check('a variable declared around a reader later in the same frame is not reported', [shipped(early, 'color'), undefined_vars(racing)], ['#0e0e0e', []]);

// --- render_hot -----------------------------------------------------------------
// Last, because on Bun every component loaded after the first reload counts as one a reload evaluates again.
const dir = new URL('./.hot-tmp/', import.meta.url);
const hot = new URL('HotScoped.svelte', dir);
const write_hot = (declaration: string) =>
	writeFileSync(hot, `<div class="box"><div class="in" testId="hot">hot</div></div>\n<style>\n.box { ${declaration} width: 10px; }\n.in { color: var(--hot-tint, #0f0f0f); }\n</style>\n`);
const reload = async (version: number) => (await import_fresh(hot, version)).default as AnyComponent;

mkdirSync(dir, { recursive: true });
try {
	write_hot('--hot-tint: #111111;');
	const first = mount_headless(await reload(1));
	check('a file under render_hot declares like any other', color('hot'), '#111111');
	write_hot('--hot-tint: #222222;');
	const edited = await reload(2);
	await first.unmount();
	commit();
	const second = mount_headless(edited);
	check('an edited declaration shows after the reload', color('hot'), '#222222');
	write_hot('');
	const stripped = await reload(3);
	await second.unmount();
	commit();
	mount_headless(stripped);
	check('and a deleted one is gone with it', color('hot'), '#0f0f0f');
} finally {
	rmSync(dir, { recursive: true, force: true });
}

TestGpuixRenderer.prototype.applyBatch = apply_batch;
finish('scoped-vars', 43);
