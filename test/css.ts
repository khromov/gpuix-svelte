/**
 * A `<style>` block never reaches GPUI as CSS: compile.ts turns its class rules
 * into a sheet the renderer merges on every `class` change, weakest rule first
 * and inline `style` last. This checks both halves against a real tree.
 */

import { fileURLToPath } from 'node:url';
import { compile_svelte } from '../src/compile.ts';
import type { GpuiStyle } from 'gpuix-svelte';
import { mount_headless, element_of, click_text, check, finish } from 'gpuix-svelte/test';

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
check('every other selector is accepted', refused.length, 1);

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
check('inline style wins over the class', pick(element_of('inline')!.style!, 'color', 'paddingTop'), ['#000000', 4]);
check('the hover attribute wins over :hover', element_of('attr')!.style!.hover?.color, '#ffffff');
check('a compound selector beats a single class whatever the source order', element_of('compound')!.style!.color, 'green');
check('a dynamic class matches', element_of('dynamic')!.style!.opacity, 0.5);
check('the refused rule never applies', element_of('nested')!.style!.fontSize ?? null, null);

click_text('toggle');
check('class:on toggling on restyles', element_of('toggle')!.style!.backgroundColor, '#333333');
click_text('toggle');
check('class:on toggling off restyles', element_of('toggle')!.style!.backgroundColor ?? null, null);

click_text('dynamic');
check('swapping the class string restyles', element_of('dynamic')!.style!.opacity, 1);

finish('css');
