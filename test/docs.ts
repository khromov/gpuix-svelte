/**
 * The docs site's live demos: builds the site, then imports the built bundle under happy-dom and
 * mounts it into each built page the way the browser does. A demo that does not compile fails
 * the build; one that throws at mount, or a page whose ids the bundle lacks, fails here.
 *
 * The playground is covered up to the browser: its page and both frames are built, every example
 * compiles for both renderers into imports of files the build wrote, and the tree it shows follows
 * the renderer's operations. GPUI's wasm itself only runs in a real browser.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { Mutation } from 'gpuix-svelte';
import { compile_for, link } from '../playground/compile.ts';
import { MODULES, file_of, type Target } from '../playground/modules.ts';
import { decode_hash, encode_hash } from '../playground/share.ts';
import { Mirror, batch_html, dom_html, tree_html, type MirrorNode } from '../playground/tree.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist/docs');

// Vite runs on Node, as it does for demo:dom, whichever runtime runs this test.
const node = process.versions.bun ? 'node' : process.execPath;
if (spawnSync(node, [join(root, 'scripts/docs.ts')], { cwd: root, stdio: 'inherit' }).status !== 0) {
	console.error('[docs test] the docs build failed');
	process.exit(1);
}

GlobalRegistrator.register({ width: 1024, height: 768 });

// After the registration, or Svelte's client runtime would be evaluated with no `document`.
const { check, finish } = await import('gpuix-svelte/test');
const bundle = (await import(pathToFileURL(join(out, 'demos.js')).href)) as { mount_demos(root?: ParentNode): { mounted: string[]; failed: string[] } };

const errors: string[] = [];
const report = console.error;
console.error = (...args: unknown[]) => {
	errors.push(args.map(String).join(' '));
	report(...args);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const page = (name: string) => readFileSync(join(out, `${name}.html`), 'utf8');

/** The page's body, less the inline script, which a browser would have run and innerHTML does not. */
function show(name: string) {
	document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(page(name))![1].replace(/<script>[\s\S]*?<\/script>/g, '');
}

const leaf = (text: string) => [...document.querySelectorAll<HTMLElement>('div')].find((el) => el.children.length === 0 && el.textContent?.trim() === text) ?? null;
const mounted = () => [...document.querySelectorAll('[data-demo]')].map((target) => target.firstElementChild !== null);
const layers = () => document.querySelectorAll('body > [class~="portal"], body > [class~="layer"]').length;

function click(target: HTMLElement | null) {
	if (!target) throw new Error('nothing to click');
	target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 40, clientY: 30 }));
}

check('a page without demos does not load the bundle', page('overview').includes('demos.js'), false);
const demos = /<img [^>]*demos\.png[^>]*>/.exec(page('overview'))?.[0] ?? '';
const png = readFileSync(join(root, '.github/resources/demos.png'));
check(
	'the README image is served from the site and carries its PNG size, so the overview does not shift while it loads',
	[demos.includes('src="img/demos.png"'), existsSync(join(out, 'img', 'demos.png')), / width="(\d+)"/.exec(demos)?.[1], / height="(\d+)"/.exec(demos)?.[1], demos.includes('loading="lazy"')],
	[true, true, String(png.readUInt32BE(16)), String(png.readUInt32BE(20)), true]
);
check('a page with demos does, as a module', page('components').includes('<script type="module" src="demos.js"></script>'), true);
// A Windows checkout has CRLF line endings, which the copy keeps.
check('the markdown copy keeps the block as a code sample', /```svelte demo tooltip\r?\n/.test(readFileSync(join(out, 'components.md'), 'utf8')), true);

show('components');
check('components.html mounts its four demos', bundle.mount_demos(), {
	mounted: ['components-scroller', 'components-portal', 'components-tooltip', 'components-popover'],
	failed: []
});
check('each into its own element, in place of the noscript note', [mounted(), document.querySelector('[data-demo] noscript')], [[true, true, true, true], null]);

click(leaf('Open a dialog'));
await sleep(0);
check('the Portal demo hangs its dialog off <body>', [layers(), leaf('Close') !== null], [1, true]);
click(leaf('Close'));
await sleep(0);
check('and its Close button takes it down', [layers(), leaf('Close')], [0, null]);

click(leaf('Actions'));
await sleep(0);
check('the Popover demo opens its items in a layer', [layers(), leaf('Rename') !== null], [1, true]);
click(leaf('Rename'));
await sleep(0);
check('an item closes it and reports the pick', [layers(), leaf('Picked: Rename') !== null], [0, true]);
click(leaf('Click anywhere in here for a menu at the pointer'));
await sleep(0);
check('the context menu hangs from the click', [layers(), leaf('Delete') !== null], [1, true]);
click(leaf('Delete'));
await sleep(0);
check('and closes the same way', [layers(), leaf('Picked: Delete') !== null], [0, true]);

const lines = () => document.querySelectorAll('[class~="line"]').length;
const before = lines();
click(leaf('Append a line'));
await sleep(0);
check('the Scroller demo appends a line', [before, lines()], [20, 21]);
click(leaf('follow: on'));
await sleep(0);
check('and its follow toggle flips', leaf('follow: off') !== null, true);

show('dom');
check('dom.html mounts its demo', bundle.mount_demos(), { mounted: ['dom-theme'], failed: [] });
check('in the DOM, says the badge', leaf('DOM') !== null, true);
check('window_size reads the viewport', leaf('1024 × 768') !== null, true);
await sleep(0);
const paper = () => document.documentElement.style.getPropertyValue('--paper');
check('its effect put the theme on :root through set_css_vars', paper(), '#111111');
click(leaf('Light theme'));
await sleep(0);
check('and the button flips it', [paper(), leaf('Dark theme') !== null], ['#fafafa', true]);

// Every page that loads the bundle, not only the two above: a demo added to another page has to mount there too.
const with_demos = readdirSync(out)
	.filter((name) => name.endsWith('.html') && readFileSync(join(out, name), 'utf8').includes('src="demos.js"'))
	.sort();
const everywhere = with_demos.map((name) => {
	show(name.slice(0, -'.html'.length));
	const { mounted, failed } = bundle.mount_demos();
	return [name, failed, mounted.length === document.querySelectorAll('[data-demo]').length];
});
check(
	'every page that loads the bundle mounts all of its demos',
	[with_demos, everywhere],
	[
		['components.html', 'dom.html'],
		with_demos.map((name) => [name, [], true])
	]
);

check('nothing reached console.error', errors, []);
document.body.innerHTML = '<div data-demo="nope"></div>';
check('an id the bundle lacks is reported, not thrown', bundle.mount_demos(), { mounted: [], failed: ['nope'] });
check('with the id in the error', errors.length === 1 && errors[0].includes('"nope"'), true);

const playground = join(out, 'playground');
const playground_page = page('playground');
check(
	'the playground is a page of the site, linked from the docs and the homepage',
	[playground_page.includes('<a href="playground.html" aria-current="page">Playground</a>'), page('overview').includes('<a href="playground.html">Playground</a>'), page('index').includes('<a href="playground.html">Playground</a>')],
	[true, true, true]
);
check(
	'it isolates itself through the service worker before loading its script',
	[playground_page.indexOf("register('playground-sw.js") > 0, playground_page.indexOf("register('playground-sw.js") < playground_page.indexOf('src="playground/main.js"'), existsSync(join(out, 'playground-sw.js'))],
	[true, true, true]
);
const targets: Target[] = ['gpui', 'dom'];
check(
	'each frame is built with its page, its script and every module a component may import',
	targets.map((target) => ['index.html', 'frame.js', ...MODULES[target].map((m) => file_of(m.specifier))].filter((file) => !existsSync(join(playground, target, file)))),
	[[], []]
);
check('the GPUI frame carries the wasm beside it', existsSync(join(playground, 'gpui', 'gpuix-web_bg.wasm')), true);
const gpui_chunks = readdirSync(join(playground, 'gpui'))
	.filter((name) => name.endsWith('.js'))
	.map((name) => readFileSync(join(playground, 'gpui', name), 'utf8'));
check(
	'the frame finds the wasm beside it, wherever the site is served',
	[gpui_chunks.some((code) => code.includes('new URL(`gpuix-web_bg.wasm`,import.meta.url)')), gpui_chunks.some((code) => code.includes('/gpuix-web_bg.wasm'))],
	[true, false]
);

const base = pathToFileURL(playground + '/').href;
const examples = readdirSync(join(root, 'playground/examples')).filter((name) => name.endsWith('.svelte'));
/** The files a linked module imports that the build did not write. */
const missing = (code: string) =>
	[...code.matchAll(/(?:from|import)\s*"(file:[^"]+)"/g)].map((m) => m[1]).filter((url) => !existsSync(fileURLToPath(url)));
const linked = examples.flatMap((name) =>
	targets.map((target) => {
		const { code, runnable, warnings } = compile_for(target, readFileSync(join(root, 'playground/examples', name), 'utf8'), base);
		return [name, target, code.includes("from 'svelte/internal/client'"), /from\s*'/.test(runnable), missing(runnable), warnings];
	})
);
check('there are examples to pick from', examples.length >= 4, true);
check(
	'every example compiles for both renderers, without a warning, into imports of built files only',
	linked,
	examples.flatMap((name) => targets.map((target) => [name, target, true, false, [], []]))
);
// GPUI draws a text node as written, where HTML collapses the line break and indentation of wrapped markup.
const wrapped = (source: string) => /\\n\t+\S/.test(compile_for('gpui', source, base).code);
check(
	'no example wraps a sentence across lines, which GPUI would draw with the break and the indentation',
	[examples.filter((name) => wrapped(readFileSync(join(root, 'playground/examples', name), 'utf8'))), wrapped('<div>\n\tone\n\ttwo\n</div>')],
	[[], true]
);
const gpui = compile_for('gpui', '<div class="a">hi</div>\n<style>.a { color: red; padding: 1em; }</style>', base);
check(
	'the GPUI compile is the package\'s own: the custom renderer, the parsed <style> rules, and a dropped value reported on every compile',
	[gpui.code.includes("import $renderer from 'gpuix-svelte/renderer'"), gpui.code.includes('$define_styles('), gpui.warnings, compile_for('gpui', '<div style="x">hi</div>\n<style>div { padding: 1em; }</style>', base).warnings],
	[true, true, ['dropped unsupported style value `padding: 1em`'], ['dropped unsupported style value `padding: 1em`']]
);
check('the DOM compile has neither', /\$renderer|define_styles/.test(compile_for('dom', '<div class="a">hi</div>\n<style>.a { color: red; }</style>', base).code), false);
const refusal = (code: string) => {
	try {
		return link(code, 'gpui', base).includes('file:');
	} catch (error) {
		return (error as Error).message;
	}
};
check(
	'an import the frame was not built with is refused by name, and a known one is linked',
	[refusal("import { onMount } from 'svelte';"), String(refusal("import _ from 'lodash';")).startsWith('The playground cannot import "lodash".'), refusal("import { fade } from 'svelte/transition';") === true, link("import { fade } from 'svelte/transition';", 'dom', base).includes('file:')],
	[true, true, false, true]
);

const shape = (node: MirrorNode | null): unknown => node && [node.type, node.id, ...(node.text === null ? [] : [node.text]), ...node.children.map(shape)];
const mirror = new Mirror();
const mount: Mutation[] = [
	['createElement', 1, 'div'],
	['setRoot', 1],
	['createElement', 2, 'div'],
	['createElement', 3, 'text'],
	['setText', 3, 'a'],
	['appendChild', 2, 3],
	['appendChild', 1, 2],
	['createElement', 4, 'div'],
	['insertBefore', 1, 4, 2],
	['setStyle', 4, { gap: 8 }],
	['setEventListener', 4, 'click', true],
	['setCustomProp', 4, 'testId', 'first']
];
mirror.apply(mount);
check('the mirror rebuilds the tree from the operations', shape(mirror.root), ['div', 1, ['div', 4], ['div', 2, ['text', 3, 'a']]]);
const html = tree_html(mirror);
check('and shows each element\'s style, listeners and props', [html.includes('gap'), html.includes('on: click'), html.includes('testId'), html.includes('&quot;first&quot;')], [true, true, true, true]);
mirror.apply([
	['appendChild', 4, 2],
	['setEventListener', 4, 'click', false],
	['setCustomProp', 4, 'testId', null]
]);
check('a re-insert reparents, and a listener or prop taken off is gone', [shape(mirror.root), tree_html(mirror).includes('on: click'), tree_html(mirror).includes('testId')], [['div', 1, ['div', 4, ['div', 2, ['text', 3, 'a']]]], false, false]);
mirror.apply([['destroyElement', 4]]);
check('a destroyed element takes its subtree with it', [shape(mirror.root), [...mirror.nodes.keys()]], [['div', 1], [1]]);
check('a batch lists its operations', [batch_html(3, mount).includes('applyBatch 3 · 12 operations'), batch_html(1, [mount[0]]).includes('1 operation<')], [true, true]);
const dom_tree = dom_html('<div class="a"><script>x</script><!----><b>hi &amp; <i>there</i></b></div>');
check('the DOM tree is escaped markup without scripts or Svelte\'s anchors', [dom_tree.includes('&lt;<span class="pg-t-tag">div</span>'), dom_tree.includes('script'), dom_tree.includes('<b>'), dom_tree.includes('&quot;hi &amp;&quot;')], [true, false, false, true]);

const counter = readFileSync(join(root, 'playground/examples/Counter.svelte'), 'utf8') + '— ünïcode ✓';
const hash = await encode_hash(counter, 'dom');
const plain = `#renderer=gpui&code=${Buffer.from(counter).toString('base64url')}`;
check(
	'a link carries the source compressed, opens to the same text and renderer, and an uncompressed link from before still opens',
	[await decode_hash(hash), hash.length < plain.length / 2, await decode_hash(plain), await decode_hash('#renderer=dom&z=not-deflate')],
	[{ source: counter, target: 'dom' }, true, { source: counter, target: 'gpui' }, { source: null, target: 'dom' }]
);

finish('docs', 41);
