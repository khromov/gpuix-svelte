/**
 * `<Card --tint="red" />` compiles to an element around the component, `<svelte-css-wrapper style="display: contents">`
 * (a `<g>` where the compiler takes the markup for SVG), whose inline style declares the variables. A window has no
 * element without a box, so the renderer keeps the wrapper where Svelte put it in the shadow tree and gives it no native
 * node: its children are natively its parent's, which is the one place a node with no GPUI presence has children of its
 * own. An element the app itself names `<g>` or `<svelte-css-wrapper>` is none of that.
 */

import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TestGpuixRenderer } from '@gpuix/native';
import { commit, is_dirty, renderer, type AnyComponent, type Mutation, type ShadowNode } from 'gpuix-svelte';
import { flushSync } from 'svelte';
import { compile_svelte } from '../src/compile.ts';
import { import_fresh } from '../src/hot.ts';
import { mount_headless, bounds, click, find_test_id, settle, tree, check, finish, type TreeNode } from 'gpuix-svelte/test';

const code = compile_svelte(fileURLToPath(new URL('./StyleProps.svelte', import.meta.url)));
check("the compiler puts its own wrapper around the component, and reaches the anchor in it as a DOM node's lastChild", [code.includes("'svelte-css-wrapper'"), /\$\.css_props\((\w+),[^]*?\(\1\.lastChild,/.test(code)], [true, true]);

let ops: Mutation[] = [];
const apply_batch = TestGpuixRenderer.prototype.applyBatch;
TestGpuixRenderer.prototype.applyBatch = function (json) {
	ops.push(...(JSON.parse(json) as Mutation[]));
	return apply_batch.call(this, json);
};

const errors: string[] = [];
const error = console.error;
console.error = (...args) => errors.push(args.map(String).join(' '));
const warnings: string[] = [];
const warn = console.warn;
console.warn = (message) => warnings.push(String(message));

const StyleProps = (await import('./StyleProps.svelte')).default;
const { native, root, component, unmount } = mount_headless(StyleProps, { width: 720, height: 520 });

const bg = (id: string) => find_test_id(id)?.style?.backgroundColor ?? null;
const color = (id: string) => find_test_id(id)?.style?.color ?? null;
const children = (id: string) => find_test_id(id)?.children ?? [];
const names = (id: string) => children(id).map((c) => c.testId ?? c.type);
const native_ids = (id: string) => children(id).map((c) => c.id).sort();
const count = (node: TreeNode): number => 1 + (node.children ?? []).reduce((n, c) => n + count(c), 0);
const box = (id: string) => bounds(find_test_id(id)!)!;
function within(id: string, row: string) {
	const [inner, outer] = [box(id), box(row)];
	return { x: inner.x - outer.x, y: inner.y - outer.y, width: inner.width, height: inner.height };
}
function act(run: () => void) {
	ops = [];
	run();
	flushSync();
	settle();
}
const restyles = () => ops.filter(([op]) => op === 'setStyle').length;
const tag_warnings = (tag: string) => warnings.filter((w) => w.includes(`<${tag}> has no GPUI equivalent`)).length;

check('nothing warned of a tag with no GPUI equivalent', warnings, []);
const styled = new Map<number, number>();
for (const op of ops) if (op[0] === 'setStyle') styled.set(op[1], (styled.get(op[1]) ?? 0) + 1);
check('mounting styled each element once, the ones a wrapper holds included', [styled.has(find_test_id('s')!.id), Math.max(...styled.values())], [true, 1]);
check('the variable reaches both roots of the component', [bg('s'), bg('s-tail'), bg('p')], ['#cc0000', '#cc0000', '#000001']);
check('whose boxes lie as they do without a style prop: one growing, one a percentage of the row', [within('s', 'styled'), within('s-tail', 'styled')], [within('p', 'plain'), within('p-tail', 'plain')]);
check('and that is a layout a box around them would change', [within('p', 'plain'), within('p-tail', 'plain')], [
	{ x: 60, y: 0, width: 350, height: 20 },
	{ x: 420, y: 0, width: 120, height: 10 }
]);
check('the row has no native child for the wrapper', [names('styled'), box('styled').height], [names('plain').map((name) => name.replace(/^p/, 's')), box('plain').height]);

check('each row of a keyed {#each} has its own value, in document order', [names('list'), ['r', 'r-tail', 'g', 'b'].map(bg)], [
	['r', 'r-tail', 'g', 'g-tail', 'b', 'b-tail'],
	['#ff0000', '#ff0000', '#00ff00', '#0000ff']
]);
check('a wrapper inside a wrapper keeps its place between fixed neighbours', names('deep'), ['deep-first', 'deep-r', 'deep-r-tail', 'deep-g', 'deep-g-tail', 'deep-b', 'deep-b-tail', 'deep-last']);
check('and hands the variable through', [bg('deep-r'), bg('deep-g-tail')], ['#ff0000', '#00ff00']);
const before = [native_ids('list'), native_ids('deep'), count(tree())];
act(() => component.reverse());
check('a reorder moves the rows', names('list'), ['b', 'b-tail', 'g', 'g-tail', 'r', 'r-tail']);
check('two wrappers deep as well', names('deep'), ['deep-first', 'deep-b', 'deep-b-tail', 'deep-g', 'deep-g-tail', 'deep-r', 'deep-r-tail', 'deep-last']);
check('by moving their native nodes, not by making new ones', [native_ids('list'), native_ids('deep'), count(tree())], before);
check('and they keep their colours', ['r', 'g', 'b-tail', 'deep-b'].map(bg), ['#ff0000', '#00ff00', '#0000ff', '#0000ff']);
check('which nothing was restyled for, the rows having the parent they had', [restyles(), ops.some(([op]) => op === 'insertBefore' || op === 'appendChild')], [0, true]);
act(() => component.prepend());
check('a new row lands first, coloured', [names('list').slice(0, 3), names('deep').slice(0, 3), bg('n'), bg('deep-n-tail')], [['n', 'n-tail', 'b'], ['deep-first', 'deep-n', 'deep-n-tail'], '#ffffff', '#ffffff']);

check('under {#if} the component sits between its siblings', names('cond'), ['first', 'shown', 'shown-tail', 'last']);
check('a portal in the component reads it from where it was written, though it hangs off the root', [color('ported'), (tree().children ?? []).some((child) => child.children?.some((inner) => inner.testId === 'ported'))], ['#abcdef', true]);
act(() => component.toggle());
check('leaves nothing behind when the block closes', [names('cond'), find_test_id('ported')], [['first', 'last'], null]);
const destroyed = ops.filter((op) => op[0] === 'destroyElement').map((op) => op[1]);
check('each native node destroyed once, the portal too', [destroyed.length, new Set(destroyed).size], [3, 3]);
act(() => component.toggle());
check('and comes back in place, coloured', [names('cond'), bg('shown'), color('ported')], [['first', 'shown', 'shown-tail', 'last'], '#123456', '#abcdef']);
act(() => component.expand());
check('an element the component renders later reads the variable too', color('shown-more'), '#123456');

act(() => component.recolor('#654321'));
check('a new value restyles the component', [bg('shown'), bg('shown-tail'), color('shown-more')], ['#654321', '#654321', '#654321']);
check('and nothing but the three elements in it that read a variable', [ops.length, restyles()], [3, 3]);
act(() => component.recolor(null));
check('null takes the variable away', bg('shown'), '#000001');
const idle = is_dirty();
component.recolor('#0a0a0a');
flushSync();
check('a value brings it back, asking the frame loop for the commit that no mutation of the wrapper would', [idle, is_dirty()], [false, true]);
settle();
check('which restyles the component', bg('shown'), '#0a0a0a');
act(() => component.repaint());
check('two style props that change together restyle each of the two readers once, not once per prop', [bg('both'), bg('both-tail'), ops.length, restyles()], ['#303030', '#303030', 2, 2]);

check('a component given none reads the declaration around it', bg('inherits'), '#aaaaaa');
check('a style prop outranks that declaration', bg('overrides'), '#bbbbbb');
check("and reaches the parent's own markup rendered inside the component", [bg('slotted'), color('slot')], ['#cccccc', '#cccccc']);
check('its value may read a variable declared around the component', bg('reads-around'), '#dddddd');

type Shape = { type: string; children?: Shape[] };
const shape = ({ type, children }: Shape): Shape => ({ type, children: children?.map(shape) });
const as_shipped = (id: string, node = JSON.parse(native.getTreeJson()) as TreeNode): TreeNode | null =>
	node.testId === id ? node : (node.children ?? []).reduce<TreeNode | null>((found, child) => found ?? as_shipped(id, child), null);
check('text the component writes into a <text> stays that element\'s own string, with no wrapper of ours', [shape(as_shipped('label-styled')!), shape(as_shipped('label-plain')!)], [
	{ type: 'text', children: [{ type: 'text' }] },
	{ type: 'text', children: [{ type: 'text' }] }
]);
const in_tree = (name: string, from: ShadowNode | null = root): ShadowNode | null => (from === null ? null : from.name === name ? from : (in_tree(name, from.first) ?? in_tree(name, from.next)));
check('where the compiler takes the markup for SVG and wraps in a <g>, and that declares the variable all the same', [...(in_tree('g')?.vars ?? [])], [['tint', '#010203']]);
const beside = compile_svelte(fileURLToPath(new URL('./StylePropsBeside.svelte', import.meta.url)));
check('as it does beside a <text> in a fragment with no other element, where a <g> is no more of a box', [/\['g',\s*null,,\s*\]/.test(beside), names('beside-row'), bg('beside'), bg('beside-tail')], [
	true,
	['beside-label', 'beside', 'beside-tail'],
	'#040506',
	'#040506'
]);

const wrapper = renderer.createElement('svelte-css-wrapper') as ShadowNode & { lastChild: ShadowNode | null };
renderer.setAttribute(wrapper, 'testId', 'named');
const parked = renderer.createElement('div');
renderer.setAttribute(parked, 'testId', 'parked');
renderer.insert(wrapper, parked, null);
renderer.insert(root, wrapper, null);
settle();
const as_written = [find_test_id('named')?.type, names('named'), tag_warnings('svelte-css-wrapper')];
const parked_id = parked.nativeId;
// The compiled code's read, which is what tells Svelte's wrapper from an element the app gave its name.
void wrapper.lastChild;
settle();
check("an element with the wrapper's name is a <div> like any unknown tag, until that read makes it the wrapper and hands its children to its parent", [as_written, find_test_id('named'), (tree().children ?? []).some((child) => child.testId === 'parked'), parked.nativeId === parked_id], [
	['div', ['parked'], 1],
	null,
	true,
	true
]);
const shown = find_test_id('parked') !== null;
renderer.insert(renderer.createElement('div'), wrapper, null);
settle();
check('a wrapper moved out of the tree takes the native nodes of its children with it', [shown, find_test_id('parked'), parked.nativeId], [true, null, null]);

await unmount();
commit();
check('unmounting destroys every native node, each once', [tree().children ?? [], errors], [[], []]);

// --- render_hot -----------------------------------------------------------------
// Last, because on Bun every component loaded after the first reload counts as one a reload evaluates again.
const dir = new URL('./.hot-tmp/', import.meta.url);
const hot = new URL('HotStyleProps.svelte', dir);
const write_hot = (prop: string) => writeFileSync(hot, `<script>import ScopedCard from './ScopedCard.svelte';</script>\n<div testId="host"><ScopedCard id="hot"${prop} /></div>\n`);
const reload = async (version: number) => (await import_fresh(hot, version)).default as AnyComponent;

mkdirSync(dir, { recursive: true });
try {
	// Written here because svelte-check knows no <g>, and loaded before the first reload.
	writeFileSync(
		new URL('Authored.svelte', dir),
		`<script>\n\tlet clicks = $state(0);\n\texport const heard = () => clicks;\n</script>\n\n<div testId="around"><g testId="group" style="width: 40px; height: 30px" onclick={() => clicks++}><div testId="in-group" style="width: 10px; height: 10px"></div></g></div>\n`
	);
	const authored = mount_headless<{ heard(): number }>((await import(new URL('Authored.svelte', dir).href)).default);
	click(find_test_id('group')!);
	check('a <g> the app wrote is no wrapper either: it is the <div> the warning says, with its style, its child and its listener', [find_test_id('group')?.type, box('group').width, names('around'), names('group'), authored.component.heard(), tag_warnings('g')], [
		'div',
		40,
		['group'],
		['in-group'],
		1,
		1
	]);
	await authored.unmount();
	commit();

	copyFileSync(new URL('./ScopedCard.svelte', import.meta.url), new URL('ScopedCard.svelte', dir));
	write_hot(' --tint="#111111"');
	const first = mount_headless(await reload(1));
	check('a file under render_hot takes a style prop like any other', bg('hot'), '#111111');
	write_hot(' --tint="#222222"');
	const edited = await reload(2);
	await first.unmount();
	commit();
	const second = mount_headless(edited);
	check('an edited one shows after the reload', bg('hot'), '#222222');
	write_hot('');
	const stripped = await reload(3);
	await second.unmount();
	commit();
	mount_headless(stripped);
	check('and a deleted one is gone, the component in the same place', [bg('hot'), names('host')], ['#000001', ['hot', 'hot-tail']]);
} finally {
	rmSync(dir, { recursive: true, force: true });
}

console.error = error;
console.warn = warn;
TestGpuixRenderer.prototype.applyBatch = apply_batch;
finish('style-props', 42);
