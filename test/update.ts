/**
 * gpuix-svelte/update: version order, the manifest's signature and merge, the `app.update`
 * options read from an entry, and on this platform the whole path against a local server —
 * build({ archive: true })'s packer archives a fake app, the updater downloads it, checks the
 * hash, extracts it and swaps it in for a copy standing in for the running app, and refuses
 * what it must: insecure URLs, oversized or wrong downloads, archives without a real executable,
 * another app's bundle. Then a real executable (relaunch-app.ts, compiled by Bun) replaces itself
 * while running and has to come back as the new version. The Windows and Linux branches also run
 * everywhere under a faked process.platform. No headless renderer, so it runs on Linux too, and it
 * needs `bun` on PATH under Node.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, finish } from 'gpuix-svelte/test';
import { archive_name, info_plist, read_app_options, run, sha256_file, update_fragment, update_platform, write_archive, type UpdateFragment } from '../src/app-bundle.ts';
import {
	app_info,
	build_manifest,
	canonical_manifest,
	check_for_update,
	compare_versions,
	finish_update,
	generate_keys,
	is_public_key,
	is_version,
	plist_strings,
	sign_manifest,
	UpdateError,
	updated_from,
	verify_manifest,
	wait_for_previous_instance,
	type InstallOptions,
	type UpdateManifest
} from '../src/update.ts';
import AdmZip from 'adm-zip';
import { extract_zip, write_zip } from '../src/zip.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'gpuix-svelte-update-test-'));
// A temp directory of its own, or another run's sweep deletes what an app this one closed left behind.
const own_temp = join(scratch, 'temp');
mkdirSync(own_temp);
process.env.TMPDIR = process.env.TEMP = process.env.TMP = own_temp;
const platform = update_platform();
const darwin = process.platform === 'darwin';
const win32 = process.platform === 'win32';
// Windows ACLs and root ignore mode bits, so a read-only directory stops nothing there.
const no_locks = win32 || process.getuid?.() === 0;

// --- versions ------------------------------------------------------------------------------

check(
	'versions order as semver',
	[
		compare_versions('1.2.3', '1.2.3'),
		compare_versions('1.10.0', '1.9.0'),
		compare_versions('1.2.0-beta.1', '1.2.0'),
		compare_versions('1.2.0-beta.2', '1.2.0-beta.10'),
		compare_versions('1.2.0-alpha', '1.2.0-beta'),
		compare_versions('v2.0.0', '1.99.99'),
		compare_versions('1.2', '1.2.0'),
		compare_versions('1.2.3+build.5', '1.2.3'),
		compare_versions('1.0.0-alpha', '1.0.0-alpha.1'),
		compare_versions('1.0.0-1', '1.0.0-a')
	],
	[0, 1, -1, -1, -1, 1, 0, 0, -1, -1]
);
check('a non-version throws with code version', code(() => compare_versions('latest', '1.0.0')), 'version');
check('is_version', [is_version('1.2.3'), is_version('1.2.3-rc.1'), is_version('1.2.3.4'), is_version('latest')], [true, true, false, false]);

// --- signatures ----------------------------------------------------------------------------

const keys = generate_keys();
const manifest: UpdateManifest = {
	version: '2.0.0',
	notes: 'Fixes',
	published_at: '2026-11-01T00:00:00Z',
	platforms: { 'darwin-arm64': { url: 'https://example.com/a.zip', sha256: 'ab'.repeat(32), size: 1 } }
};
check('the public key is 32 raw bytes, base64, and is_public_key knows it', [Buffer.from(keys.publicKey, 'base64').length, is_public_key(keys.publicKey), is_public_key(keys.privateKey), is_public_key('')], [32, true, false, false]);
check('the private key is a PEM', keys.privateKey.startsWith('-----BEGIN PRIVATE KEY-----'), true);
const signed = sign_manifest(manifest, keys.privateKey);
check('a signed manifest verifies', verify_manifest(signed, keys.publicKey), true);
const canonical = `{"notes":"Fixes","platforms":{"darwin-arm64":{"sha256":"${'ab'.repeat(32)}","size":1,"url":"https://example.com/a.zip"}},"published_at":"2026-11-01T00:00:00Z","version":"2.0.0"}`;
check('the signature does not depend on key order or whitespace, and covers the whole manifest but itself', [canonical_manifest({ notes: 'Fixes', ...signed }), canonical_manifest(signed)], [canonical, canonical]);
check('a changed version fails', verify_manifest({ ...signed, version: '2.0.1' }, keys.publicKey), false);
check('a changed asset fails', verify_manifest({ ...signed, platforms: { 'darwin-arm64': { ...signed.platforms['darwin-arm64'], sha256: 'cd'.repeat(32) } } }, keys.publicKey), false);
check('another key fails', verify_manifest(signed, generate_keys().publicKey), false);
check('an unsigned manifest fails', verify_manifest(manifest, keys.publicKey), false);
check('a garbage key fails rather than throws', verify_manifest(signed, 'not a key'), false);

// --- build_manifest ------------------------------------------------------------------------

const fragments: UpdateFragment[] = [
	{ platform: 'darwin-arm64', version: '2.0.0', file: 'app-2.0.0-darwin-arm64.zip', sha256: 'ab'.repeat(32), size: 10 },
	{ platform: 'win32-x64', version: '2.0.0', file: 'app-2.0.0-win32-x64.zip', sha256: 'cd'.repeat(32), size: 20 }
];
const merged = build_manifest({ fragments, base_url: 'https://example.com/releases/download/v2.0.0', notes: 'Notes', url: 'https://example.com/releases' });
check(
	'fragments merge into one manifest with the base URL in front of each file',
	[merged.version, merged.notes, merged.url, merged.platforms['darwin-arm64'].url, merged.platforms['win32-x64'].size, typeof merged.published_at, 'signature' in merged],
	['2.0.0', 'Notes', 'https://example.com/releases', 'https://example.com/releases/download/v2.0.0/app-2.0.0-darwin-arm64.zip', 20, 'string', false]
);
check('a trailing slash on the base URL is not doubled', build_manifest({ fragments, base_url: 'https://x/y/' }).platforms['win32-x64'].url, 'https://x/y/app-2.0.0-win32-x64.zip');
check('fragments that disagree on the version are refused', code(() => build_manifest({ fragments: [fragments[0], { ...fragments[1], version: '2.0.1' }], base_url: 'https://x' })), 'manifest');
check('two fragments for one platform are refused', code(() => build_manifest({ fragments: [fragments[0], fragments[0]], base_url: 'https://x' })), 'manifest');
check(
	'a fragment that is not what build() writes is refused',
	[
		code(() => build_manifest({ fragments: [{} as UpdateFragment], base_url: 'https://x' })),
		code(() => build_manifest({ fragments: [{ ...fragments[0], sha256: 'nope' }], base_url: 'https://x' })),
		code(() => build_manifest({ fragments: [{ ...fragments[0], file: '../x.zip' }], base_url: 'https://x' })),
		code(() => build_manifest({ fragments: [{ ...fragments[0], size: -1 }], base_url: 'https://x' })),
		code(() => build_manifest({ fragments: [{ ...fragments[0], platform: 'not a platform' }], base_url: 'https://x' })),
		code(() => build_manifest({ fragments: [{ ...fragments[0], version: 'latest' }], base_url: 'https://x' })),
		code(() => build_manifest({ fragments: [], base_url: 'https://x' }))
	],
	['manifest', 'manifest', 'manifest', 'manifest', 'manifest', 'manifest', 'manifest']
);
check('a private key signs the merged manifest', verify_manifest(build_manifest({ fragments, base_url: 'https://x', private_key: keys.privateKey }), keys.publicKey), true);

// --- app.update in the entry -----------------------------------------------------------------

const entry = (app: string) => `import { render } from 'gpuix-svelte';\nrender(App, { title: 'T', app: { identifier: 'com.x.y', ${app} } });`;
check(
	'app.update is read with its manifest and public key',
	read_app_options(entry(`update: { manifest: 'https://x/update.json', publicKey: '${keys.publicKey}' }`)).update,
	{ manifest: 'https://x/update.json', publicKey: keys.publicKey }
);
const loopback = () => read_app_options(entry(`update: { manifest: 'http://127.0.0.1:8000/u.json' }`)).update?.manifest;
check('a loopback http manifest is allowed, for trying things out', message(loopback) === 'no error' && loopback(), 'http://127.0.0.1:8000/u.json');
check('app.update without a manifest fails the build', message(() => read_app_options(entry('update: { publicKey: "K" }'))), 'app.update has no manifest URL');
check('a computed manifest URL names itself', message(() => read_app_options(entry('update: { manifest: url() }'))).startsWith('app.update.manifest is `url()`'), true);
check(
	'what would ship a broken updater fails the build: a plain http manifest, a key that is not the printed one, a misspelled option',
	[
		message(() => read_app_options(entry(`update: { manifest: 'http://example.com/u.json' }`))).includes('https'),
		message(() => read_app_options(entry(`update: { manifest: 'https://x/u.json', publicKey: '${keys.privateKey.replace(/\n/g, '')}' }`))).includes('publicKey'),
		message(() => read_app_options(entry(`update: { manifest: 'https://x/u.json', public_key: 'x' }`))).includes('public_key')
	],
	[true, true, true]
);

// --- app_info ------------------------------------------------------------------------------

delete process.env.GPUIX_APP_INFO;
check('no GPUIX_APP_INFO means no app info', app_info(), null);
process.env.GPUIX_APP_INFO = JSON.stringify({ name: 'Fake', slug: 'fake', identifier: 'com.x.fake', version: '1.0.0', update: { manifest: 'https://x/update.json' } });
check('GPUIX_APP_INFO is the app info', app_info()?.update?.manifest, 'https://x/update.json');
process.env.GPUIX_APP_INFO = '{';
check('an unparseable GPUIX_APP_INFO is none', app_info(), null);
process.env.GPUIX_APP_INFO = '{"name":"Fake"}';
check('a GPUIX_APP_INFO that names no version is none', app_info(), null);
delete process.env.GPUIX_APP_INFO;

check('with no manifest anywhere there is nothing to check', await check_for_update(), null);
check('a manifest with no version to compare against throws', await code_async(() => check_for_update({ manifest: 'https://127.0.0.1:9/update.json' })), 'version');
check(
	'a plain http manifest is refused before it is fetched, as is a host that only looks like this machine, and nonsense',
	[await refused_unfetched('http://example.com/update.json'), await refused_unfetched('http://127.0.0.1.example.com/update.json'), await refused_unfetched('nonsense')],
	[
		['manifest', false],
		['manifest', false],
		['manifest', false]
	]
);

// --- the whole path on this platform ----------------------------------------------------------

// A fake app shaped like build() output: new versions in src/, the "running" copy in installed/.
// The executables carry the platform's magic bytes, which is what locate() checks for.
const src = join(scratch, 'src');
const installed = join(scratch, 'installed');
const dist = join(scratch, 'dist');
for (const dir of [src, installed, dist]) mkdirSync(dir, { recursive: true });
const app_name = darwin ? 'Fake.app' : win32 ? 'fake.exe' : 'fake';
const magic = win32 ? 'MZ' : '\x7fELF';

function fake_app(dir: string, version: string, { identifier = 'com.x.fake', plist = true, program = true, version_key = true, executable = 'fake', mode = 0o755 } = {}): string {
	if (darwin) {
		const bundle = join(dir, 'Fake.app');
		const macos = join(bundle, 'Contents', 'MacOS');
		mkdirSync(macos, { recursive: true });
		if (plist) {
			const version_pair = version_key ? `<key>CFBundleShortVersionString</key><string>${version}</string>` : '';
			writeFileSync(
				join(bundle, 'Contents', 'Info.plist'),
				`<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${identifier}</string>${version_pair}<key>CFBundleExecutable</key><string>${executable}</string></dict></plist>\n`
			);
		}
		// A Mach-O by its magic, which is what the bundle check wants; `program: false` is a script.
		writeFileSync(join(macos, 'fake'), program ? Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from(` fake ${version}`)]) : `#!/bin/sh\necho ${version}\n`);
		chmodSync(join(macos, 'fake'), mode);
		if (executable === 'a-directory') mkdirSync(join(macos, executable));
		return bundle;
	}
	const file = join(dir, app_name);
	writeFileSync(file, `${program ? magic : ''}fake ${version}`, 'latin1');
	if (!win32) chmodSync(file, 0o755);
	return file;
}
const last_word = (file: string) => readFileSync(file, 'latin1').trim().split(' ').pop();
const read_version = (target: string) => last_word(darwin ? join(target, 'Contents', 'MacOS', 'fake') : target);
function archive_of(output: string, version: string, { folders = 0, ditto = false } = {}): UpdateFragment {
	const archive = join(dist, archive_name({ slug: 'fake', version }));
	// `folders`: that many directories around the app, the way a hand-made zip wraps things;
	// `ditto`: Apple's own zip, which a notarized build ships.
	let source = output;
	for (let i = 0; i < folders; i++) source = dirname(source);
	if (ditto) run('/usr/bin/ditto', ['-c', '-k', '--keepParent', output, archive]);
	else write_archive(source, archive);
	return update_fragment({ version }, archive);
}

const target = fake_app(installed, '1.0.0');
const fragment = archive_of(fake_app(src, '2.0.0'), '2.0.0');
check(
	'the archive is named for the platform and carries its hash and size',
	[fragment.platform, fragment.file, fragment.sha256, fragment.size],
	[`${process.platform}-${process.arch}`, `fake-2.0.0-${process.platform}-${process.arch}.zip`, createHash('sha256').update(readFileSync(join(dist, fragment.file))).digest('hex'), statSync(join(dist, fragment.file)).size]
);

const multi_dir = join(scratch, 'multi');
mkdirSync(multi_dir);
writeFileSync(join(multi_dir, 'LICENSE'), 'MIT');
if (darwin) mkdirSync(join(multi_dir, 'Another.app'));
if (win32) writeFileSync(join(multi_dir, 'another.exe'), magic);
const multi = archive_of(fake_app(multi_dir, '3.0.0'), '3.0.0', { folders: 1 });
const bad_dir = join(scratch, 'bad');
mkdirSync(bad_dir);
const bad = archive_of(fake_app(bad_dir, '4.0.0', { plist: false, program: false }), '4.0.0');
const other_dir = join(scratch, 'other');
mkdirSync(other_dir);
const other = archive_of(fake_app(other_dir, '5.0.0', { identifier: 'com.x.other' }), '5.0.0');
const native_dir = join(scratch, 'native');
mkdirSync(native_dir);
const native_app = fake_app(native_dir, '6.0.0');
// An extended attribute is what makes ditto write `._` sidecars.
if (darwin) run('/usr/bin/xattr', ['-w', 'com.example.sidecar', '1', join(native_app, 'Contents', 'MacOS', 'fake')]);
const native_zip = archive_of(native_app, '6.0.0', { ditto: darwin });
const nover_dir = join(scratch, 'nover');
mkdirSync(nover_dir);
const nover = archive_of(fake_app(nover_dir, '7.0.0', { version_key: false }), '7.0.0');
const mislabeled_dir = join(scratch, 'mislabeled');
mkdirSync(mislabeled_dir);
const mislabeled = archive_of(fake_app(mislabeled_dir, '7.0.0'), '7.5.0');
const bare_dir = join(scratch, 'bare');
mkdirSync(bare_dir);
const bare_file = join(dist, `fake-8.5.0-${platform}.bin`);
copyFileSync(darwin ? join(fake_app(bare_dir, '8.5.0'), 'Contents', 'MacOS', 'fake') : fake_app(bare_dir, '8.5.0'), bare_file);
const bare = update_fragment({ version: '8.5.0' }, bare_file);

const strands_dir = join(scratch, 'strands');
mkdirSync(strands_dir);
const strands = archive_of(fake_app(strands_dir, '9.0.0'), '9.0.0');

const deep_dir = join(scratch, 'deep', 'wrap');
mkdirSync(deep_dir, { recursive: true });
const deep = archive_of(fake_app(deep_dir, '7.7.0'), '7.7.0', { folders: 2 });

const elf = '\x7fELF';
const as_windows_dir = join(scratch, 'as-windows-src');
mkdirSync(as_windows_dir);
writeFileSync(join(as_windows_dir, 'renamed.exe'), 'MZ fake 11.0.0');
writeFileSync(join(as_windows_dir, 'LICENSE'), 'MIT');
const as_windows = archive_of(join(as_windows_dir, 'renamed.exe'), '11.0.0', { folders: 1 });
const not_windows_dir = join(scratch, 'not-windows-src');
mkdirSync(not_windows_dir);
writeFileSync(join(not_windows_dir, 'fake.exe'), `${elf} fake 12.0.0`, 'latin1');
const not_windows = archive_of(join(not_windows_dir, 'fake.exe'), '12.0.0');
const bare_elf_file = join(dist, 'fake-13.0.0-elf.bin');
writeFileSync(bare_elf_file, `${elf} fake 13.0.0`, { encoding: 'latin1', mode: 0o644 });
const bare_elf = update_fragment({ version: '13.0.0' }, bare_elf_file);
const not_linux_dir = join(scratch, 'not-linux-src');
mkdirSync(not_linux_dir);
writeFileSync(join(not_linux_dir, 'fake'), 'MZ fake 14.0.0');
const not_linux = archive_of(join(not_linux_dir, 'fake'), '14.0.0');
const escaping_file = join(dist, 'fake-15.0.0-escaping.zip');
hostile_zip('ok/escape', '../escape', escaping_file);
const escaping = update_fragment({ version: '15.0.0' }, escaping_file);

const manifests: Record<string, (base: string) => UpdateManifest> = {
	'/strands.json': (base) => build_manifest({ fragments: [strands], base_url: base }),
	'/update.json': (base) => build_manifest({ fragments: [fragment], base_url: base, notes: 'Second', published_at: '2026-11-01T00:00:00Z', url: `${base}/page`, private_key: keys.privateKey }),
	'/unsigned.json': (base) => build_manifest({ fragments: [fragment], base_url: base }),
	'/wrong-hash.json': (base) => build_manifest({ fragments: [{ ...fragment, sha256: 'ef'.repeat(32) }], base_url: base }),
	'/wrong-size.json': (base) => build_manifest({ fragments: [{ ...fragment, size: fragment.size + 1 }], base_url: base }),
	'/too-long.json': (base) => build_manifest({ fragments: [{ ...fragment, size: fragment.size - 1 }], base_url: base }),
	'/other-platform.json': (base) => build_manifest({ fragments: [{ ...fragment, platform: 'plan9-mips' }], base_url: base }),
	'/insecure.json': () => build_manifest({ fragments: [fragment], base_url: 'http://example.com/' }),
	'/multi.json': (base) => build_manifest({ fragments: [multi], base_url: base }),
	'/bad.json': (base) => build_manifest({ fragments: [bad], base_url: base }),
	'/other.json': (base) => build_manifest({ fragments: [other], base_url: base }),
	'/native.json': (base) => build_manifest({ fragments: [native_zip], base_url: base }),
	'/nover.json': (base) => build_manifest({ fragments: [nover], base_url: base }),
	'/mislabeled.json': (base) => build_manifest({ fragments: [mislabeled], base_url: base }),
	'/bare.json': (base) => build_manifest({ fragments: [bare], base_url: base }),
	'/real.json': (base) => build_manifest({ fragments: [real_fragment!], base_url: base, private_key: keys.privateKey }),
	'/missing-asset.json': (base) => build_manifest({ fragments: [{ ...fragment, file: 'nowhere.zip' }], base_url: base }),
	'/no-size.json': (base) => {
		const made = build_manifest({ fragments: [fragment], base_url: base });
		delete made.platforms[platform].size;
		return made;
	},
	'/deep.json': (base) => build_manifest({ fragments: [deep], base_url: base }),
	'/as-windows.json': (base) => build_manifest({ fragments: [as_windows], base_url: base }),
	'/not-windows.json': (base) => build_manifest({ fragments: [not_windows], base_url: base }),
	'/as-linux.json': (base) => build_manifest({ fragments: [bare_elf], base_url: base }),
	'/not-linux.json': (base) => build_manifest({ fragments: [not_linux], base_url: base }),
	'/escaping.json': (base) => build_manifest({ fragments: [escaping], base_url: base })
};
let real_fragment: UpdateFragment | undefined;
// Each has a plist that checks out and an executable that could never start.
const unstartable = (darwin ? [{ program: false }, { mode: 0o644 }, { executable: 'absent' }, { executable: '../MacOS/fake' }, { executable: 'a-directory' }] : []).map((options, i) => {
	const dir = join(scratch, `unstartable-${i}`);
	mkdirSync(dir);
	const made = archive_of(fake_app(dir, `10.${i}.0`, options), `10.${i}.0`);
	manifests[`/unstartable-${i}.json`] = (base) => build_manifest({ fragments: [made], base_url: base });
	return `unstartable-${i}.json`;
});
const server = createServer((request, response) => {
	const path = request.url ?? '/';
	const file = join(dist, basename(path));
	if (path in manifests) {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(manifests[path](base)));
	} else if (path === '/not-json') {
		response.end('<html>');
	} else if (path === '/gone.json') {
		response.writeHead(404, { 'content-type': 'application/json' });
		response.end(JSON.stringify(manifests['/update.json'](base)));
	} else if (path.length > 1 && existsSync(file)) {
		response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(file).size });
		response.end(readFileSync(file));
	} else {
		response.writeHead(404);
		response.end();
	}
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
const at = (name: string, extra = {}) => check_for_update({ manifest: `${base}/${name}`, version: '1.0.0', target, ...extra });
const staging_in = (dir: string) => readdirSync(dir).filter((name) => name.startsWith('.update-'));
const staging_left = () => staging_in(installed);
const in_temp = (prefix: string) => readdirSync(tmpdir()).filter((name) => name.startsWith(`${prefix}${process.pid}-`));
const redirected = (to: string, only = '') =>
	(async (input, init) => {
		const response = await fetch(input, init);
		if (String(input).endsWith(only)) Object.defineProperty(response, 'url', { value: to });
		return response;
	}) as typeof fetch;

try {
	check('a 404 manifest throws manifest, whatever its body says', await code_async(() => at('gone.json')), 'manifest');
	check('a non-JSON manifest throws manifest', await code_async(() => at('not-json')), 'manifest');
	check(
		'a manifest that cannot be fetched throws manifest',
		await code_async(() =>
			at('update.json', {
				fetch: async () => {
					throw new TypeError('refused');
				}
			})
		),
		'manifest'
	);
	check(
		'a manifest redirected off https is refused, and one redirected to https is not',
		[await code_async(() => at('update.json', { fetch: redirected('http://example.com/update.json') })), (await at('update.json', { fetch: redirected('https://example.com/update.json') }).catch(() => null))?.version],
		['manifest', '2.0.0']
	);
	const sha = 'ab'.repeat(32);
	const wrong_shapes = [
		null,
		{ platforms: {} },
		{ version: '2.0.0' },
		{ version: '2.0.0', platforms: { other: { sha256: sha } } },
		{ version: '2.0.0', platforms: { other: { url: 'https://x/a.zip', sha256: 'nope' } } },
		{ version: '2.0.0', platforms: { other: { url: 'https://x/a.zip', sha256: sha, size: -1 } } },
		{ version: '2.0.0', platforms: {}, signature: 5 }
	];
	check(
		'a manifest of the wrong shape is refused',
		await Promise.all(wrong_shapes.map((shape) => code_async(() => at('update.json', { fetch: async () => Response.json(shape) })))),
		wrong_shapes.map(() => 'manifest')
	);
	check('a public key refuses an unsigned manifest', await code_async(() => at('unsigned.json', { publicKey: keys.publicKey })), 'signature');
	check('a public key refuses a manifest signed with another key', await code_async(() => at('update.json', { publicKey: generate_keys().publicKey })), 'signature');
	const embedded = (manifest: string) => JSON.stringify({ name: 'Fake', slug: 'fake', identifier: 'com.x.fake', version: '1.0.0', update: { manifest: `${base}/${manifest}`, publicKey: keys.publicKey } });
	process.env.GPUIX_APP_INFO = embedded('unsigned.json');
	const embedded_unsigned = await code_async(() => check_for_update({ target }));
	process.env.GPUIX_APP_INFO = embedded('update.json');
	const embedded_signed = await check_for_update({ target });
	delete process.env.GPUIX_APP_INFO;
	check("what the build embedded is what a check goes by: its manifest, its version and its key, which refuses an unsigned manifest", [embedded_unsigned, embedded_signed?.version, embedded_signed?.current], ['signature', '2.0.0', '1.0.0']);
	process.env.GPUIX_UPDATE_MANIFEST = `${base}/update.json`;
	const overridden = await at('missing.json').catch(() => null);
	delete process.env.GPUIX_UPDATE_MANIFEST;
	check('GPUIX_UPDATE_MANIFEST outranks the manifest option in a dev run', overridden?.version, '2.0.0');
	check('an asset that is not https is refused at check time', await code_async(() => at('insecure.json')), 'manifest');
	check('the running version is up to date', await at('update.json', { version: '2.0.0', publicKey: keys.publicKey }), null);
	check('a newer running version is up to date too', await at('update.json', { version: '2.1.0-beta.1' }), null);

	const no_asset = await at('other-platform.json');
	check('a manifest with nothing for this platform is reported, not installable', [no_asset?.version, no_asset?.installable, no_asset?.reason, no_asset?.asset === null], ['2.0.0', false, 'no-asset', true]);
	check('installing it throws not-installable', await code_async(() => no_asset!.install()), 'not-installable');
	check('a manifest with no notes reads as empty notes', no_asset?.notes, '');
	const named_platform = await at('other-platform.json', { platform: 'plan9-mips' });
	check('the platform option picks the asset', [named_platform?.platform, named_platform?.installable, named_platform?.asset?.sha256], ['plan9-mips', true, fragment.sha256]);

	const dev = await check_for_update({ manifest: `${base}/update.json`, version: '1.0.0' });
	check('without a built app or a target it is a development run', [dev?.installable, dev?.reason], [false, 'development']);

	check('a download whose sha256 differs throws hash', await code_async(async () => (await at('wrong-hash.json'))!.download()), 'hash');
	check('a download whose size differs throws hash', await code_async(async () => (await at('wrong-size.json'))!.download()), 'hash');
	let longest = 0;
	check(
		'a download longer than the manifest says stops as soon as it passes that size',
		[await code_async(async () => (await at('too-long.json'))!.download({ onProgress: (received) => (longest = received) })), longest < fragment.size],
		['hash', true]
	);
	check('a download that is not there throws download', await code_async(async () => (await at('missing-asset.json'))!.download()), 'download');
	const lost_midway = (async (input, init) =>
		String(input).endsWith('.zip')
			? new Response(
					new ReadableStream({
						start: (stream) => stream.enqueue(new Uint8Array(8)),
						pull: (stream) => stream.error(new Error('gone'))
					})
				)
			: fetch(input, init)) as typeof fetch;
	check('a connection lost midway throws download', await code_async(async () => (await at('update.json', { fetch: lost_midway }))!.download()), 'download');
	const to_http = (await at('update.json', { fetch: redirected('http://example.com/a.zip', '.zip') }))!;
	const to_https = (await at('update.json', { fetch: redirected('https://example.com/a.zip', '.zip') }))!;
	check('a download redirected off https is refused, and one redirected to https is not', [await code_async(() => to_http.download()), await code_async(() => to_https.download())], ['download', null]);
	rmSync(dirname(await to_https.download()), { recursive: true, force: true });
	const sizeless_progress: Array<number | null> = [];
	const sizeless_file = await (await at('no-size.json'))!.download({ onProgress: (_received, total) => sizeless_progress.push(total) });
	check("with no size in the manifest the total is the response's content-length", sizeless_progress.at(-1), fragment.size);
	rmSync(dirname(sizeless_file), { recursive: true, force: true });
	check('the failed downloads left nothing in place', [read_version(target), staging_left(), in_temp('gpuix-svelte-update-')], ['1.0.0', [], []]);

	const bad_update = await at('bad.json');
	check(
		'an archive whose contents are not an app of this platform is refused with extract, and the app is untouched, every time',
		[await code_async(() => bad_update!.install({ relaunch: false })), await code_async(() => bad_update!.install({ relaunch: false })), read_version(target), staging_left()],
		['extract', 'extract', '1.0.0', []]
	);

	const update = await at('update.json', { publicKey: keys.publicKey });
	check(
		'the update carries the manifest',
		[update?.version, update?.current, update?.notes, update?.published_at, update?.url, update?.platform, update?.asset, update?.installable, update?.reason === undefined, update?.installed],
		['2.0.0', '1.0.0', 'Second', '2026-11-01T00:00:00Z', `${base}/page`, platform, { url: `${base}/${fragment.file}`, sha256: fragment.sha256, size: fragment.size }, true, true, false]
	);
	const progress: Array<[number, number | null]> = [];
	const [downloaded, again] = await Promise.all([update!.download({ onProgress: (received, total) => progress.push([received, total]) }), update!.download()]);
	check(
		'the download lands in a temp file, reports its progress to the full size, and is shared while in flight',
		[existsSync(downloaded), dirname(dirname(downloaded)), basename(downloaded), progress.at(-1), again],
		[true, tmpdir(), 'update.bin', [fragment.size, fragment.size], downloaded]
	);
	check('a later download is the same file', await update!.download(), downloaded);
	{
		const shared = (await at('unsigned.json'))!;
		const seen: number[] = [];
		const seen_by_leaver: number[] = [];
		const leaving = new AbortController();
		const first = shared.download();
		const joined = shared.download({ onProgress: (received) => seen.push(received) });
		const left = shared.download({ signal: leaving.signal, onProgress: (received) => seen_by_leaver.push(received) });
		leaving.abort();
		const left_code = code_async(() => left);
		const too_late_code = code_async(() => shared.download({ signal: leaving.signal }));
		const finished = await first.catch(() => null);
		check(
			"joining a download reports its progress, and a joiner's signal ends only that joiner's wait, and its progress",
			[await left_code, await too_late_code, finished !== null && finished === (await joined), seen.at(-1), seen_by_leaver],
			['download', 'download', true, fragment.size, []]
		);
		if (finished) rmSync(dirname(finished), { recursive: true, force: true });

		const stoppable = (await at('unsigned.json'))!;
		const stopping = new AbortController();
		const stopped = stoppable.download({ signal: stopping.signal });
		stopping.abort();
		const stopped_code = await code_async(() => stopped);
		const retried = await stoppable.download().catch(() => null);
		check("the first caller's signal stops the download for good with code download, and a later call starts over", [stopped_code, retried !== null && existsSync(retried)], ['download', true]);
		if (retried) rmSync(dirname(retried), { recursive: true, force: true });
	}
	finish_update(target);
	check("cleaning up leaves a running process's download alone", existsSync(downloaded), true);

	await update!.install({ relaunch: false });
	check('the new version is in place', [read_version(target), update!.installed], ['2.0.0', true]);
	check('the download and the staging directory are gone', [existsSync(downloaded), staging_left()], [false, []]);
	check('installing it again throws', await code_async(() => update!.install({ relaunch: false })), 'install');
	{
		const { dir, victim, check: check_it } = strandable('concurrent');
		const twice = (await check_it())!;
		const codes = await Promise.all([code_async(() => twice.install({ relaunch: false })), code_async(() => twice.install({ relaunch: false }))]);
		check('a second install() while the first is still downloading throws install, and only one swap happens', [codes, read_version(victim), staging_in(dir)], [[null, 'install'], '9.0.0', []]);
	}
	writeFileSync(`${target}.settings.old`, 'mine');
	if (!win32) {
		const executable = darwin ? join(target, 'Contents', 'MacOS', 'fake') : target;
		check('the executable bit survived the archive', (statSync(executable).mode & 0o111) !== 0, true);
		writeFileSync(`${target}.old`, 'mine too');
		finish_update(target);
		check('finish_update has nothing to do off Windows', [read_version(target), existsSync(`${target}.old`)], ['2.0.0', true]);
		rmSync(`${target}.old`, { force: true });
	} else {
		check('Windows keeps the old .exe beside the new one until the next launch', existsSync(`${target}.old`), true);
		finish_update(target);
		check('finish_update deletes it', existsSync(`${target}.old`), false);
	}
	check('finish_update leaves other .old files alone', existsSync(`${target}.settings.old`), true);

	const from_multi = await at('multi.json', { version: '2.0.0' });
	check('in an archive with more than the app in it, the file named like the app is the one installed', [await code_async(() => from_multi!.install({ relaunch: false })), read_version(target)], [null, '3.0.0']);

	process.env.GPUIX_APP_INFO = JSON.stringify({ name: 'Fake', slug: 'fake', identifier: 'com.x.fake', version: '3.0.0' });
	const foreign = await at('other.json', { version: '3.0.0' });
	check(
		"on macOS another app's bundle is refused by its identifier (elsewhere there is no identifier to check)",
		[await code_async(() => foreign!.install({ relaunch: false })), read_version(target)],
		darwin ? ['extract', '3.0.0'] : [null, '5.0.0']
	);
	delete process.env.GPUIX_APP_INFO;

	const from_native = await at('native.json', { version: '1.0.0' });
	await from_native!.install({ relaunch: false });
	const native_exe = darwin ? join(target, 'Contents', 'MacOS', 'fake') : target;
	check(
		darwin ? "a zip made by Apple's ditto (what a notarized build ships) installs, sidecars skipped, executable bit kept" : 'a zip from write_archive installs with the executable bit kept',
		[read_version(target), win32 || (statSync(native_exe).mode & 0o111) !== 0, !darwin || new AdmZip(join(dist, native_zip.file)).getEntries().some((entry) => entry.entryName.endsWith('/._fake')), existsSync(join(target, 'Contents', 'MacOS', '._fake'))],
		['6.0.0', true, true, false]
	);

	const without_version = await at('nover.json', { version: '6.0.0' });
	check('on macOS a bundle with no version key is refused (elsewhere there is no plist)', [await code_async(() => without_version!.install({ relaunch: false })), read_version(target)], darwin ? ['extract', '6.0.0'] : [null, '7.0.0']);
	const relabelled = await at('mislabeled.json', { version: '6.0.0' });
	check('on macOS a bundle whose version is not the manifest\'s is refused', [await code_async(() => relabelled!.install({ relaunch: false })), read_version(target)], darwin ? ['extract', '6.0.0'] : [null, '7.0.0']);
	const bare_update = await at('bare.json', { version: '6.0.0' });
	check('a bare executable installs under the app\'s name on Windows and Linux; macOS wants a bundle', [await code_async(() => bare_update!.install({ relaunch: false })), read_version(target)], darwin ? ['extract', '6.0.0'] : [null, '8.5.0']);

	const unmoved = read_version(target);
	check('an app more than one folder down in the archive is not looked for', [await code_async(async () => (await at('deep.json', { version: '6.0.0' }))!.install({ relaunch: false })), read_version(target) === unmoved], ['extract', true]);
	check('an archive with a path that would leave the directory is refused with extract, and the app is untouched', [await code_async(async () => (await at('escaping.json', { version: '6.0.0' }))!.install({ relaunch: false })), read_version(target) === unmoved], ['extract', true]);
	const unstartable_codes: Array<string | null> = [];
	for (const name of unstartable) unstartable_codes.push(await code_async(async () => (await at(name, { version: '6.0.0' }))!.install({ relaunch: false })));
	check(
		'on macOS a bundle whose executable could not start is refused: a script, no executable bit, a missing file, a path out of MacOS, a directory',
		[unstartable_codes, read_version(target)],
		[unstartable.map(() => 'extract'), unmoved]
	);

	const windows = await windows_path();
	check('on Windows the old exe waits beside the new one as .old, or as .<pid>.old when a stale .old cannot be deleted', windows.kept, [null, 'MZ fake 11.0.0', 'MZ fake 1.0.0', null, 'MZ fake 11.0.0', 'MZ fake 1.0.0']);
	check('on Windows finish_update deletes exactly <exe>.old and <exe>.<pid>.old', windows.left, ['fake.exe', 'fake.exe.settings.old', 'fakeXexe.old']);
	check('on Windows what is not an MZ .exe is refused', windows.refused, ['extract', 'MZ fake 1.0.0']);
	check('on Windows a rename-in the antivirus holds is retried until it lets go', await held_rename_in(true), no_locks ? 'skipped' : [null, 1, 'MZ fake 11.0.0']);
	check('on Windows a rename-in held for good gives up after ten tries, and the old exe is back', await held_rename_in(false), no_locks ? 'skipped' : ['install', 9, 'MZ fake 1.0.0']);
	check('on Linux a bare executable installs under the app\'s name and becomes executable, and what is not an ELF is refused', await linux_path(), ['extract', '1.0.0', null, '13.0.0', true]);

	check('a read-only install directory is reported at check time, before anything is downloaded', await read_only_reason(), no_locks ? 'skipped' : 'read-only:not-installable');
	check('a directory that turned read-only after the check throws install, and the app is untouched', await locked_after_check(), no_locks ? 'skipped' : ['install', '1.0.0']);
	check('an app that cannot be moved aside throws install, and is untouched', await after_failed_move_aside(), no_locks ? 'skipped' : ['install', true, '1.0.0', false]);
	check('a new version that cannot be moved in leaves the old one back in place', await after_failed_rename_in(), win32 ? 'skipped' : ['install', true, '1.0.0', false, []]);
	check('a rename-in that fails and cannot be undone strands the old app, says where, and does not delete it', await after_stranded_swap(), no_locks ? 'skipped' : ['install', true, '1.0.0', false]);
	check('a new version that cannot even be executed is rolled back', await after_failed_relaunch(), ['install', true, '1.0.0', false, null]);
	check('a rollback that strands the app does not report it installed, says where the app is, and does not delete it', await after_stranding(), no_locks ? 'skipped' : ['install', true, false, '1.0.0']);
	check('a stranded app is kept under a name no sweep matches', await after_stranding_kept(), no_locks ? 'skipped' : ['install', true, '1.0.0']);
	check('a relaunch whose executable has gone is rolled back rather than waited on forever', await rolled_back('gone', 'did not start', (exe) => rmSync(exe)), win32 ? 'skipped' : ['install', 'did not start', '1.0.0', false, null]);
	check('a new version that exits before reporting is rolled back', await rolled_back('exits', 'it exited with 3', script('exit 3')), win32 ? 'skipped' : ['install', 'it exited with 3', '1.0.0', false, null]);
	const silent_pid = join(scratch, 'silent.pid');
	check(
		'a new version that never reports is rolled back and stopped, rather than the old one exiting',
		[await rolled_back('silent', 'did not report', hurried(silent_pid)), win32 || (await gone_soon(silent_pid))],
		[win32 ? 'skipped' : ['install', 'did not report', '1.0.0', false, null], true]
	);
	check(
		'a relaunch starts the new version detached and silent, in the old working directory, with the args given and the version it replaced, and exits once it reports, sentinel gone',
		await relaunch_reports(),
		win32 ? 'skipped' : [0, 'silent', realpathSync(process.cwd()), '1.0.0', ['--flag', 'two words'], true, []]
	);
	check('a relaunch from a working directory that has gone starts in the app\'s directory', await relaunch_without_cwd(), win32 ? 'skipped' : [0, realpathSync(join(scratch, 'reports-elsewhere'))]);

	const gone = spawnSync(process.execPath, ['-e', '']).pid;
	const stale = join(installed, `.update-${gone}-abcdef`);
	const live = join(installed, `.update-${process.pid}-abcdef`);
	const kept = join(installed, `.update-kept-${gone}-abcdef`);
	// Another user's process, which kill(0) answers with EPERM rather than ESRCH.
	const foreign_pid = join(installed, '.update-1-abcdef');
	for (const dir of [stale, live, kept, foreign_pid]) mkdirSync(dir);
	finish_update(target);
	check(
		"a staging directory is deleted once its process is gone, and not while it runs, nor another user's, nor one kept",
		[existsSync(stale), existsSync(live), win32 || existsSync(foreign_pid), existsSync(kept)],
		[false, true, true, true]
	);
	for (const dir of [live, kept, foreign_pid]) rmSync(dir, { recursive: true, force: true });

	await real_update();
} finally {
	server.close();
}

/** The whole path with nothing stood in for: this is what shows a relaunch that never happens. */
async function real_update() {
	const home = join(scratch, 'real');
	const fresh = join(scratch, 'real-new');
	const trace = join(home, 'trace.log');
	const lines = () => (existsSync(trace) ? readFileSync(trace, 'utf8').trim().split(/\r?\n/) : []);
	const exe = build_real(home, '8.0.0');
	const fresh_exe = build_real(fresh, '9.0.0');
	real_fragment = archive_of(darwin ? join(fresh, 'Real.app') : fresh_exe, '9.0.0');
	const launch = (...args: string[]) => spawn(exe, args, { detached: true, stdio: 'ignore', cwd: home }).unref();
	const pid_of = (version: string) => Number(lines().findLast((line) => line.startsWith(`start ${version} `))?.split(' ')[2]);

	check('an app macOS has translocated is told to move, not replaced', await translocated_run(home), true);

	const stale_beside_app = join(home, `.update-${spawnSync(process.execPath, ['-e', '']).pid}-abcdef`);
	mkdirSync(stale_beside_app);
	launch('finish');
	await until(() => lines().includes('finished'));
	check('finish_update() with no target cleans up beside the running app', existsSync(stale_beside_app), false);

	launch('abandon');
	const abandoned = (await until(() => lines().find((line) => line.startsWith('abandoned '))))?.slice('abandoned '.length);
	await until(() => !alive(pid_of('8.0.0')));
	check('an app closed after downloading leaves the archive in the temp directory', abandoned !== undefined && existsSync(abandoned), true);

	launch('--with', 'an argument');
	const back = await until(() => lines().some((line) => line === 'done 9.0.0' || line.startsWith('error ')));
	check(
		'a running app replaces itself and comes back as the new version on its own, after the old one is gone, with its arguments',
		lines()
			.filter((line) => !line.startsWith('abandoned '))
			.map((line) => line.replace(/^(start \S+) \d+/, '$1')),
		['start 8.0.0 finish', 'finished', 'start 8.0.0 abandon', 'done 8.0.0', 'start 8.0.0 --with an argument', 'start 9.0.0 --with an argument', 'waited for 8.0.0: exited, previous gone: true', 'done 9.0.0']
	);
	const old_pid = pid_of('8.0.0');
	const new_pid = pid_of('9.0.0');
	const settled = back && (await until(() => !alive(old_pid) && !alive(new_pid)));
	check('the old process is gone and the new one was a process of its own', [settled, old_pid !== new_pid], [true, true]);
	check('the new version is what is on disk', existsSync(exe) ? sha256_file(exe) : null, sha256_file(fresh_exe));
	check('the new instance swept the staging directory the old one left', staging_in(home), []);
	check('the next launch deleted the archive the closed app left', abandoned !== undefined && existsSync(abandoned), false);
}

/** On macOS a copy under AppTranslocation, where Gatekeeper runs an app opened straight from a download. */
async function translocated_run(home: string): Promise<unknown> {
	if (!darwin) return true;
	const away = join(scratch, 'AppTranslocation', 'x');
	mkdirSync(away, { recursive: true });
	cpSync(join(home, 'Real.app'), join(away, 'Real.app'), { recursive: true });
	spawn(join(away, 'Real.app', 'Contents', 'MacOS', 'real'), [], { detached: true, stdio: 'ignore', cwd: away }).unref();
	const trace = join(away, 'trace.log');
	const outcome = await until(() => (existsSync(trace) ? /^(?:error|done) .*$/m.exec(readFileSync(trace, 'utf8'))?.[0] : undefined));
	return outcome?.startsWith('error 8.0.0 macOS is running this app from a read-only copy');
}

function build_real(dir: string, version: string): string {
	const bundle = join(dir, 'Real.app');
	const exe = darwin ? join(bundle, 'Contents', 'MacOS', 'real') : join(dir, win32 ? 'real.exe' : 'real');
	mkdirSync(dirname(exe), { recursive: true });
	const app = { name: 'Real', slug: 'real', identifier: 'com.x.real', version, update: { manifest: `${base}/real.json`, publicKey: keys.publicKey } };
	const bun = process.versions.bun ? process.execPath : 'bun';
	// Windows gets the console-less executable gpuix-svelte/build makes, since that decides what a child inherits.
	const flags = win32 ? ['--windows-hide-console'] : [];
	run(bun, ['build', '--compile', ...flags, `--define=process.env.GPUIX_APP_INFO=${JSON.stringify(JSON.stringify(app))}`, join(root, 'test', 'relaunch-app.ts'), '--outfile', basename(exe)], undefined, dirname(exe));
	if (darwin) writeFileSync(join(bundle, 'Contents', 'Info.plist'), info_plist({ ...app, icon: '' }));
	return exe;
}

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function until<T>(read: () => T, timeout = 30000): Promise<T | undefined> {
	const started = Date.now();
	for (;;) {
		const value = read();
		if (value || Date.now() - started > timeout) return value || undefined;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

type Failure = (Error & { code?: string }) | null;

function failure_of(work: Promise<unknown>): Promise<Failure> {
	return work.then(
		() => null,
		(error: Error & { code?: string }) => error
	);
}

function kept_app(failure: Failure): { path?: string; version?: string } {
	const path = /kept at (.+)$/.exec(failure?.message ?? '')?.[1];
	return { path, version: path && existsSync(path) ? read_version(path) : undefined };
}

function strandable(name: string) {
	const dir = join(scratch, name);
	mkdirSync(dir);
	const victim = fake_app(dir, '1.0.0');
	return { dir, victim, check: () => check_for_update({ manifest: `${base}/strands.json`, version: '1.0.0', target: victim }) };
}

/**
 * A fake passes the bundle check but can't start, so `after_swap`, run from the working directory read that follows the swap, sets up what the relaunch meets.
 * `process.exit` only records, or a relaunch that "succeeded" would end this file green.
 */
async function relaunch_into(name: string, after_swap: (exe: string, dir: string) => void = () => {}, options: InstallOptions = {}) {
	const { dir, victim, check: check_it } = strandable(name);
	const update = await check_it();
	const exe = darwin ? join(victim, 'Contents', 'MacOS', 'fake') : victim;
	const { cwd, exit } = process;
	const now = Date.now;
	let swapped = false;
	let exited: number | null = null;
	process.cwd = () => {
		if (swapped || read_version(victim) !== '9.0.0') return cwd();
		swapped = true;
		after_swap(exe, dir);
		return cwd();
	};
	process.exit = ((code?: number) => {
		exited = code ?? 0;
		throw new Error('exited');
	}) as typeof process.exit;
	// A hung install carries on after this returns and could reach the real process.exit(0) before finish(), so a hang ends the suite here.
	const hung = setTimeout(() => {
		console.error(`update: the install in ${name} had not settled after 20 s`);
		exit.call(process, 1);
	}, 20000);
	try {
		const failure = await failure_of(update!.install(options));
		return { failure, exited, installed: update!.installed, version: existsSync(exe) ? read_version(victim) : undefined, dir };
	} finally {
		clearTimeout(hung);
		process.cwd = cwd;
		process.exit = exit;
		Date.now = now;
	}
}

function script(body: string) {
	return (exe: string) => {
		writeFileSync(exe, `#!/bin/sh\n${body}\n`);
		chmodSync(exe, 0o755);
	};
}

async function rolled_back(name: string, why: string, after_swap: (exe: string) => void): Promise<unknown> {
	if (win32) return 'skipped';
	const { failure, version, installed, exited } = await relaunch_into(name, after_swap);
	return [failure?.code, failure?.message.includes(why) ? why : failure?.message, version, installed, exited];
}

/** The fake executable never starts, so an install that relaunches always ends in the rollback. */
async function after_failed_relaunch(): Promise<unknown> {
	const { failure, version, installed, exited } = await relaunch_into('rolled-back');
	return [failure?.code, failure?.message.includes('the previous one is back in place'), version, installed, exited];
}

// Ten seconds of READY_TIMEOUT in half a second: the relaunch reads the clock once a poll.
function hurried(pid_file: string) {
	return (exe: string) => {
		script(`echo $$ > "${pid_file}"\nsleep 10`)(exe);
		const now = Date.now;
		let skew = 0;
		Date.now = () => now() + (skew += 1000);
	};
}

async function gone_soon(pid_file: string): Promise<boolean> {
	const pid = existsSync(pid_file) ? Number(readFileSync(pid_file, 'utf8')) : 0;
	return pid > 0 && (await until(() => !alive(pid), 2000)) === true;
}

function reporting(out: string) {
	return script(`if [ /dev/fd/1 -ef /dev/null ]; then output=silent; else output=heard; fi
printf '%s\\n' "$$" "$output" "$(pwd -P)" "$GPUIX_UPDATED_FROM" "$@" > "${out}"
printf ready > "$GPUIX_RELAUNCH_READY"
sleep 5`);
}

function read_report(out: string): string[] {
	return existsSync(out) ? readFileSync(out, 'utf8').trimEnd().split('\n') : [];
}

function stop_group(pid: string) {
	// An empty pid would make this -0, which is this runner's own process group.
	if (!/^[1-9]\d*$/.test(pid)) return;
	try {
		process.kill(-Number(pid));
	} catch {
		// Not a group of its own, which the check has already said.
	}
}

async function relaunch_reports(): Promise<unknown> {
	if (win32) return 'skipped';
	const out = join(scratch, 'reports.txt');
	const { exited } = await relaunch_into('reports', reporting(out), { args: ['--flag', 'two words'] });
	const [pid, output, cwd, from, ...args] = read_report(out);
	const own_group = /^[1-9]\d*$/.test(pid ?? '') && alive(-Number(pid));
	stop_group(pid);
	return [exited, output, cwd, from, args, own_group, in_temp('gpuix-svelte-relaunch-')];
}

async function relaunch_without_cwd(): Promise<unknown> {
	if (win32) return 'skipped';
	const out = join(scratch, 'reports-elsewhere.txt');
	const { exited } = await relaunch_into('reports-elsewhere', (exe) => {
		reporting(out)(exe);
		throw new Error('ENOENT: uv_cwd');
	});
	const [pid, , cwd] = read_report(out);
	stop_group(pid);
	return [exited, cwd];
}

async function after_stranding(): Promise<unknown> {
	if (no_locks) return 'skipped';
	// The relaunch reads the working directory right after the swap, and a fake executable never starts, so this locks the rollback out.
	const { failure, installed, dir } = await relaunch_into('stranded', (_exe, dir) => chmodSync(dir, 0o555));
	chmodSync(dir, 0o755);
	return [failure?.code, failure?.message.includes('could not be put back'), installed, kept_app(failure).version];
}

async function after_stranding_kept(): Promise<unknown> {
	if (no_locks) return 'skipped';
	const { failure, dir } = await relaunch_into('stranded-kept', (_exe, dir) => {
		const staging = join(dir, staging_in(dir)[0]);
		// Staging has to stay renamable, and macOS 15 won't rename a read-only directory, so a bundle gets a non-empty directory in its way instead.
		if (darwin) mkdirSync(join(staging, `failed-${app_name}`, 'in the way'), { recursive: true });
		else chmodSync(staging, 0o555);
	});
	const { path, version } = kept_app(failure);
	const named = path !== undefined && /^\.update-kept-\d+-/.test(basename(dirname(path)));
	for (const name of staging_in(dir)) chmodSync(join(dir, name), 0o755);
	return [failure?.code, named, version];
}

/** rename_in allocates its sleeper between swap's two renames, the only moment a test can get in there. */
function between_swap_renames(hook: () => void): () => void {
	const Real = globalThis.SharedArrayBuffer;
	globalThis.SharedArrayBuffer = function (length: number) {
		globalThis.SharedArrayBuffer = Real;
		hook();
		return new Real(length);
	} as unknown as typeof SharedArrayBuffer;
	return () => {
		globalThis.SharedArrayBuffer = Real;
	};
}

function pretend(platform: NodeJS.Platform): () => void {
	const real = Object.getOwnPropertyDescriptor(process, 'platform')!;
	Object.defineProperty(process, 'platform', { value: platform, configurable: true });
	return () => Object.defineProperty(process, 'platform', real);
}

async function after_failed_rename_in(): Promise<unknown> {
	if (win32) return 'skipped';
	const { dir, victim, check: check_it } = strandable('no-rename-in');
	const update = await check_it();
	const restore = between_swap_renames(() => rmSync(join(dir, staging_in(dir)[0], basename(victim)), { recursive: true }));
	const failure = await failure_of(update!.install({ relaunch: false }));
	restore();
	return [failure?.code, failure?.message.includes('cannot move the new version'), existsSync(victim) ? read_version(victim) : undefined, update!.installed, staging_in(dir)];
}

async function after_stranded_swap(): Promise<unknown> {
	if (no_locks) return 'skipped';
	const { dir, victim, check: check_it } = strandable('stranded-swap');
	const update = await check_it();
	const restore = between_swap_renames(() => {
		rmSync(join(dir, staging_in(dir)[0], basename(victim)), { recursive: true });
		chmodSync(dir, 0o555);
	});
	const failure = await failure_of(update!.install({ relaunch: false }));
	restore();
	chmodSync(dir, 0o755);
	return [failure?.code, failure?.message.includes('nor the old one back'), kept_app(failure).version, update!.installed];
}

async function after_failed_move_aside(): Promise<unknown> {
	if (no_locks) return 'skipped';
	const { dir, victim, check: check_it } = strandable('no-move-aside');
	const update = await check_it();
	await update!.download();
	const real = Object.getOwnPropertyDescriptor(process, 'platform')!;
	// Extraction reads the platform per entry, by when the staging directory exists and locking the one around it stops only the move.
	Object.defineProperty(process, 'platform', {
		configurable: true,
		get() {
			if (staging_in(dir).length) chmodSync(dir, 0o555);
			return real.value;
		}
	});
	const failure = await failure_of(update!.install({ relaunch: false }));
	Object.defineProperty(process, 'platform', real);
	chmodSync(dir, 0o755);
	return [failure?.code, failure?.message.includes('aside'), read_version(victim), update!.installed];
}

async function install_as(platform: NodeJS.Platform, manifest: string, target: string, hook?: () => void): Promise<string | null> {
	const update = await check_for_update({ manifest: `${base}/${manifest}`, version: '1.0.0', target });
	await update!.download();
	const restore = pretend(platform);
	const unhook = hook ? between_swap_renames(hook) : () => {};
	try {
		return await code_async(() => update!.install({ relaunch: false }));
	} finally {
		unhook();
		restore();
	}
}

/** The Windows path but for the renames' own semantics, so it runs everywhere. */
async function windows_path() {
	const dir = join(scratch, 'as-windows');
	mkdirSync(dir);
	const exe = join(dir, 'fake.exe');
	const read = (file: string) => (existsSync(file) ? readFileSync(file, 'latin1') : null);
	const fresh_install = (manifest: string) => {
		writeFileSync(exe, 'MZ fake 1.0.0');
		return install_as('win32', manifest, exe);
	};
	mkdirSync(`${exe}.old`);
	writeFileSync(join(`${exe}.old`, 'in the way'), '');
	const beside_stale = [await fresh_install('as-windows.json'), read(exe), read(`${exe}.${process.pid}.old`)];
	rmSync(`${exe}.old`, { recursive: true });
	const beside_nothing = [await fresh_install('as-windows.json'), read(exe), read(`${exe}.old`)];
	writeFileSync(`${exe}.settings.old`, '');
	writeFileSync(join(dir, 'fakeXexe.old'), '');
	const restore = pretend('win32');
	finish_update(exe);
	restore();
	const left = readdirSync(dir).sort();
	return { kept: [...beside_stale, ...beside_nothing], left, refused: [await fresh_install('not-windows.json'), read(exe)] };
}

/** The antivirus is a read-only parent, let go at the first sleep or never. */
async function held_rename_in(lets_go: boolean): Promise<unknown> {
	if (no_locks) return 'skipped';
	const dir = join(scratch, lets_go ? 'held' : 'held-for-good');
	mkdirSync(dir);
	const exe = join(dir, 'fake.exe');
	writeFileSync(exe, 'MZ fake 1.0.0');
	let held = '';
	const hold = () => {
		held = join(dir, staging_in(dir)[0], 'as-windows-src');
		chmodSync(held, 0o555);
	};
	const wait = Atomics.wait;
	let sleeps = 0;
	Atomics.wait = (() => {
		sleeps++;
		if (lets_go) chmodSync(held, 0o755);
		return 'timed-out';
	}) as typeof Atomics.wait;
	const code_of = await install_as('win32', 'as-windows.json', exe, hold);
	Atomics.wait = wait;
	if (existsSync(held)) chmodSync(held, 0o755);
	return [code_of, sleeps, existsSync(exe) ? readFileSync(exe, 'latin1') : null];
}

/** The Linux path, likewise. */
async function linux_path(): Promise<unknown> {
	const dir = join(scratch, 'as-linux');
	mkdirSync(dir);
	const exe = join(dir, 'fake');
	writeFileSync(exe, `${elf} fake 1.0.0`, 'latin1');
	const refused = await install_as('linux', 'not-linux.json', exe);
	const unchanged = last_word(exe);
	const installed_code = await install_as('linux', 'as-linux.json', exe);
	return [refused, unchanged, installed_code, last_word(exe), win32 || (statSync(exe).mode & 0o111) !== 0];
}

async function refused_unfetched(manifest: string): Promise<unknown> {
	let fetched = false;
	const result = await code_async(() =>
		check_for_update({
			manifest,
			version: '1.0.0',
			fetch: (async () => {
				fetched = true;
				return new Response('{}');
			}) as unknown as typeof fetch
		})
	);
	return [result, fetched];
}

async function locked_after_check(): Promise<unknown> {
	if (no_locks) return 'skipped';
	const { dir, victim, check: check_it } = strandable('locked-later');
	const update = await check_it();
	chmodSync(dir, 0o555);
	const result = [await code_async(() => update!.install({ relaunch: false })), read_version(victim)];
	chmodSync(dir, 0o755);
	return result;
}

async function read_only_reason(): Promise<string> {
	if (no_locks) return 'skipped';
	const locked = join(scratch, 'locked');
	mkdirSync(locked);
	const victim = fake_app(locked, '1.0.0');
	chmodSync(locked, 0o555);
	try {
		const update = await check_for_update({ manifest: `${base}/update.json`, version: '1.0.0', target: victim });
		return `${update?.reason}:${(await code_async(() => update!.install({ relaunch: false }))) ?? 'no error'}`;
	} finally {
		chmodSync(locked, 0o755);
	}
}

// --- the zip itself ----------------------------------------------------------------------------

const tree = join(scratch, 'tree');
mkdirSync(join(tree, 'sub', 'deep'), { recursive: true });
writeFileSync(join(tree, 'sub', 'deep', 'run'), '#!/bin/sh\n', { mode: 0o755 });
writeFileSync(join(tree, 'sub', 'data.bin'), Buffer.alloc(70000, 7));
writeFileSync(join(tree, 'secret'), 'x', { mode: 0o600 });
const tree_zip = join(scratch, 'tree.zip');
write_zip(tree, tree_zip);
const entries = new AdmZip(tree_zip).getEntries();
const entry_mode = (name: string) => ((entries.find((entry) => entry.entryName === name)?.header.attr ?? 0) >>> 16).toString(8);
check(
	'write_zip keeps the parent folder, directories and modes, and deflates what shrinks',
	[entries.map((entry) => entry.entryName).sort(), win32 || entry_mode('tree/sub/deep/run'), win32 || entry_mode('tree/secret'), statSync(tree_zip).size < 70000],
	[['tree/secret', 'tree/sub/', 'tree/sub/data.bin', 'tree/sub/deep/', 'tree/sub/deep/run'], win32 || '100755', win32 || '100600', true]
);
const out = join(scratch, 'tree-out');
check(
	'extract_zip writes it all back with the modes',
	[extract_zip(tree_zip, out), readFileSync(join(out, 'tree', 'sub', 'data.bin')).length, win32 || (statSync(join(out, 'tree', 'sub', 'deep', 'run')).mode & 0o777).toString(8), win32 || (statSync(join(out, 'tree', 'secret')).mode & 0o777).toString(8)],
	[entries.length, 70000, win32 || '755', win32 || '600']
);
const hostile = (benign: string, name: string) => {
	const file = join(scratch, 'hostile.zip');
	hostile_zip(benign, name, file);
	try {
		extract_zip(file, join(scratch, 'hostile-out'));
		return 'extracted';
	} catch (error) {
		return (error as Error).message.includes('would land outside') ? 'refused' : (error as Error).message;
	}
};
check(
	'paths that would leave the directory are refused: .., absolute, a drive letter, backslashes',
	[hostile('ok/escape', '../escape'), hostile('xx/abs', '/x/abs'), hostile('cc/abs', 'C:/abs'), hostile('a/b/c', 'a\\b\\c'), hostile('x/file', './file'), hostile('ok/file', 'ok/file')],
	['refused', 'refused', 'refused', 'refused', 'refused', 'extracted']
);
const sidecars = new AdmZip();
sidecars.addFile('__MACOSX/._junk', Buffer.from('x'));
sidecars.addFile('__MACOSX/junk', Buffer.from('x'));
sidecars.addFile('ok/._junk', Buffer.from('x'));
sidecars.addFile('ok/file', Buffer.from('x'));
sidecars.writeZip(join(scratch, 'sidecars.zip'));
check("Apple's sidecars are skipped", [extract_zip(join(scratch, 'sidecars.zip'), join(scratch, 'sidecars-out')), readdirSync(join(scratch, 'sidecars-out')), readdirSync(join(scratch, 'sidecars-out', 'ok'))], [1, ['ok'], ['file']]);
// Random bytes don't deflate, so the entry is stored and a flipped data byte is a CRC error, not a zlib one.
const stored = new AdmZip();
stored.addFile('f', randomBytes(64));
const corrupt = stored.toBuffer();
corrupt[30 + 1 + 10] ^= 0xff;
writeFileSync(join(scratch, 'corrupt.zip'), corrupt);
check('a damaged entry fails its CRC rather than installing', message(() => extract_zip(join(scratch, 'corrupt.zip'), join(scratch, 'corrupt-out'))).includes('CRC'), true);
const loose = new AdmZip();
loose.addFile('loose/open', Buffer.from('x'), '', 0o777);
loose.writeZip(join(scratch, 'loose.zip'));
extract_zip(join(scratch, 'loose.zip'), join(scratch, 'loose-out'));
check('an entry writable by everyone comes out writable by its owner only', win32 ? '755' : (statSync(join(scratch, 'loose-out', 'loose', 'open')).mode & 0o777).toString(8), '755');
const modeless = new AdmZip();
modeless.addFile('modeless/file', Buffer.from('x'));
modeless.getEntries()[0].header.attr = 0;
modeless.writeZip(join(scratch, 'modeless.zip'));
extract_zip(join(scratch, 'modeless.zip'), join(scratch, 'modeless-out'));
check('an entry with no modes comes out writable by its owner only', win32 ? '644' : (statSync(join(scratch, 'modeless-out', 'modeless', 'file')).mode & 0o777).toString(8), '644');
const linked = join(scratch, 'linked');
mkdirSync(linked);
writeFileSync(join(linked, 'real'), 'x');
if (!win32) symlinkSync('real', join(linked, 'link'));
check('a symlink is refused when the archive is written', win32 ? 'symlink' : message(() => write_zip(linked, join(scratch, 'linked.zip'))).includes('symlink') ? 'symlink' : 'written', 'symlink');
const link_entry = new AdmZip();
link_entry.addFile('x/link', Buffer.from('target'));
// S_IFLNK in the top half of the attribute, past what addFile lets through.
link_entry.getEntries()[0].header.attr = 0o120777 * 0x10000;
link_entry.writeZip(join(scratch, 'link.zip'));
check('a symlink entry is refused when the archive is opened', message(() => extract_zip(join(scratch, 'link.zip'), join(scratch, 'link-out'))).includes('is a symlink'), true);
writeFileSync(join(scratch, 'nope.zip'), 'nope');
check('not a zip at all', message(() => extract_zip(join(scratch, 'nope.zip'), join(scratch, 'nope-out'))).startsWith('not a zip file'), true);

// --- the CLI -------------------------------------------------------------------------------

const bin = join(root, 'bin', 'gpuix-svelte.js');
const cli = (...args: string[]) => spawnSync(process.execPath, [bin, 'update', ...args], { cwd: scratch, encoding: 'utf8', env: { ...process.env, GPUIX_UPDATE_KEY: undefined } });

const keygen = cli('keygen', '--out', 'key.pem');
const public_key = keygen.stdout.trim();
check(
	'keygen writes the key for its owner only and prints the public key',
	[keygen.status, win32 || (existsSync(join(scratch, 'key.pem')) && (statSync(join(scratch, 'key.pem')).mode & 0o777).toString(8)), is_public_key(public_key)],
	[0, win32 || '600', true]
);
check('keygen refuses to overwrite', cli('keygen', '--out', 'key.pem').status, 1);
writeFileSync(join(scratch, 'notes.md'), '## 2.0.0\n- things\n');
writeFileSync(join(scratch, 'fragment.json'), JSON.stringify(fragment));
const manifested = cli('manifest', '--out', 'update.json', '--base-url', 'https://example.com/v2/', '--notes', 'notes.md', '--key', 'key.pem', '--public-key', public_key, 'fragment.json');
const written = JSON.parse(readFileSync(join(scratch, 'update.json'), 'utf8')) as UpdateManifest;
check(
	'manifest merges, reads the notes, signs and checks the signature against --public-key',
	[manifested.status, written.version, written.notes, written.platforms[platform]?.url, verify_manifest(written, public_key)],
	[0, '2.0.0', '## 2.0.0\n- things\n', `https://example.com/v2/${fragment.file}`, true]
);
const from_env = spawnSync(process.execPath, [bin, 'update', 'manifest', '--out', 'env.json', '--base-url', 'https://x/', 'fragment.json'], { cwd: scratch, encoding: 'utf8', env: { ...process.env, GPUIX_UPDATE_KEY: readFileSync(join(scratch, 'key.pem'), 'utf8') } });
check('GPUIX_UPDATE_KEY signs when there is no --key', [from_env.status, verify_manifest(JSON.parse(readFileSync(join(scratch, 'env.json'), 'utf8')) as UpdateManifest, public_key)], [0, true]);
check('verify accepts it', cli('verify', '--public-key', public_key, 'update.json').status, 0);
writeFileSync(join(scratch, 'tampered.json'), JSON.stringify({ ...written, version: '9.9.9' }));
check('verify rejects a tampered copy', cli('verify', '--public-key', public_key, 'tampered.json').status, 1);
check(
	'the CLI fails rather than writing a wrong manifest: a mismatched --public-key, --public-key with nothing to sign with, a mangled --public-key, a missing fragment, an unknown flag, a missing flag',
	[
		cli('manifest', '--out', 'x.json', '--base-url', 'https://x/', '--key', 'key.pem', '--public-key', keys.publicKey, 'fragment.json').status,
		cli('manifest', '--out', 'x.json', '--base-url', 'https://x/', '--public-key', public_key, 'fragment.json').status,
		cli('manifest', '--out', 'x.json', '--base-url', 'https://x/', '--key', 'key.pem', '--public-key', 'C:/mangled', 'fragment.json').status,
		cli('manifest', '--out', 'x.json', '--base-url', 'https://x/', 'fragment.json', 'nowhere.json').status,
		cli('manifest', '--out', 'x.json', '--base-url', 'https://x/', '--private-key', 'key.pem', 'fragment.json').status,
		cli('manifest', '--out', 'x.json').status,
		existsSync(join(scratch, 'x.json'))
	],
	[1, 1, 2, 1, 2, 2, false]
);

// --- the relaunch handshake and the plist reader ------------------------------------------------

delete process.env.GPUIX_RELAUNCH_AFTER;
process.env.GPUIX_UPDATED_FROM = '1.2.3';
check('with no previous instance named there is nothing to wait for', wait_for_previous_instance(), false);
check('updated_from() remembers the version the environment named and takes it out of the environment', [updated_from(), updated_from(), process.env.GPUIX_UPDATED_FROM], ['1.2.3', '1.2.3', undefined]);
const ready = join(scratch, 'ready-sentinel');
process.env.GPUIX_RELAUNCH_READY = ready;
process.env.GPUIX_RELAUNCH_AFTER = 'not a pid';
check('the sentinel is written for the instance that started this one, and a bad pid is ignored', [wait_for_previous_instance(), existsSync(ready) && readFileSync(ready, 'utf8') === String(process.pid), process.env.GPUIX_RELAUNCH_READY], [false, true, undefined]);
process.env.GPUIX_RELAUNCH_READY = join(scratch, 'no', 'such', 'directory', 'sentinel');
check('a sentinel that cannot be written costs this instance nothing', message(() => wait_for_previous_instance()), 'no error');
check(
	'a pid that names no one process is ignored: this process group, every process, not a whole number',
	['0', '-1', '1.5'].map((raw) => {
		process.env.GPUIX_RELAUNCH_AFTER = raw;
		return wait_for_previous_instance(200);
	}),
	[false, false, false]
);
// A grandchild, as the replaced instance is never the new one's child: a child would sit unreaped
// (and so still "alive") while the wait blocks the event loop.
const short_lived = Number(
	spawnSync(process.execPath, ['-e', "const c = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 400)'], { detached: true, stdio: 'ignore' }); c.unref(); console.log(c.pid)"], { encoding: 'utf8' }).stdout
);
process.env.GPUIX_RELAUNCH_AFTER = String(short_lived);
const waited_from = Date.now();
check(
	'the new instance waits until the previous pid is gone, then forgets the variable',
	[wait_for_previous_instance(), Date.now() - waited_from >= 250 && Date.now() - waited_from < 5000, alive(short_lived), process.env.GPUIX_RELAUNCH_AFTER],
	['exited', true, false, undefined]
);
process.env.GPUIX_RELAUNCH_AFTER = String(spawnSync(process.execPath, ['-e', '']).pid);
const gone_from = Date.now();
check('a previous instance that is already gone costs nothing', [wait_for_previous_instance(), process.env.GPUIX_RELAUNCH_AFTER, Date.now() - gone_from < 2000], ['exited', undefined, true]);
const console_warn = console.warn;
const warned: string[] = [];
console.warn = (text: string) => warned.push(text);
process.env.GPUIX_RELAUNCH_AFTER = String(process.pid);
check('a previous instance that never exits is given up on, and said so', [wait_for_previous_instance(300), warned.length === 1 && warned[0].includes(String(process.pid))], ['timed-out', true]);
// Another user's process, which kill(0) answers with EPERM rather than ESRCH.
process.env.GPUIX_RELAUNCH_AFTER = '1';
check("another user's live process is not taken for gone", win32 ? 'timed-out' : wait_for_previous_instance(100), 'timed-out');
console.warn = console_warn;

const plist = join(scratch, 'Info.plist');
writeFileSync(
	plist,
	`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>my-app</string>
	<key>CFBundleIdentifier</key>
	<string>com.example.my-app</string>
	<key>CFBundleDocumentTypes</key>
	<array><dict><key>CFBundleIdentifier</key><string>nested.decoy</string><key>CFBundleTypeName</key><string>Text</string></dict></array>
	<key>CFBundleURLTypes</key>
	<array/>
	<key>NSAppTransportSecurity</key>
	<dict/>
	<!-- <key>CFBundleIdentifier</key><string>comment.decoy</string> -->
	<key>Note</key>
	<string><![CDATA[<key>CFBundleIdentifier</key><string>cdata.decoy</string>]]></string>
	<?decoy <key>CFBundleIdentifier</key><string>pi.decoy</string> ?>
	<key>CFBundleName</key>
	<string>A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos; &#x2019;&#8217;</string>
	<key>A&amp;B</key>
	<string>key</string>
	<key>LSUIElement</key>
	<true/>
	<key>CFBundleShortVersionString</key>
	<string>1.2.3</string>
	<key>Empty</key>
	<string></string>
	<key>SelfClosed</key>
	<string/>
	<key>Bad</key>
	<string>&#x110000;</string>
</dict>
</plist>
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>second.root.decoy</string></dict></plist>
`
);
const strings = plist_strings(plist);
check(
	'plist_strings reads the top-level strings past empty collections, decodes entities, and ignores nested dictionaries, comments, CDATA, processing instructions and a second root',
	[strings?.get('CFBundleIdentifier'), strings?.get('CFBundleExecutable'), strings?.get('CFBundleName'), strings?.get('A&B'), strings?.get('CFBundleShortVersionString'), strings?.get('Empty'), strings?.get('SelfClosed'), strings?.get('Bad'), strings?.has('LSUIElement'), strings?.has('CFBundleTypeName')],
	['com.example.my-app', 'my-app', `A & B <C> "D" 'E' ’’`, 'key', '1.2.3', '', '', '&#x110000;', false, false]
);
check('the plist the build writes reads back', plist_strings((writeFileSync(plist, info_plist({ name: 'X', slug: 'x', identifier: 'com.x', version: '2.0.0', icon: '' })), plist))?.get('CFBundleIdentifier'), 'com.x');
const decoy = '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>decoy</string></dict></plist>';
writeFileSync(plist, Buffer.from(`bplist00\x00\x01${decoy}`));
const binary_plist = plist_strings(plist);
writeFileSync(plist, 'neither');
check('a binary plist reads as nothing, not as a crash, as does one with no <plist> or none at all', [binary_plist === null, plist_strings(plist) === null, plist_strings(join(scratch, 'missing.plist')) === null], [true, true, true]);

// Defender can hold an executable it has just seen written, and a slow delete is not a failed test.
await until(() => {
	try {
		rmSync(scratch, { recursive: true, force: true });
		return true;
	} catch {
		return false;
	}
}, 5000);
finish('update', 136);

/** A hostile name of the same length as a benign one, patched into a valid zip: the headers stay intact. */
function hostile_zip(benign: string, name: string, file: string) {
	const zip = new AdmZip();
	zip.addFile(benign, Buffer.from('x'));
	writeFileSync(file, Buffer.from(zip.toBuffer().toString('latin1').replaceAll(benign, name), 'latin1'));
}

function code(fn: () => unknown): string | null {
	try {
		fn();
		return null;
	} catch (error) {
		return error instanceof UpdateError ? error.code : `not an UpdateError: ${(error as Error).message}`;
	}
}

async function code_async(fn: () => Promise<unknown>): Promise<string | null> {
	try {
		await fn();
		return null;
	} catch (error) {
		return error instanceof UpdateError ? error.code : `not an UpdateError: ${(error as Error).message}`;
	}
}

function message(fn: () => unknown): string {
	try {
		fn();
		return 'no error';
	} catch (error) {
		return (error as Error).message;
	}
}
