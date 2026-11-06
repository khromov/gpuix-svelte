/**
 * The docs site's live demos: builds the site, then imports the built bundle under happy-dom and
 * mounts it into each built page the way the browser does. A demo that does not compile fails
 * the build; one that throws at mount, or a page whose ids the bundle lacks, fails here.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

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
		['components.html', 'dom.html', 'ui.html'],
		with_demos.map((name) => [name, [], true])
	]
);

check('nothing reached console.error', errors, []);
document.body.innerHTML = '<div data-demo="nope"></div>';
check('an id the bundle lacks is reported, not thrown', bundle.mount_demos(), { mounted: [], failed: ['nope'] });
check('with the id in the error', errors.length === 1 && errors[0].includes('"nope"'), true);

finish('docs', 23);
