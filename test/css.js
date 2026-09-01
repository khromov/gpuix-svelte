/**
 * A `<style>` block never reaches GPUI as CSS: compile.js turns its class rules
 * into a sheet the renderer merges on every `class` change, weakest rule first
 * and inline `style` last. This checks both halves against a real tree.
 */

import { fileURLToPath } from 'node:url';
import { TestGpuixRenderer } from '@gpuix/native';
import { mount, flushSync } from 'svelte';
import renderer, { set_native, create_root, commit, dispatch } from '../src/renderer.js';
import { compile_svelte } from '../src/compile.js';

const FIXTURE = fileURLToPath(new URL('./Styled.svelte', import.meta.url));

let failures = 0;

function check(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}\n       want ${JSON.stringify(expected)}\n       got  ${JSON.stringify(actual)}`);
}

// --- compile half ------------------------------------------------------------
const warnings = [];
const warn = console.warn;
console.warn = (message) => warnings.push(String(message));
const code = compile_svelte(FIXTURE);
console.warn = warn;

const refused = warnings.filter((w) => w.includes('has no GPUI equivalent'));
check('the sheet registers under the scope class', /\$define_styles\("svelte-[a-z0-9]+"/.test(code), true);
check('a descendant selector is refused at compile time', refused.some((w) => w.includes('`.card .title`')), true);
check('every other selector is accepted', refused.length, 1);

// The appended import must survive the cache-buster pass, and stay unbusted itself.
const busted = compile_svelte(FIXTURE, '?v=7');
check('the sheet registration survives a hot reload', /\$define_styles\("svelte-/.test(busted), true);
check('the renderer specifier stays stable', busted.includes("'gpuix-svelte/renderer'") && busted.includes('"gpuix-svelte/renderer"'), true);
check('nothing in the appended code got busted', busted.includes('renderer?v='), false);

// --- runtime half ------------------------------------------------------------
const native = new TestGpuixRenderer();
set_native(native);
const root = create_root();
const anchor = renderer.createComment('');
renderer.insert(root, anchor, null);

const Styled = (await import('./Styled.svelte')).default;
mount(Styled, { renderer, target: root, anchor, props: {} });
flushSync();
commit();
native.flush();

/** The element around the text node with this content, as GPUI holds it. */
function element(content) {
	let found = null;
	(function walk(n, parent) {
		if (!n || found !== null) return;
		if (n.type === 'text' && n.text === content) found = parent;
		for (const c of n.children ?? []) walk(c, n);
	})(JSON.parse(native.getTreeJson()), null);
	return found;
}

const pick = (style, ...keys) => keys.map((k) => style[k] ?? null);

function click(content) {
	dispatch({ elementId: element(content).id, eventType: 'click' });
	flushSync();
	commit();
	native.flush();
}

check(
	'a class rule lands, shorthand expanded, and the tag rule stacks under it',
	pick(element('toggle').style, 'color', 'paddingTop', 'paddingRight', 'gap', 'backgroundColor'),
	['red', 4, 8, 4, null]
);
check(':hover becomes the native hover style', element('toggle').style.hover?.color, 'blue');
check('inline style wins over the class', pick(element('inline').style, 'color', 'paddingTop'), ['#000000', 4]);
check('the hover attribute wins over :hover', element('attr').style.hover?.color, '#ffffff');
check('a compound selector beats a single class whatever the source order', element('compound').style.color, 'green');
check('a dynamic class matches', element('dynamic').style.opacity, 0.5);
check('the refused rule never applies', element('nested').style.fontSize ?? null, null);

click('toggle');
check('class:on toggling on restyles', element('toggle').style.backgroundColor, '#333333');
click('toggle');
check('class:on toggling off restyles', element('toggle').style.backgroundColor ?? null, null);

click('dynamic');
check('swapping the class string restyles', element('dynamic').style.opacity, 1);

if (failures > 0) {
	console.error(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log('\ncss ok');
