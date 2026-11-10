/**
 * `render_hot` re-imports the entry with a `?v=N` cache-buster. Every child
 * `.svelte` specifier has to carry it too, or the reload re-instantiates the
 * root against children Node has already cached.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile_svelte } from '../src/compile.ts';
import { collapse_whitespace, compile_source } from '../src/compile-core.ts';
import { import_fresh, on_change } from '../src/hot.ts';
import { check, finish } from 'gpuix-svelte/test';

const FIXTURE = fileURLToPath(new URL('./HotImports.svelte', import.meta.url));

const code = compile_svelte(FIXTURE, '?v=7');

const busted = (name: string) => code.includes(`${name}.svelte?v=7`);
const bare = (name: string) => new RegExp(`${name}\\.svelte(?!\\?)`).test(code);

check('static `from` import is busted', busted('HotChild'), true);
check('side-effect import is busted', busted('HotSideEffect'), true);
check('dynamic import() is busted', busted('HotLazy'), true);
check('a re-export is busted, `*` and named alike', [busted('HotStar'), busted('HotNamed')], [true, true]);
check('so are an absolute path and a file: URL', [busted('HotAbsolute'), busted('HotFile')], [true, true]);
check('no child specifier is left bare', ['HotChild', 'HotSideEffect', 'HotLazy', 'HotStar', 'HotNamed', 'HotAbsolute', 'HotFile'].some(bare), false);

// A specifier-shaped string is not a specifier; the lexical rewrite busted these too.
check('a `.svelte` string literal is left alone', [busted('HotString'), busted('HotPath')], [false, false]);
check('a commented-out import is left alone', busted('HotComment'), false);
check('both lookalikes survive verbatim', bare('HotString') && bare('HotPath') && bare('HotComment'), true);

// A runes module is one instance per process by design, so busting it would hand the
// remounted tree a second copy of the state the first one is still using.
check('a relative .svelte.ts module is left alone', code.includes('ModuleStore.svelte.ts?v=7'), false);
check('and survives verbatim too', /ModuleStore\.svelte\.ts(?!\?)/.test(code), true);

// The renderer import must stay stable, or each reload gets its own shadow tree.
check('the renderer specifier is untouched', /gpuix-svelte\/renderer['"]/.test(code), true);
// Node refuses a bare specifier with a query, and a package component is not being edited.
check('a bare package specifier is left alone', busted('Scroller'), false);
check('and survives verbatim', bare('Scroller'), true);

const plain = compile_svelte(FIXTURE);
check('no query means no rewrite', plain.includes('?v='), false);

// The query alone reloads nothing on Bun, which keys modules by path, so this runs the
// reload itself on whichever runtime the suite is on.
const dir = new URL('./.hot-tmp/', import.meta.url);
mkdirSync(dir, { recursive: true });
const root = new URL('Root.svelte', dir);
const write_child = (v: number) => writeFileSync(new URL('Child.svelte', dir), `<script module>export const marker = 'child-${v}';</script>\n`);
const write_root = (v: number) =>
	writeFileSync(root, `<script module>import { marker as child } from './Child.svelte';\nimport { store as shared } from './Store.svelte.ts';\nexport const store = shared;\nexport const marker = 'root-${v}/' + child;</script>\n`);

try {
	writeFileSync(new URL('Store.svelte.ts', dir), 'export const store = $state({ count: 0 });\n');
	write_child(1);
	write_root(1);
	const first = await import_fresh(root, 1);
	write_child(2);
	const second = await import_fresh(root, 2);
	check('a reload picks up an edited child', second.marker, 'root-1/child-2');
	check('a runes module keeps its one instance across the reload', first.store === second.store, true);
	write_root(2);
	check('and an edited root', (await import_fresh(root, 3)).marker, 'root-2/child-2');
} finally {
	rmSync(dir, { recursive: true, force: true });
}

// On Bun the reload is this purge, and nothing this repo imports lives under node_modules, so the package's key is planted.
if (process.versions.bun) {
	const cache = createRequire(import.meta.url).cache;
	const inside_package = '/x/node_modules/pkg/A.svelte';
	cache[inside_package] = {} as NodeJS.Module;
	(globalThis as Record<symbol, () => void>)[Symbol.for('gpuix-svelte.invalidate')]();
	check('the purge leaves a package component cached', inside_package in cache, true);
	delete cache[inside_package];
}

check(
	"a component's edit remounts, a module's asks for a restart, and nothing inside a package is an edit",
	['App.svelte', 'lib\\Row.svelte', 'state.svelte.ts', 'util.js', 'notes.md', 'data.json', 'node_modules/pkg/A.svelte', 'sub\\node_modules\\pkg\\B.svelte', 'node_modules/pkg/a.js', 'my_node_modules_notes.svelte', 'my_node_modules/C.svelte'].map(on_change),
	['remount', 'remount', 'restart', 'restart', null, null, null, null, null, 'remount', 'remount']
);

const compiled = (source: string) => compile_source(source, 'App.svelte', 'gpuix-svelte/renderer', () => {});
check(
	'a sentence wrapped in the markup compiles to one line of text, as HTML would lay it out',
	[compiled('<div>\n\tone\n\ttwo   three\n</div>').includes("['div', null, 'one two three']"), compile_source('<div>one two</div>', 'App.svelte', 'x').includes("'one two'")],
	[true, true]
);
const mixed = compiled('<script>let n = $state(1);</script>\n<div onclick={() => n++}>\n\tone {n}\n\ttwo\n\t{n}\n\t{n} x\n</div>');
check('also where the text sits beside an expression', [mixed.includes("`one ${$.get(n) ?? ''} two ${$.get(n) ?? ''} ${$.get(n) ?? ''} x`"), /two\s*\n/.test(mixed)], [true, false]);
const kept = compiled('<script>const s = "a\\n  b";</script>\n<textarea>\n a\n   b</textarea><pre>a\n   b</pre><div class="a\n\tb">{s}</div>');
check(
	'a string from an expression, an attribute, <pre> and <textarea> keep their whitespace',
	[kept.includes("['textarea', null, ' a\\n   b']"), kept.includes("['pre', null, 'a\\n   b']"), kept.includes("class: 'a\\n\tb'"), kept.includes('"a\\n  b"')],
	[true, true, true, true]
);
const line_of = (source: string) => {
	try {
		compile_source(source, 'App.svelte', 'x');
	} catch (error) {
		return (error as { start?: { line: number } }).start?.line;
	}
};
const collapsed = collapse_whitespace('<div>\n\tone\n\ttwo\n</div>');
check(
	'every line keeps its number, so an error after wrapped text points where it did',
	[collapsed.split('\n').length, collapsed === '<div>\n\tone<!--\n\t--> two\n</div>', line_of('<script>let n = 1;</script>\n<div>\n\tone\n\ttwo\n</div>\n<input bind:value={n} />'), collapse_whitespace('<div>\n{#if}')],
	[4, true, 6, '<div>\n{#if}']
);

finish('compile', 23 + (process.versions.bun ? 1 : 0));
