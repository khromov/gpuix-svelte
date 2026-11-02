/**
 * gpuix-svelte/update: version order, the manifest's signature and merge, the `app.update`
 * options read from an entry, and on this platform the whole path against a local server —
 * build({ archive: true })'s packer archives a fake app, the updater downloads it, checks the
 * hash, extracts it and swaps it in for a copy standing in for the running app, and refuses
 * what it must: insecure URLs, oversized or wrong downloads, archives without a real executable,
 * another app's bundle. Then a real executable (relaunch-app.ts, compiled by Bun) replaces itself
 * while running and has to come back as the new version. No headless renderer, so it runs on Linux
 * too, and it needs `bun` on PATH under Node.
 */

import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
	sign_manifest,
	UpdateError,
	verify_manifest,
	type UpdateManifest
} from '../src/update.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'gpuix-svelte-update-test-'));
const platform = update_platform();
const darwin = process.platform === 'darwin';
const win32 = process.platform === 'win32';

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
		compare_versions('1.2.3+build.5', '1.2.3')
	],
	[0, 1, -1, -1, -1, 1, 0, 0]
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
check('the signature does not depend on key order or whitespace', canonical_manifest({ notes: 'Fixes', ...signed }), canonical_manifest(signed));
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
	[merged.version, merged.notes, merged.url, merged.platforms['darwin-arm64'].url, merged.platforms['win32-x64'].size, typeof merged.published_at, merged.signature],
	['2.0.0', 'Notes', 'https://example.com/releases', 'https://example.com/releases/download/v2.0.0/app-2.0.0-darwin-arm64.zip', 20, 'string', undefined]
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
		code(() => build_manifest({ fragments: [{ ...fragments[0], size: -1 }], base_url: 'https://x' }))
	],
	['manifest', 'manifest', 'manifest', 'manifest']
);
check('a private key signs the merged manifest', verify_manifest(build_manifest({ fragments, base_url: 'https://x', private_key: keys.privateKey }), keys.publicKey), true);

// --- app.update in the entry -----------------------------------------------------------------

const entry = (app: string) => `import { render } from 'gpuix-svelte';\nrender(App, { title: 'T', app: { identifier: 'com.x.y', ${app} } });`;
check(
	'app.update is read with its manifest and public key',
	read_app_options(entry(`update: { manifest: 'https://x/update.json', publicKey: '${keys.publicKey}' }`)).update,
	{ manifest: 'https://x/update.json', publicKey: keys.publicKey }
);
check('a loopback http manifest is allowed, for trying things out', read_app_options(entry(`update: { manifest: 'http://127.0.0.1:8000/u.json' }`)).update?.manifest, 'http://127.0.0.1:8000/u.json');
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
delete process.env.GPUIX_APP_INFO;

check('with no manifest anywhere there is nothing to check', await check_for_update(), null);
check('a manifest with no version to compare against throws', await code_async(() => check_for_update({ manifest: 'https://127.0.0.1:9/update.json' })), 'version');
check('a plain http manifest is refused before it is fetched', await code_async(() => check_for_update({ manifest: 'http://example.com/update.json', version: '1.0.0' })), 'manifest');

// --- the whole path on this platform ----------------------------------------------------------

// A fake app shaped like build() output: new versions in src/, the "running" copy in installed/.
// The executables carry the platform's magic bytes, which is what locate() checks for.
const src = join(scratch, 'src');
const installed = join(scratch, 'installed');
const dist = join(scratch, 'dist');
for (const dir of [src, installed, dist]) mkdirSync(dir, { recursive: true });
const app_name = darwin ? 'Fake.app' : win32 ? 'fake.exe' : 'fake';
const magic = win32 ? 'MZ' : '\x7fELF';

function fake_app(dir: string, version: string, { identifier = 'com.x.fake', plist = true, program = true } = {}): string {
	if (darwin) {
		const bundle = join(dir, 'Fake.app');
		const macos = join(bundle, 'Contents', 'MacOS');
		mkdirSync(macos, { recursive: true });
		if (plist) {
			writeFileSync(
				join(bundle, 'Contents', 'Info.plist'),
				`<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${identifier}</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleExecutable</key><string>fake</string></dict></plist>\n`
			);
		}
		writeFileSync(join(macos, 'fake'), `#!/bin/sh\necho ${version}\n`);
		chmodSync(join(macos, 'fake'), 0o755);
		return bundle;
	}
	const file = join(dir, app_name);
	writeFileSync(file, `${program ? magic : ''}fake ${version}`, 'latin1');
	if (!win32) chmodSync(file, 0o755);
	return file;
}
const read_version = (target: string) => {
	const file = darwin ? join(target, 'Contents', 'MacOS', 'fake') : target;
	return readFileSync(file, 'latin1').trim().split(' ').pop();
};
function archive_of(output: string, version: string, extra: string[] = []): UpdateFragment {
	const archive = join(dist, archive_name({ slug: 'fake', version }));
	if (extra.length === 0) {
		write_archive(output, archive);
	} else {
		// An archive with more than the app in it, the way a hand-made one might be.
		const tar = win32 ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
		const names = [...extra, basename(output)];
		if (darwin) run('zip', ['-q', '-r', archive, ...names], undefined, dirname(output));
		else run(tar, [win32 ? '-a' : '-z', '-cf', archive, '-C', dirname(output), ...names]);
	}
	return update_fragment({ version }, archive);
}

const target = fake_app(installed, '1.0.0');
const fragment = archive_of(fake_app(src, '2.0.0'), '2.0.0');
check('the archive is named for the platform and carries its hash and size', [fragment.platform, fragment.file, fragment.sha256.length, fragment.size], [platform, archive_name({ slug: 'fake', version: '2.0.0' }), 64, statSync(join(dist, fragment.file)).size]);

const multi_dir = join(scratch, 'multi');
mkdirSync(multi_dir);
writeFileSync(join(multi_dir, 'LICENSE'), 'MIT');
const multi = archive_of(fake_app(multi_dir, '3.0.0'), '3.0.0', ['LICENSE']);
const bad_dir = join(scratch, 'bad');
mkdirSync(bad_dir);
const bad = archive_of(fake_app(bad_dir, '4.0.0', { plist: false, program: false }), '4.0.0');
const other_dir = join(scratch, 'other');
mkdirSync(other_dir);
const other = archive_of(fake_app(other_dir, '5.0.0', { identifier: 'com.x.other' }), '5.0.0');

const manifests: Record<string, (base: string) => UpdateManifest> = {
	'/update.json': (base) => build_manifest({ fragments: [fragment], base_url: base, notes: 'Second', url: `${base}/page`, private_key: keys.privateKey }),
	'/unsigned.json': (base) => build_manifest({ fragments: [fragment], base_url: base }),
	'/wrong-hash.json': (base) => build_manifest({ fragments: [{ ...fragment, sha256: 'ef'.repeat(32) }], base_url: base }),
	'/wrong-size.json': (base) => build_manifest({ fragments: [{ ...fragment, size: fragment.size + 1 }], base_url: base }),
	'/too-long.json': (base) => build_manifest({ fragments: [{ ...fragment, size: fragment.size - 1 }], base_url: base }),
	'/other-platform.json': (base) => build_manifest({ fragments: [{ ...fragment, platform: 'plan9-mips' }], base_url: base }),
	'/insecure.json': () => build_manifest({ fragments: [fragment], base_url: 'http://example.com/' }),
	'/multi.json': (base) => build_manifest({ fragments: [multi], base_url: base }),
	'/bad.json': (base) => build_manifest({ fragments: [bad], base_url: base }),
	'/other.json': (base) => build_manifest({ fragments: [other], base_url: base }),
	'/real.json': (base) => build_manifest({ fragments: [real_fragment!], base_url: base, private_key: keys.privateKey })
};
let real_fragment: UpdateFragment | undefined;
const server = createServer((request, response) => {
	const path = request.url ?? '/';
	const file = join(dist, basename(path));
	if (path in manifests) {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(manifests[path](base)));
	} else if (path === '/not-json') {
		response.end('<html>');
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
const staging_left = () => readdirSync(installed).filter((name) => name.startsWith('.update-'));

try {
	check('a 404 manifest throws manifest', await code_async(() => at('missing.json')), 'manifest');
	check('a non-JSON manifest throws manifest', await code_async(() => at('not-json')), 'manifest');
	check('a public key refuses an unsigned manifest', await code_async(() => at('unsigned.json', { publicKey: keys.publicKey })), 'signature');
	check('an asset that is not https is refused at check time', await code_async(() => at('insecure.json')), 'manifest');
	check('the running version is up to date', await at('update.json', { version: '2.0.0', publicKey: keys.publicKey }), null);
	check('a newer running version is up to date too', await at('update.json', { version: '2.1.0-beta.1' }), null);

	const no_asset = await at('other-platform.json');
	check('a manifest with nothing for this platform is reported, not installable', [no_asset?.version, no_asset?.installable, no_asset?.reason, no_asset?.asset], ['2.0.0', false, 'no-asset', null]);
	check('installing it throws not-installable', await code_async(() => no_asset!.install()), 'not-installable');

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
	check('the failed downloads left nothing in place', [read_version(target), staging_left()], ['1.0.0', []]);

	const bad_update = await at('bad.json');
	check('an archive whose contents are not an app of this platform is refused with extract, and the app is untouched', [await code_async(() => bad_update!.install({ relaunch: false })), read_version(target), staging_left()], ['extract', '1.0.0', []]);

	const update = await at('update.json', { publicKey: keys.publicKey });
	check(
		'the update carries the manifest',
		[update?.version, update?.current, update?.notes, update?.url, update?.platform, update?.asset?.url, update?.installable, update?.reason, update?.installed],
		['2.0.0', '1.0.0', 'Second', `${base}/page`, platform, `${base}/${fragment.file}`, true, undefined, false]
	);
	const progress: Array<[number, number | null]> = [];
	const [downloaded, again] = await Promise.all([update!.download({ onProgress: (received, total) => progress.push([received, total]) }), update!.download()]);
	check('the download lands in a temp file, reports its progress to the full size, and is shared while in flight', [existsSync(downloaded), progress.at(-1), again], [true, [fragment.size, fragment.size], downloaded]);
	check('a later download is the same file', await update!.download(), downloaded);
	finish_update(target);
	check("cleaning up leaves a running process's download alone", existsSync(downloaded), true);

	await update!.install({ relaunch: false });
	check('the new version is in place', [read_version(target), update!.installed], ['2.0.0', true]);
	check('the download and the staging directory are gone', [existsSync(downloaded), staging_left()], [false, []]);
	check('installing it again throws', await code_async(() => update!.install({ relaunch: false })), 'install');
	writeFileSync(`${target}.settings.old`, 'mine');
	if (!win32) {
		const executable = darwin ? join(target, 'Contents', 'MacOS', 'fake') : target;
		check('the executable bit survived the archive', (statSync(executable).mode & 0o111) !== 0, true);
		finish_update(target);
		check('finish_update has nothing to do off Windows', read_version(target), '2.0.0');
	} else {
		check('Windows keeps the old .exe beside the new one until the next launch', existsSync(`${target}.old`), true);
		finish_update(target);
		check('finish_update deletes it', existsSync(`${target}.old`), false);
	}
	check('finish_update leaves other .old files alone', existsSync(`${target}.settings.old`), true);

	const from_multi = await at('multi.json', { version: '2.0.0' });
	await from_multi!.install({ relaunch: false });
	check('in an archive with more than the app in it, the file named like the app is the one installed', read_version(target), '3.0.0');

	process.env.GPUIX_APP_INFO = JSON.stringify({ name: 'Fake', slug: 'fake', identifier: 'com.x.fake', version: '3.0.0' });
	const foreign = await at('other.json', { version: '3.0.0' });
	check(
		"on macOS another app's bundle is refused by its identifier (elsewhere there is no identifier to check)",
		[await code_async(() => foreign!.install({ relaunch: false })), read_version(target)],
		darwin ? ['extract', '3.0.0'] : [null, '5.0.0']
	);
	delete process.env.GPUIX_APP_INFO;

	check('a read-only install directory is reported at check time, before anything is downloaded', await read_only_reason(), win32 || process.getuid?.() === 0 ? 'skipped' : 'read-only:not-installable');

	const gone = spawnSync(process.execPath, ['-e', '']).pid;
	const stale = join(installed, `.update-${gone}-abcdef`);
	const live = join(installed, `.update-${process.pid}-abcdef`);
	mkdirSync(stale);
	mkdirSync(live);
	finish_update(target);
	check('a staging directory is deleted once its process is gone, and not while it runs', [existsSync(stale), existsSync(live)], [false, true]);
	rmSync(live, { recursive: true });

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

	launch('abandon');
	const abandoned = (await until(() => lines().find((line) => line.startsWith('abandoned '))))?.slice('abandoned '.length);
	await until(() => !alive(pid_of('8.0.0')));
	check('an app closed after downloading leaves the archive in the temp directory', abandoned !== undefined && existsSync(abandoned), true);

	launch();
	const back = await until(() => lines().some((line) => line === 'done 9.0.0' || line.startsWith('error ')));
	check(
		'a running app replaces itself and comes back as the new version on its own',
		lines()
			.filter((line) => !line.startsWith('abandoned '))
			.map((line) => line.replace(/^(start \S+) \d+$/, '$1')),
		['start 8.0.0', 'done 8.0.0', 'start 8.0.0', 'start 9.0.0', 'done 9.0.0']
	);
	const old_pid = pid_of('8.0.0');
	const new_pid = pid_of('9.0.0');
	const settled = back && (await until(() => !alive(old_pid) && !alive(new_pid)));
	check('the old process is gone and the new one was a process of its own', [settled, old_pid !== new_pid], [true, true]);
	check('the new version is what is on disk', existsSync(exe) ? sha256_file(exe) : null, sha256_file(fresh_exe));
	check('the next launch deleted the archive the closed app left', abandoned !== undefined && existsSync(abandoned), false);
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

async function read_only_reason(): Promise<string> {
	// Windows ACLs and root ignore mode bits, so the check means nothing there.
	if (win32 || process.getuid?.() === 0) return 'skipped';
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

// --- the CLI -------------------------------------------------------------------------------

const bin = join(root, 'bin', 'gpuix-svelte.js');
const cli = (...args: string[]) => spawnSync(process.execPath, [bin, 'update', ...args], { cwd: scratch, encoding: 'utf8', env: { ...process.env, GPUIX_UPDATE_KEY: undefined } });

const keygen = cli('keygen', '--out', 'key.pem');
const public_key = keygen.stdout.trim();
check('keygen writes the key and prints the public key', [keygen.status, existsSync(join(scratch, 'key.pem')), is_public_key(public_key)], [0, true, true]);
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
check('verify accepts it', cli('verify', '--public-key', public_key, 'update.json').status, 0);
writeFileSync(join(scratch, 'tampered.json'), JSON.stringify({ ...written, version: '9.9.9' }));
check('verify rejects a tampered copy', cli('verify', '--public-key', public_key, 'tampered.json').status, 1);
check(
	'the CLI fails rather than writing a wrong manifest: a mismatched --public-key, --public-key with nothing to sign with, a missing fragment, an unknown flag, a missing flag',
	[
		cli('manifest', '--out', 'x.json', '--base-url', 'https://x/', '--key', 'key.pem', '--public-key', keys.publicKey, 'fragment.json').status,
		cli('manifest', '--out', 'x.json', '--base-url', 'https://x/', '--public-key', public_key, 'fragment.json').status,
		cli('manifest', '--out', 'x.json', '--base-url', 'https://x/', 'nowhere.json').status,
		cli('manifest', '--out', 'x.json', '--base-url', 'https://x/', '--private-key', 'key.pem', 'fragment.json').status,
		cli('manifest', '--out', 'x.json').status,
		existsSync(join(scratch, 'x.json'))
	],
	[1, 1, 1, 2, 2, false]
);

// Defender can hold an executable it has just seen written, and a slow delete is not a failed test.
await until(() => {
	try {
		rmSync(scratch, { recursive: true, force: true });
		return true;
	} catch {
		return false;
	}
}, 5000);
finish('update', 69);

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
