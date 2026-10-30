/**
 * `gpuix-svelte/build`'s runtime-agnostic half: what `render()` reports under GPUIX_APP_INFO,
 * and what app-bundle.ts makes of it — metadata defaults, the Info.plist, the .ico container
 * and, where the platform has a scaler, real icon files. The Bun.build call itself is
 * `npm run compile`'s job.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check, finish } from 'gpuix-svelte/test';
import { app_slug, ico, ICO_SIZES, info_plist, resolve_app_info, write_icns, write_ico, type AppInfo } from '../src/app-bundle.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'gpuix-svelte-bundle-'));

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
check('a file URL icon (as JSON left it) is a path again', resolve_app_info({ icon: pathToFileURL(join(project, 'x.png')).href }, entry).icon, join(project, 'x.png'));
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
const png = join(root, 'examples/tic-tac-toe/icon.png');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const scaler = process.platform === 'darwin' || process.platform === 'win32';
if (scaler) {
	const out = join(scratch, 'AppIcon.ico');
	write_ico(png, out, scratch);
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
	const icns = join(scratch, 'AppIcon.icns');
	write_icns(png, icns, scratch);
	check('the .icns starts with its magic', readFileSync(icns).subarray(0, 4).toString('latin1'), 'icns');
}

// Through the bin, as build.ts does it, on whichever runtime runs this test.
const report = join(scratch, 'app-info.json');
const probe = spawnSync(process.execPath, [join(root, 'bin/gpuix-svelte.js'), join(root, 'test/app-info-entry.ts')], {
	env: { ...process.env, GPUIX_APP_INFO: report },
	encoding: 'utf8',
	timeout: 60_000
});
check('GPUIX_APP_INFO: the entry exits 0 and opens no window', [probe.status, probe.stdout.includes('created native window')], [0, false]);
check(
	'GPUIX_APP_INFO: render() reports the app options and the title it fell back to',
	JSON.parse(readFileSync(report, 'utf8')),
	{ name: 'Probe', identifier: 'test.probe', icon: './icon.png', title: 'Probe' }
);

rmSync(scratch, { recursive: true, force: true });
finish('bundle', 16 + (scaler ? 1 : 0) + (process.platform === 'darwin' ? 1 : 0));
