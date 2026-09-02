/**
 * Class rules are compiled ahead of time, so a `var()` in one has to survive to
 * the runtime as text and resolve against a map JS controls — a theme is then
 * one `set_css_vars()` call restyling every element that read a variable.
 */

import { fileURLToPath } from 'node:url';
import { set_css_vars } from 'gpuix-svelte';
import { compile_svelte } from '../src/compile.js';
import { mount_headless, element_of, click_text, settle, check, finish } from 'gpuix-svelte/test';

const FIXTURE = fileURLToPath(new URL('./Vars.svelte', import.meta.url));

// --- compile half ------------------------------------------------------------
const code = compile_svelte(FIXTURE);
check('a rule that reads a var() ships as CSS text', code.includes('"css":"background-color: var(--surface); padding: var(--pad); color: red"'), true);
check('a rule without one is still pre-parsed', code.includes('"style":{"gap":2}'), true);

// --- runtime half ------------------------------------------------------------
set_css_vars({ surface: '#111111', raised: '#222222', pad: '12px 24px', accent: '#abcdef' });

const warnings = [];
const warn = console.warn;
console.warn = (message) => warnings.push(String(message));
const Vars = (await import('./Vars.svelte')).default;
const { native } = mount_headless(Vars);
console.warn = warn;

const pick = (style, ...keys) => keys.map((k) => style[k] ?? null);

const card = element_of('card');
check('a colour var resolves in a class rule', card.style.backgroundColor, '#111111');
check('a var on a pixel-only key resolves, shorthand expanded', pick(card.style, 'paddingTop', 'paddingRight'), [12, 24]);
check(':hover resolves too', card.style.hover?.backgroundColor, '#222222');
check('plain declarations in the same rule survive', card.style.color, 'red');
check('the fallback is used when the var is undefined', element_of('fallback').style.color, '#123456');
check('an undefined var without a fallback drops that declaration only', pick(element_of('missing').style, 'color', 'borderWidth'), [null, 1]);
check('and warns once, naming it', warnings.filter((w) => w.includes('var(--absent)')).length, 1);
check('an inline style resolves as well', element_of('inline').style.color, '#abcdef');

click_text('card');
check('a later class change still resolves', pick(element_of('card').style, 'padding', 'paddingTop', 'backgroundColor'), [20, null, '#111111']);

let ops = null;
const applyBatch = native.applyBatch.bind(native);
native.applyBatch = (json) => ((ops = JSON.parse(json)), applyBatch(json));

set_css_vars({ surface: '#333333', '--accent': '#fedcba' });
settle();
check('a theme change ships as one batch of setStyle ops', ops.every(([op]) => op === 'setStyle'), true);
check('restyling only the elements that read a variable', ops.length, 4);
check('with the new values', [element_of('card').style.backgroundColor, element_of('inline').style.color], ['#333333', '#fedcba']);

finish('vars');
