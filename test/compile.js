/**
 * `render_hot` re-imports the entry with a `?v=N` cache-buster. Every child
 * `.svelte` specifier has to carry it too, or the reload re-instantiates the
 * root against children Node has already cached.
 */

import { fileURLToPath } from 'node:url';
import { compile_svelte } from '../src/compile.js';

const FIXTURE = fileURLToPath(new URL('./HotImports.svelte', import.meta.url));

const code = compile_svelte(FIXTURE, '?v=7');

let failures = 0;

function check(label, actual, expected) {
	const ok = actual === expected;
	if (!ok) failures++;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}\n       want ${JSON.stringify(expected)}\n       got  ${JSON.stringify(actual)}`);
}

const busted = (name) => code.includes(`${name}.svelte?v=7`);
const bare = (name) => new RegExp(`${name}\\.svelte(?!\\?)`).test(code);

check('static `from` import is busted', busted('HotChild'), true);
check('side-effect import is busted', busted('HotSideEffect'), true);
check('dynamic import() is busted', busted('HotLazy'), true);
check('no child specifier is left bare', ['HotChild', 'HotSideEffect', 'HotLazy'].some(bare), false);

// The renderer import must stay stable, or each reload gets its own shadow tree.
check('the renderer specifier is untouched', /gpuix-svelte\/renderer['"]/.test(code), true);

const plain = compile_svelte(FIXTURE);
check('no query means no rewrite', plain.includes('?v='), false);

if (failures > 0) {
	console.error(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log('\ncompile ok');
