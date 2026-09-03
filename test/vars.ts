/**
 * Class rules are compiled ahead of time, so a `var()` in one has to survive to
 * the runtime as text and resolve against a map JS controls — a theme is then
 * one `set_css_vars()` call restyling every element that read a variable. An
 * undefined one is reported at the commit, not where it was read, since a palette
 * handed over from an `$effect` lands after the tree is styled.
 */

import { fileURLToPath } from 'node:url';
import { set_css_vars, type GpuiStyle, type Mutation } from 'gpuix-svelte';
import { compile_svelte } from '../src/compile.ts';
import { mount_headless, element_of, click_text, settle, check, finish } from 'gpuix-svelte/test';

const FIXTURE = fileURLToPath(new URL('./Vars.svelte', import.meta.url));

// --- compile half ------------------------------------------------------------
const code = compile_svelte(FIXTURE);
check('a rule that reads a var() ships as CSS text', code.includes('"css":"background-color: var(--surface); padding: var(--pad); color: red"'), true);
check('a rule without one is still pre-parsed', code.includes('"style":{"gap":2}'), true);

// --- runtime half ------------------------------------------------------------
set_css_vars({ surface: '#111111', raised: '#222222', pad: '12px 24px', accent: '#abcdef' });

const warnings: string[] = [];
const warn = console.warn;
console.warn = (message) => warnings.push(String(message));
const Vars = (await import('./Vars.svelte')).default;
const { native } = mount_headless(Vars);
console.warn = warn;

const pick = (style: GpuiStyle | undefined, ...keys: string[]) => keys.map((k) => style![k] ?? null);

const card = element_of('card')!;
check('a colour var resolves in a class rule', card.style!.backgroundColor, '#111111');
check('a var on a pixel-only key resolves, shorthand expanded', pick(card.style!, 'paddingTop', 'paddingRight'), [12, 24]);
check(':hover resolves too', card.style!.hover?.backgroundColor, '#222222');
check('plain declarations in the same rule survive', card.style!.color, 'red');
check('the fallback is used when the var is undefined', element_of('fallback')!.style!.color, '#123456');
check('an undefined var without a fallback drops that declaration only', pick(element_of('missing')!.style!, 'color', 'borderWidth'), [null, 1]);
check('and warns once, naming it', warnings.filter((w) => w.includes('var(--absent)')).length, 1);
check('a palette set from an $effect is not a false alarm', warnings.filter((w) => w.includes('var(--late)')).length, 0);
check('and the first paint already carries it', element_of('late')!.style!.color, '#0f0f0f');
check('an inline style resolves as well', element_of('inline')!.style!.color, '#abcdef');

click_text('card');
check('a later class change still resolves', pick(element_of('card')!.style!, 'padding', 'paddingTop', 'backgroundColor'), [20, null, '#111111']);

let ops = null as Mutation[] | null;
const applyBatch = native.applyBatch.bind(native);
native.applyBatch = (json) => ((ops = JSON.parse(json)), applyBatch(json));

set_css_vars({ surface: '#333333', '--accent': '#fedcba' });
settle();
check('a theme change ships as one batch of setStyle ops', ops!.every(([op]) => op === 'setStyle'), true);
check('restyling only the elements that read a variable', ops!.length, 5);
check('with the new values', [element_of('card')!.style!.backgroundColor, element_of('inline')!.style!.color], ['#333333', '#fedcba']);

// The memoised rules are still valid, so nothing has to be re-resolved.
ops = null;
set_css_vars({ surface: '#333333', '--accent': '#fedcba' });
settle();
check('an unchanged palette restyles nothing', ops, null);

const late: string[] = [];
console.warn = (message) => late.push(String(message));
set_css_vars({ accent: null });
check('an undefined var does not warn where it is read', late.length, 0);
settle();
console.warn = warn;
check('it warns when the frame that read it ships', late.filter((w) => w.includes('var(--accent)')).length, 1);
check('deleting a var drops the declaration it fed', element_of('inline')!.style!.color ?? null, null);
check('and still restyles every element that read one', ops!.length, 5);

// Still undefined and read again on the next frame — but reporting it once is the point.
const again: string[] = [];
console.warn = (message) => again.push(String(message));
set_css_vars({ surface: '#444444' });
settle();
console.warn = warn;
check('a var already reported stays quiet on later frames', again.filter((w) => w.includes('var(--accent)')).length, 0);
check('though the frame itself still ships', ops!.length, 5);

finish('vars', 23);
