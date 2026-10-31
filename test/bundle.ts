/**
 * `gpuix-svelte/build`'s runtime-agnostic half: the app options read from an entry's source,
 * and what app-bundle.ts makes of them — metadata defaults, the Info.plist, the .ico container
 * and, where the platform has a scaler, real icon files. The Bun.build call itself is
 * `npm run compile`'s job.
 */

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import module from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check, finish } from 'gpuix-svelte/test';
import { app_slug, ico, ICO_SIZES, info_plist, read_app_options, resolve_app_info, write_icns, write_ico, type AppInfo } from '../src/app-bundle.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'gpuix-svelte-bundle-'));
// Inside the repo so `gpuix-svelte` resolves from it, and named to trip shell splitting
// (a space) and PowerShell's typographic quote delimiters.
const awkward = join(root, 'test', '.bundle-tmp', 'gpuix svelte ’x');
rmSync(join(root, 'test', '.bundle-tmp'), { recursive: true, force: true });
mkdirSync(awkward, { recursive: true });

check('a slug is lowercase ASCII words joined by dashes', app_slug('GPUIX + Svelte — Tic-tac-toe'), 'gpuix-svelte-tic-tac-toe');
check('a name with nothing usable in it slugs to "app"', app_slug('—'), 'app');

const project = join(scratch, 'project');
mkdirSync(project);
writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'my-app', version: '1.2.3' }));
const entry = join(project, 'standalone.ts');

const from_title = resolve_app_info({ title: 'My App' }, entry);
check(
	'the name falls back to the title, the version to package.json, the identifier to local.<slug>',
	[from_title.name, from_title.slug, from_title.identifier, from_title.version, from_title.icon],
	['My App', 'my-app', 'local.my-app', '1.2.3', null]
);
check('with no title either, the name is package.json\'s', resolve_app_info({}, entry).name, 'my-app');
check('a relative icon is read from the entry\'s directory', resolve_app_info({ icon: './icon.png' }, entry).icon, join(project, 'icon.png'));
check('a file: URL icon is a path again',resolve_app_info({ icon: pathToFileURL(join(project, 'x.png')).href }, entry).icon, join(project, 'x.png'));
const explicit = resolve_app_info({ name: 'Named', identifier: 'com.example.named', version: '9.9', title: 'Titled', copyright: '© me' }, entry);
check(
	'explicit values win',
	[explicit.name, explicit.identifier, explicit.version, explicit.copyright],
	['Named', 'com.example.named', '9.9', '© me']
);

const info: AppInfo = { name: 'A & B <C>', slug: 'a-b-c', identifier: 'com.x.y', version: '1.0', icon: '/i.png', copyright: '© me' };
const plist = info_plist(info);
check('the plist escapes the name', plist.includes('<string>A &amp; B &lt;C&gt;</string>'), true);
check(
	'the plist names the executable, identifier, version, icon and copyright',
	[
		plist.includes('<key>CFBundleExecutable</key>\n\t<string>a-b-c</string>'),
		plist.includes('<key>CFBundleIdentifier</key>\n\t<string>com.x.y</string>'),
		plist.includes('<key>CFBundleShortVersionString</key>\n\t<string>1.0</string>'),
		plist.includes('<key>CFBundleIconFile</key>\n\t<string>AppIcon</string>'),
		plist.includes('<key>NSHumanReadableCopyright</key>\n\t<string>© me</string>')
	],
	[true, true, true, true, true]
);
check('no icon, no CFBundleIconFile', info_plist({ ...info, icon: null }).includes('CFBundleIconFile'), false);
check('an empty icon is no icon', resolve_app_info({ icon: '' }, entry).icon, null);
const prerelease = info_plist({ ...info, version: '1.0.0-beta.1' });
check(
	'a prerelease stays on CFBundleShortVersionString; CFBundleVersion gets the numbers',
	[
		prerelease.includes('<key>CFBundleShortVersionString</key>\n\t<string>1.0.0-beta.1</string>'),
		prerelease.includes('<key>CFBundleVersion</key>\n\t<string>1.0.0</string>')
	],
	[true, true]
);

const container = ico([
	{ size: 16, bytes: new Uint8Array([1, 2, 3]) },
	{ size: 256, bytes: new Uint8Array([4, 5]) }
]);
check('ico header: reserved 0, type 1, two entries', [container.readUInt16LE(0), container.readUInt16LE(2), container.readUInt16LE(4)], [0, 1, 2]);
check('ico entries: 16 px as is, 256 px written as 0', [container[6], container[7], container[22], container[23]], [16, 16, 0, 0]);
check(
	'ico entries point at contiguous blobs after the directory',
	[container.readUInt32LE(14), container.readUInt32LE(18), container.readUInt32LE(30), container.readUInt32LE(34)],
	[3, 38, 2, 41]
);
check('ico blobs follow in order', [...container.subarray(38)], [1, 2, 3, 4, 5]);

// sips on macOS, System.Drawing on Windows; Linux has neither and never needs an icon.
const png = join(awkward, 'ic on ’.png');
copyFileSync(join(root, 'examples/tic-tac-toe/icon.png'), png);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const scaler = process.platform === 'darwin' || process.platform === 'win32';
if (scaler) {
	const out = join(awkward, 'App Icon.ico');
	write_ico(png, out, awkward);
	const bytes = readFileSync(out);
	const entries = Array.from({ length: bytes.readUInt16LE(4) }, (_, i) => {
		const at = 6 + 16 * i;
		const blob = bytes.subarray(bytes.readUInt32LE(at + 12), bytes.readUInt32LE(at + 12) + bytes.readUInt32LE(at + 8));
		return { declared: bytes[at] || 256, png: blob.subarray(0, 8).equals(PNG_MAGIC), width: blob.readUInt32BE(16) };
	});
	check(
		'the .ico holds one PNG per size, each scaled to it',
		entries,
		ICO_SIZES.map((size) => ({ declared: size, png: true, width: size }))
	);
}
if (process.platform === 'darwin') {
	const icns = join(awkward, 'App Icon.icns');
	write_icns(png, icns, awkward);
	check('the .icns starts with its magic', readFileSync(icns).subarray(0, 4).toString('latin1'), 'icns');
}

// Bun strips types the way build.ts does; Bun's node:module has no stripTypeScriptTypes.
const as_js = (ts: string) => (process.versions.bun ? new Bun.Transpiler({ loader: 'ts' }).transformSync(ts) : module.stripTypeScriptTypes(ts));
const read = (ts: string) => read_app_options(as_js(ts));
const error_of = (ts: string) => {
	try {
		read(ts);
		return 'no error';
	} catch (error) {
		return (error as Error).message;
	}
};
const head = "import { render } from 'gpuix-svelte';\nimport App from './App.svelte';\n";

check(
	'the tic-tac-toe and starter entries read as written',
	[read(readFileSync(join(root, 'examples/tic-tac-toe/standalone.ts'), 'utf8')), read(readFileSync(join(root, 'starter/standalone.ts'), 'utf8'))],
	[
		{ name: 'Tic-tac-toe', identifier: 'dev.gpuix.svelte.tictactoe', icon: './icon.png', title: 'GPUIX + Svelte — Tic-tac-toe' },
		{ identifier: 'com.example.gpuix-svelte-starter', icon: './icon.png', title: 'gpuix-svelte starter' }
	]
);
const typed = `import { render as mount, type RenderOptions } from 'gpuix-svelte';
import App from './App.svelte';
const NAME: string = 'Typed';
const app = {
	name: NAME,
	identifier: \`com.example.typed\`,
	icon: new URL('./icon.png', import.meta.url),
	copyright: '© 2026'
} satisfies RenderOptions['app'];
start_logging();
const handle = mount(App, { width: 640 as number, app } as RenderOptions);
`;
check(
	'a renamed import, top-level consts, a shorthand app, a plain template and a URL icon all read',
	read(typed),
	{ name: 'Typed', identifier: 'com.example.typed', icon: './icon.png', copyright: '© 2026' }
);
check('new URL(…, import.meta.url) is the icon beside the entry', resolve_app_info(read(typed), entry).icon, join(project, 'icon.png'));
check(
	'a title worked out at runtime is left out, not fatal',
	read(`${head}render(App, { title: \`v\${pkg.version}\`, app: { identifier: 'x.y' } });`),
	{ identifier: 'x.y' }
);
check('no options, nothing declared', read(`${head}render(App);`), {});
check(
	'an app value worked out at runtime fails and names itself',
	error_of(`${head}render(App, { app: { identifier: 'x.y', version: pkg.version } });`).startsWith('app.version is `pkg.version`;'),
	true
);
check('a spread in app fails', error_of(`${head}render(App, { app: { ...shared, name: 'x' } });`).startsWith('app has `...shared`;'), true);
check(
	'a render_hot entry has no render() to read',
	error_of("import { render_hot } from 'gpuix-svelte';\nrender_hot(new URL('./App.svelte', import.meta.url));").startsWith('no top-level render()'),
	true
);
check('two render() calls fail', error_of(`${head}render(App, {});\nrender(App, {});`).startsWith('render() is called 2 times'), true);

rmSync(scratch, { recursive: true, force: true });
rmSync(join(root, 'test', '.bundle-tmp'), { recursive: true, force: true });
finish('bundle', 25 + (scaler ? 1 : 0) + (process.platform === 'darwin' ? 1 : 0));
