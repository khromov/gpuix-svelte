/**
 * `render_hot` re-imports the entry with a `?v=N` cache-buster. Every child
 * `.svelte` specifier has to carry it too, or the reload re-instantiates the
 * root against children Node has already cached.
 */

import { fileURLToPath } from 'node:url';
import { compile_svelte } from '../src/compile.ts';
import { check, finish } from 'gpuix-svelte/test';

const FIXTURE = fileURLToPath(new URL('./HotImports.svelte', import.meta.url));

const code = compile_svelte(FIXTURE, '?v=7');

const busted = (name: string) => code.includes(`${name}.svelte?v=7`);
const bare = (name: string) => new RegExp(`${name}\\.svelte(?!\\?)`).test(code);

check('static `from` import is busted', busted('HotChild'), true);
check('side-effect import is busted', busted('HotSideEffect'), true);
check('dynamic import() is busted', busted('HotLazy'), true);
check('no child specifier is left bare', ['HotChild', 'HotSideEffect', 'HotLazy'].some(bare), false);

// A specifier-shaped string is not a specifier; the lexical rewrite busted these too.
check('a `.svelte` string literal is left alone', busted('HotString'), false);
check('a commented-out import is left alone', busted('HotComment'), false);
check('both lookalikes survive verbatim', bare('HotString') && bare('HotComment'), true);

// The renderer import must stay stable, or each reload gets its own shadow tree.
check('the renderer specifier is untouched', /gpuix-svelte\/renderer['"]/.test(code), true);
// Node refuses a bare specifier with a query, and a package component is not being edited.
check('a bare package specifier is left alone', busted('Scroller'), false);
check('and survives verbatim', bare('Scroller'), true);

const plain = compile_svelte(FIXTURE);
check('no query means no rewrite', plain.includes('?v='), false);

finish('compile');
