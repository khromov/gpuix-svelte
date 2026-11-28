/**
 * `gpuix-svelte/build`'s runtime-agnostic half: the app options read from an entry's source,
 * and what app-bundle.ts makes of them — metadata defaults, the Info.plist, the Windows icon group
 * and the PE reader, and, where the platform has a scaler, real icon files. The Bun.build call itself is
 * `npm run compile`'s job.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import module from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check, finish } from 'gpuix-svelte/test';
import {
	app_slug,
	decode_png,
	DEFAULT_ICON,
	icon_group,
	info_plist,
	LINUX_ICON_SIZES,
	native_addon,
	net_wm_icon,
	pe_resources,
	read_app_options,
	resolve_app_info,
	RT_GROUP_ICON,
	RT_ICON,
	windows_icons,
	write_icns,
	X11_ICON_SIZES,
	type AppInfo
} from '../src/app-bundle.ts';
import { data_dirs, data_home, desktop_entry, install_desktop_entry, linux_icon, x11_cookie } from '../src/linux-icon.ts';
import { window_options_for } from '../src/render.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'gpuix-svelte-bundle-'));
// Inside the repo so `gpuix-svelte` resolves from it, and named to trip shell splitting
// (a space) and PowerShell's typographic quote delimiters.
const awkward = join(root, 'test', '.bundle-tmp', 'gpuix svelte ’x');
rmSync(join(root, 'test', '.bundle-tmp'), { recursive: true, force: true });
mkdirSync(awkward, { recursive: true });

check('a slug is lowercase ASCII words joined by dashes', app_slug('GPUIX + Svelte — Tic-tac-toe é'), 'gpuix-svelte-tic-tac-toe');
check('a name with nothing usable in it slugs to "app"', app_slug('—'), 'app');

const project = join(scratch, 'project');
mkdirSync(project);
writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'my-app', version: '1.2.3' }));
const entry = join(project, 'standalone.ts');

const from_title = resolve_app_info({ title: 'My App' }, entry);
check(
	'the name falls back to the title, the version to package.json, the identifier to local.<slug>, the icon to the default',
	[from_title.name, from_title.slug, from_title.identifier, from_title.version, from_title.icon],
	['My App', 'my-app', 'local.my-app', '1.2.3', DEFAULT_ICON]
);
check(
	'the default icon is the shipped assets/icon.png',
	[DEFAULT_ICON, existsSync(DEFAULT_ICON), JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).files.includes('assets/icon.png'), readFileSync(join(root, 'scripts', 'publish.ts'), 'utf8').includes("'assets/icon.png'")],
	[join(root, 'assets', 'icon.png'), true, true, true]
);
check("with no title either, the name is the nearest package.json's", resolve_app_info({}, join(project, 'src', 'deep', 'standalone.ts')).name, 'my-app');
check('a relative icon is read from the entry\'s directory', resolve_app_info({ icon: './icon.png' }, entry).icon, join(project, 'icon.png'));
check('a file: URL icon is a path again',resolve_app_info({ icon: pathToFileURL(join(project, 'x.png')).href }, entry).icon, join(project, 'x.png'));
const update = { manifest: 'https://example.com/update.json' };
const explicit = resolve_app_info({ name: 'Named', identifier: 'com.example.named', version: '9.9', title: 'Titled', copyright: '© me', publisher: 'Me', description: 'Mine', update }, entry);
check(
	'explicit values win',
	[explicit.name, explicit.identifier, explicit.version, explicit.copyright, explicit.publisher, explicit.description, explicit.update],
	['Named', 'com.example.named', '9.9', '© me', 'Me', 'Mine', update]
);

const info: AppInfo = { name: 'A & B <C>', slug: 'a-b-c', identifier: 'com.x.y', version: '1.0', icon: '/i.png', copyright: '© me' };
const plist = info_plist(info);
check(
	'the plist escapes the name, under both keys that show it',
	[plist.includes('<key>CFBundleName</key>\n\t<string>A &amp; B &lt;C&gt;</string>'), plist.includes('<key>CFBundleDisplayName</key>\n\t<string>A &amp; B &lt;C&gt;</string>')],
	[true, true]
);
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
check('an empty icon is the default one', resolve_app_info({ icon: '' }, entry).icon, DEFAULT_ICON);
const prerelease = info_plist({ ...info, version: '1.0.0-beta.1' });
check(
	'a prerelease stays on CFBundleShortVersionString; CFBundleVersion gets the numbers',
	[
		prerelease.includes('<key>CFBundleShortVersionString</key>\n\t<string>1.0.0-beta.1</string>'),
		prerelease.includes('<key>CFBundleVersion</key>\n\t<string>1.0.0</string>')
	],
	[true, true]
);

const bundle_version = (version: string) => /<key>CFBundleVersion<\/key>\n\t<string>(.*)<\/string>/.exec(info_plist({ ...info, version }))?.[1];
check('CFBundleVersion reads through a leading v, stops at three numbers and falls back to 0', ['v1.2.3', '1.2.3.4', 'beta'].map(bundle_version), ['1.2.3', '1.2.3', '0']);
check(
	'an exported const reads like a bare one',
	read_app_options(`import { render } from 'gpuix-svelte';\nexport const NAME = 'N';\nexport const app = { name: NAME };\nrender(A, { title: NAME, app });`),
	{ name: 'N', title: 'N' }
);
check('and render() can initialize one', read_app_options(`import { render } from 'gpuix-svelte';\nexport const win = render(A, { title: 'T' });`), { title: 'T' });

const group = icon_group([
	{ size: 16, bytes: new Uint8Array([1, 2, 3]) },
	{ size: 256, bytes: new Uint8Array([4, 5]) }
]);
check('icon group header: reserved 0, type 1, two entries', [group.readUInt16LE(0), group.readUInt16LE(2), group.readUInt16LE(4)], [0, 1, 2]);
check('icon group entries: 16 px as is, 256 px written as 0', [group[6], group[7], group[20], group[21]], [16, 16, 0, 0]);
check('icon group entries: one colour plane at 32 bits', [group.readUInt16LE(10), group.readUInt16LE(12), group.readUInt16LE(24), group.readUInt16LE(26)], [1, 32, 1, 32]);
check('icon group entries: each image size, then its RT_ICON id counting from 1', [group.readUInt32LE(14), group.readUInt16LE(18), group.readUInt32LE(28), group.readUInt16LE(32)], [3, 1, 2, 2]);
check('icon group entries are 14 bytes each', group.length, 34);

// node.exe and bun.exe both carry icons, so the runtime's own executable exercises the PE reader.
if (process.platform === 'win32') {
	const exe = readFileSync(process.execPath);
	const named = pe_resources(exe, RT_GROUP_ICON).flatMap(({ data }) => Array.from({ length: data.readUInt16LE(4) }, (_, i) => data.readUInt16LE(6 + 14 * i + 12)));
	const icons = new Set(pe_resources(exe, RT_ICON).map((icon) => icon.name));
	check("the runtime's executable has icon groups that name icons", named.length > 0);
	check('and holds every icon its groups name', named.filter((id) => !icons.has(id)), []);
}

// sips on macOS, System.Drawing on Windows; Linux has neither and never needs an icon.
const png = join(awkward, 'ic on ’.png');
copyFileSync(DEFAULT_ICON, png);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const scaler = process.platform === 'darwin' || process.platform === 'win32';
if (scaler) {
	const entries = windows_icons(png, awkward).map(({ size, bytes }) => {
		const blob = Buffer.from(bytes);
		return { size, png: blob.subarray(0, 8).equals(PNG_MAGIC), width: blob.readUInt32BE(16) };
	});
	check(
		'the Windows icon is one PNG per size, each scaled to it',
		entries,
		[256, 48, 32, 16].map((size) => ({ size, png: true, width: size }))
	);
}
if (process.platform === 'darwin') {
	const icns = join(awkward, 'App Icon.icns');
	write_icns(png, icns, awkward);
	const bytes = readFileSync(icns);
	check('the .icns starts with its magic', bytes.subarray(0, 4).toString('latin1'), 'icns');
	// iconutil takes a partial iconset without complaint; 16 and 32 at 1x are left out because their type codes vary by macOS.
	check('and holds every size but the 1x of 16 and 32', ['ic07', 'ic08', 'ic09', 'ic10', 'ic11', 'ic12', 'ic13', 'ic14'].filter((type) => !bytes.includes(type)), []);
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
		{
			name: 'Tic-tac-toe',
			identifier: 'dev.gpuix.svelte.tictactoe',
			update: { manifest: 'https://github.com/khromov/gpuix-svelte/releases/latest/download/update.json' },
			title: 'GPUIX + Svelte — Tic-tac-toe'
		},
		{ identifier: 'com.example.gpuix-svelte-starter', title: 'gpuix-svelte starter' }
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
	'an app value worked out at runtime fails and names itself, as does one that is not a string',
	[`pkg.version`, `1`].map((version) => error_of(`${head}render(App, { app: { identifier: 'x.y', version: ${version} } });`).startsWith(`app.version is \`${version}\`;`)),
	[true, true]
);
check('a spread in app fails', error_of(`${head}render(App, { app: { ...shared, name: 'x' } });`).startsWith('app has `...shared`;'), true);
check(
	'a render_hot entry has no render() to read',
	error_of("import { render_hot } from 'gpuix-svelte';\nrender_hot(new URL('./App.svelte', import.meta.url));").startsWith('no top-level render()'),
	true
);
check('two render() calls fail', error_of(`${head}render(App, {});\nrender(App, {});`).startsWith('render() is called 2 times'), true);
check('only a render() imported from gpuix-svelte counts', error_of("import { render } from './mine.js';\nrender(App, {});").startsWith('no top-level render()'), true);
check('options worked out at runtime fail and name themselves', error_of(`${head}render(App, opts);`).startsWith("render()'s second argument is `opts`;"), true);
check('a computed key in app fails', error_of(`${head}render(App, { app: { [key]: 'x' } });`).startsWith('app has `[key]'), true);
check('a top-level let is not followed, since it could be reassigned', error_of(`${head}let name = 'x';\nrender(App, { app: { name } });`).startsWith('app.name is `name`;'), true);
check(
	'a URL with another base or from another constructor is not the icon beside the entry',
	[`new URL('./x.png', 'https://example.com/')`, `new Other('./x.png')`].map((icon) => error_of(`${head}render(App, { app: { icon: ${icon} } });`).startsWith('app.icon is')),
	[true, true]
);
check('a quoted key reads like a bare one', read_app_options(`${head}render(App, { app: { 'name': 'Q' } });`), { name: 'Q' });

check(
	'the window takes its title fallback, menu name and app id from app',
	window_options_for({ width: 10 }, { name: 'Named', identifier: 'com.x.y' }),
	{ width: 10, title: 'Named', appName: 'Named', appId: 'com.x.y' }
);
check("a title of the window's own leaves macOS's Hide and Quit items to the app's name", window_options_for({ title: 'Inbox — Mail' }, { name: 'Mail' }), {
	title: 'Inbox — Mail',
	appName: 'Mail'
});
check(
	'what the window is given directly wins',
	window_options_for({ title: 'T', appName: 'N', appId: 'a.b' }, { name: 'Named', identifier: 'com.x.y' }),
	{ title: 'T', appName: 'N', appId: 'a.b' }
);
check('no app adds nothing', window_options_for({ width: 10 }, undefined), { width: 10 });
check(
	"a build's identifier is the app id when the entry declares none, and what the entry or window says wins",
	[
		window_options_for({}, { name: 'N' }, { identifier: 'local.n' }),
		window_options_for({}, { identifier: 'com.x.y' }, { identifier: 'local.n' }).appId,
		window_options_for({ appId: 'a.b' }, undefined, { identifier: 'local.n' }).appId,
		window_options_for({}, { identifier: '' }, { identifier: 'local.n' }).appId
	],
	[{ title: 'N', appName: 'N', appId: 'local.n' }, 'com.x.y', 'a.b', 'local.n']
);

// The reference is PIL's decode of the same file.
const decoded = decode_png(readFileSync(DEFAULT_ICON));
check(
	'decode_png reads the default icon, whose rows use the Sub, Up, Average and Paeth filters, as PIL does',
	[decoded.width, decoded.height, createHash('sha256').update(decoded.data).digest('hex')],
	[1024, 1024, 'b8c755b18946619ab57c4b768a0bf40fefbffcac9561203433886f523c971f13']
);
const rgb = Buffer.from(readFileSync(DEFAULT_ICON));
rgb[25] = 2;
let refused = '';
try {
	decode_png(rgb);
} catch (error) {
	refused = (error as Error).message;
}
check('decode_png refuses what Bun.Image does not write, rather than misreading it', refused.startsWith('only 8-bit RGBA'), true);
const trailing = Buffer.concat([readFileSync(DEFAULT_ICON), Buffer.from([1, 2, 3])]);
check('decode_png stops at IEND even if trailing bytes follow', decode_png(trailing).width, 1024);
let short_idat = '';
try {
	const bad_png = Buffer.from(readFileSync(DEFAULT_ICON));
	bad_png.writeUInt32BE(2048, 20);
	decode_png(bad_png);
} catch (error) {
	short_idat = (error as Error).message;
}
check('decode_png rejects truncated image data instead of zero-filling pixels', short_idat.startsWith('PNG image data is '), true);
check(
	"_NET_WM_ICON is each image's width and height, then 0xAARRGGBB pixels, little-endian",
	net_wm_icon([{ width: 2, height: 1, data: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8) }]).toString('hex'),
	'02000000' + '01000000' + '03020104' + '07060508'
);
check(
	'every size the window gets is one the build cuts for the icon theme',
	X11_ICON_SIZES.every((size) => LINUX_ICON_SIZES.includes(size)),
	true
);

check(
	"the desktop entry is hidden from the app grid and matched to the window by its app id",
	desktop_entry('com.x.y', 'My App', '/opt/my-app/my-app'),
	[
		'[Desktop Entry]',
		'Type=Application',
		'Name=My App',
		'Exec=/opt/my-app/my-app',
		'TryExec=/opt/my-app/my-app',
		'Icon=com.x.y',
		'StartupWMClass=com.x.y',
		'NoDisplay=true',
		'Terminal=false',
		'X-Gpuix-Svelte=true',
		''
	].join('\n')
);
check(
	'Exec quotes a path with reserved characters and doubles %, and every value escapes backslashes and newlines',
	desktop_entry('com.x.y', 'Two\nLines', '/home/u/My Apps/100% $x\\y')
		.split('\n')
		.filter((line) => /^(Name|Exec|TryExec)=/.test(line)),
	[String.raw`Name=Two\nLines`, String.raw`Exec="/home/u/My Apps/100%% \\$x\\\\y"`, String.raw`TryExec=/home/u/My Apps/100% $x\\y`]
);
const data = join(scratch, 'data');
const theme = Object.fromEntries(LINUX_ICON_SIZES.map((size) => [size, Buffer.from(`png ${size}`).toString('base64')]));
check(
	'the desktop entry and icons are written once, and again only when something in them changed',
	[
		install_desktop_entry(data, [], 'com.x.y', 'My App', '/opt/a', theme),
		install_desktop_entry(data, [], 'com.x.y', 'My App', '/opt/a', theme),
		install_desktop_entry(data, [], 'com.x.y', 'My App', '/opt/b', theme)
	],
	[LINUX_ICON_SIZES.length + 1, 0, 1]
);
check(
	'they land where the icon theme and the desktop look',
	[readFileSync(join(data, 'icons', 'hicolor', '16x16', 'apps', 'com.x.y.png'), 'utf8'), readFileSync(join(data, 'applications', 'com.x.y.desktop'), 'utf8')],
	['png 16', desktop_entry('com.x.y', 'My App', '/opt/b')]
);
const packaged = join(scratch, 'usr-share');
mkdirSync(join(packaged, 'applications'), { recursive: true });
writeFileSync(join(packaged, 'applications', 'com.x.y.desktop'), '[Desktop Entry]\n');
const by_hand = join(scratch, 'by-hand');
mkdirSync(join(by_hand, 'applications'), { recursive: true });
writeFileSync(join(by_hand, 'applications', 'com.x.y.desktop'), '[Desktop Entry]\nName=Mine\n');
check(
	"a package's entry, or one the user wrote, is left alone, while the data home listed as a data dir is still ours",
	[
		install_desktop_entry(join(scratch, 'fresh'), [packaged], 'com.x.y', 'My App', '/opt/a', theme),
		existsSync(join(scratch, 'fresh', 'applications')),
		install_desktop_entry(by_hand, [], 'com.x.y', 'My App', '/opt/a', theme),
		readFileSync(join(by_hand, 'applications', 'com.x.y.desktop'), 'utf8'),
		install_desktop_entry(data, [data], 'com.x.y', 'My App', '/opt/c', theme)
	],
	[0, false, 0, '[Desktop Entry]\nName=Mine\n', 1]
);
check(
	'XDG_DATA_HOME and XDG_DATA_DIRS count only when absolute, and the data dirs default to /usr/local/share and /usr/share',
	[data_home({ XDG_DATA_HOME: '/x/data' }), data_home({ XDG_DATA_HOME: 'data' }), data_dirs({ XDG_DATA_DIRS: '/a:b:/c' }), data_dirs({})],
	['/x/data', join(homedir(), '.local', 'share'), ['/a', '/c'], ['/usr/local/share', '/usr/share']]
);
check('a dev run, with no icon built in, installs nothing', linux_icon('com.x.y', 'My App'), null);

const xauth = (family: number, address: string, display: string, kind: string, cookie: string) => {
	const fields = [address, display, kind, cookie].map((field) => {
		const length = Buffer.alloc(2);
		length.writeUInt16BE(Buffer.byteLength(field));
		return Buffer.concat([length, Buffer.from(field)]);
	});
	const head = Buffer.alloc(2);
	head.writeUInt16BE(family);
	return Buffer.concat([head, ...fields]);
};
const authority = Buffer.concat([
	xauth(256, 'other-host', '0', 'MIT-MAGIC-COOKIE-1', 'A'),
	xauth(65535, '', '1', 'MIT-MAGIC-COOKIE-1', 'B'),
	xauth(256, 'this-host', '', 'XDM-AUTHORIZATION-1', 'C'),
	xauth(256, 'this-host', '', 'MIT-MAGIC-COOKIE-1', 'D')
]);
const partial_cookie = xauth(256, 'this-host', '0', 'MIT-MAGIC-COOKIE-1', '0123456789abcdef');
check(
	"the X11 cookie is this host's or a wildcard's, for the display or any, and a truncated entry ends the search",
	[
		x11_cookie(authority, '0', 'this-host'),
		x11_cookie(authority, '1', 'this-host'),
		x11_cookie(authority.subarray(0, 30), '0', 'this-host'),
		x11_cookie(partial_cookie.subarray(0, partial_cookie.length - 4), '0', 'this-host')
	].map((cookie) => cookie?.toString() ?? null),
	['D', 'B', null, null]
);

// An aot or trim build resolves @gpuix/native to this file and searches the executable for its bytes.
const addon = native_addon();
check('the host prebuild is an installed .node for this platform', [existsSync(addon), basename(addon).startsWith(`gpuix-native.${process.platform}-${process.arch}`), addon.endsWith('.node')], [true, true, true]);

rmSync(scratch, { recursive: true, force: true });
rmSync(join(root, 'test', '.bundle-tmp'), { recursive: true, force: true });
finish('bundle', 55 + (scaler ? 1 : 0) + (process.platform === 'win32' ? 2 : 0) + (process.platform === 'darwin' ? 2 : 0));
