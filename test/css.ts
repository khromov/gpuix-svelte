/**
 * A `<style>` block never reaches GPUI as CSS: compile.ts turns its class rules
 * into a sheet the renderer merges on every `class` change, weakest rule first
 * and inline `style` last. This checks both halves against a real tree.
 */

import { fileURLToPath } from 'node:url';
import { compile_svelte } from '../src/compile.ts';
import type { GpuiStyle } from 'gpuix-svelte';
import { mount_headless, element_of, find_all, click_text, check, finish } from 'gpuix-svelte/test';

const FIXTURE = fileURLToPath(new URL('./Styled.svelte', import.meta.url));

// --- compile half ------------------------------------------------------------
const warnings: string[] = [];
const warn = console.warn;
console.warn = (message) => warnings.push(String(message));
const code = compile_svelte(FIXTURE);
console.warn = warn;

const refused = warnings.filter((w) => w.includes('has no GPUI equivalent'));
check('the sheet registers under the scope class', /\$define_styles\("svelte-[a-z0-9]+"/.test(code), true);
check('a descendant selector is refused at compile time', refused.some((w) => w.includes('`.card .title`')), true);
check('so is a pseudo-class named like an Object.prototype key', refused.some((w) => w.includes('`.btn:constructor`')), true);
check('so is a second pseudo-class on one selector', refused.some((w) => w.includes('`.btn:hover:active`')), true);
check('so is a pseudo-class with no class or tag', refused.some((w) => w.includes('`:hover`')), true);
check('so is an at-rule other than @media', refused.some((w) => w.includes('`@supports (display: flex)`')), true);
check('so is a nested rule', refused.some((w) => w.includes('`&:hover { … } (nested)`')), true);
check('every other selector is accepted', refused.length, 6);
check('each refusal names the file', refused.every((w) => w.includes(FIXTURE)), true);

// The appended import must survive the cache-buster pass, and stay unbusted itself.
const busted = compile_svelte(FIXTURE, '?v=7');
check('the sheet registration survives a hot reload', /\$define_styles\("svelte-/.test(busted), true);
check('the renderer specifier stays stable', busted.includes("'gpuix-svelte/renderer'") && busted.includes('"gpuix-svelte/renderer"'), true);
check('nothing in the appended code got busted', busted.includes('renderer?v='), false);

// --- runtime half ------------------------------------------------------------
const Styled = (await import('./Styled.svelte')).default;
mount_headless(Styled);

const pick = (style: GpuiStyle | undefined, ...keys: string[]) => keys.map((k) => style![k] ?? null);

check(
	'a class rule lands, shorthand expanded, and the tag rule stacks under it',
	pick(element_of('toggle')!.style!, 'color', 'paddingTop', 'paddingRight', 'gap', 'backgroundColor'),
	['red', 4, 8, 4, null]
);
check(':hover becomes the native hover style', element_of('toggle')!.style!.hover?.color, 'blue');
check(':active becomes the native active style', element_of('toggle')!.style!.active?.color, 'yellow');
check('inline style wins over the class', pick(element_of('inline')!.style!, 'color', 'paddingTop'), ['#000000', 4]);
check('the hover attribute wins over :hover', element_of('attr')!.style!.hover?.color, '#ffffff');
check('the pseudo attributes need no rule behind them', [element_of('no rule')!.style!.hover?.color, element_of('no rule')!.style!.active?.color], ['#111111', '#222222']);
check(':focus-visible becomes the native focusVisible style', element_of('toggle')!.style!.focusVisible?.outlineWidth, 2);
check(
	'the focus-visible attribute merges over it',
	pick(element_of('focus')!.style!.focusVisible, 'outlineWidth', 'outlineColor'),
	[2, '#ffffff']
);
check('a compound selector beats a single class whatever the source order', element_of('compound')!.style!.color, 'green');
// A tag narrows a selector, so `div.tagged` outranks the `.tagged` declared after it.
check('a tag alongside the class outranks the class alone', element_of('tagged')!.style!.color, 'teal');
check('a tag rule leaves other tags alone', pick(element_of('other tag')!.style!, 'color', 'gap'), ['red', null]);
check('among equal selectors the later rule wins, whatever the class order', element_of('same weight')!.style!.color, 'navy');
check('a selector list applies to each selector in it', [element_of('first')!.style!.opacity, element_of('second')!.style!.opacity], [0.25, 0.25]);
check('a dynamic class matches', element_of('dynamic')!.style!.opacity, 0.5);
// Across the tree, because a combinator compiled by mistake could land on either of its two compounds.
check('the refused rule never applies', find_all((n) => n.style?.fontSize != null).length, 0);

// One element each, because any one attribute restyling would pick up all the others already set.
const changing = () => [
	element_of('changing style')!.style!.opacity ?? null,
	element_of('changing hover')!.style!.hover?.color ?? null,
	element_of('changing active')!.style!.active?.color ?? null,
	element_of('changing focus-visible')!.style!.focusVisible?.color ?? null
];

click_text('toggle');
check('class:on toggling on restyles', element_of('toggle')!.style!.backgroundColor, '#333333');
check('setting style, hover, active or focus-visible restyles', changing(), [0.75, '#333333', '#444444', '#555555']);
click_text('toggle');
check('class:on toggling off restyles', element_of('toggle')!.style!.backgroundColor ?? null, null);
check('removing them restyles', changing(), [null, null, null, null]);

click_text('dynamic');
check('swapping the class string restyles', element_of('dynamic')!.style!.opacity, 1);

finish('css', 32);
