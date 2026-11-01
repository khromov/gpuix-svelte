/**
 * gpuix-svelte/update: version order, the manifest's signature and merge, the `app.update`
 * options read from an entry, and on this platform the whole path against a local server —
 * build({ archive: true })'s packer archives a fake app, the updater downloads it, checks the
 * hash, extracts it and swaps it in for a copy standing in for the running app. The relaunch is
 * the one step not run. No headless renderer, so it runs on Linux too.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, finish } from 'gpuix-svelte/test';
import { archive_name, read_app_options, update_fragment, update_platform, write_archive } from '../src/app-bundle.ts';
import {
	app_info,
	build_manifest,
	canonical_manifest,
	check_for_update,
	compare_versions,
	finish_update,
	generate_keys,
	sign_manifest,
	UpdateError,
	verify_manifest,
	type UpdateManifest
} from '../src/update.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'gpuix-svelte-update-test-'));
const platform = update_platform();

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

// --- signatures ----------------------------------------------------------------------------

const keys = generate_keys();
const manifest: UpdateManifest = {
	version: '2.0.0',
	notes: 'Fixes',
	published_at: '2026-11-01T00:00:00Z',
	platforms: { 'darwin-arm64': { url: 'https://example.com/a.zip', sha256: 'ab'.repeat(32), size: 1 } }
};
check('the public key is 32 raw bytes, base64', Buffer.from(keys.publicKey, 'base64').length, 32);
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

const fragments = [
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
check('a private key signs the merged manifest', verify_manifest(build_manifest({ fragments, base_url: 'https://x', private_key: keys.privateKey }), keys.publicKey), true);

// --- app.update in the entry -----------------------------------------------------------------

const entry = (app: string) => `import { render } from 'gpuix-svelte';\nrender(App, { title: 'T', app: { identifier: 'com.x.y', ${app} } });`;
check(
	'app.update is read with its manifest and public key',
	read_app_options(entry(`update: { manifest: 'https://x/update.json', publicKey: 'KEY' }`)).update,
	{ manifest: 'https://x/update.json', publicKey: 'KEY' }
);
check('app.update without a manifest fails the build', message(() => read_app_options(entry('update: { publicKey: "K" }'))), 'app.update has no manifest URL');
check('a computed manifest URL names itself', message(() => read_app_options(entry('update: { manifest: url() }'))).startsWith('app.update.manifest is `url()`'), true);

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

// --- the whole path on this platform ----------------------------------------------------------

// A fake app shaped like build() output: the new version in src/, the "running" copy in installed/.
const src = join(scratch, 'src');
const installed = join(scratch, 'installed');
const dist = join(scratch, 'dist');
for (const dir of [src, installed, dist]) mkdirSync(dir, { recursive: true });

function fake_app(dir: string, version: string): string {
	if (process.platform === 'darwin') {
		const bundle = join(dir, 'Fake.app');
		const macos = join(bundle, 'Contents', 'MacOS');
		mkdirSync(macos, { recursive: true });
		writeFileSync(join(bundle, 'Contents', 'Info.plist'), `<plist><dict><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`);
		writeFileSync(join(macos, 'fake'), `#!/bin/sh\necho ${version}\n`);
		chmodSync(join(macos, 'fake'), 0o755);
		return bundle;
	}
	const file = join(dir, process.platform === 'win32' ? 'fake.exe' : 'fake');
	writeFileSync(file, `fake ${version}`);
	if (process.platform !== 'win32') chmodSync(file, 0o755);
	return file;
}
const read_version = (target: string) => {
	const file = process.platform === 'darwin' ? join(target, 'Contents', 'MacOS', 'fake') : target;
	return readFileSync(file, 'utf8').trim().split(' ').pop();
};

const fresh = fake_app(src, '2.0.0');
const target = fake_app(installed, '1.0.0');
const archive = join(dist, archive_name({ slug: 'fake', version: '2.0.0' }));
write_archive(fresh, archive);
const fragment = update_fragment({ version: '2.0.0' }, archive);
check('the archive is named for the platform and carries its hash and size', [fragment.platform, fragment.file, fragment.sha256.length, fragment.size], [platform, archive_name({ slug: 'fake', version: '2.0.0' }), 64, statSync(archive).size]);

const server = createServer((request, response) => {
	const path = request.url ?? '/';
	if (path === '/' + fragment.file) {
		response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': fragment.size });
		response.end(readFileSync(archive));
	} else if (path === '/update.json') {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(build_manifest({ fragments: [fragment], base_url: base, notes: 'Second', url: `${base}/page`, private_key: keys.privateKey })));
	} else if (path === '/unsigned.json') {
		response.end(JSON.stringify(build_manifest({ fragments: [fragment], base_url: base })));
	} else if (path === '/wrong-hash.json') {
		response.end(JSON.stringify(build_manifest({ fragments: [{ ...fragment, sha256: 'ef'.repeat(32) }], base_url: base })));
	} else if (path === '/wrong-size.json') {
		response.end(JSON.stringify(build_manifest({ fragments: [{ ...fragment, size: fragment.size + 1 }], base_url: base })));
	} else if (path === '/other-platform.json') {
		response.end(JSON.stringify(build_manifest({ fragments: [{ ...fragment, platform: 'plan9-mips' }], base_url: base })));
	} else if (path === '/not-json') {
		response.end('<html>');
	} else {
		response.writeHead(404);
		response.end();
	}
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

try {
	check('a 404 manifest throws manifest', await code_async(() => check_for_update({ manifest: `${base}/missing.json`, version: '1.0.0' })), 'manifest');
	check('a non-JSON manifest throws manifest', await code_async(() => check_for_update({ manifest: `${base}/not-json`, version: '1.0.0' })), 'manifest');
	check('a public key refuses an unsigned manifest', await code_async(() => check_for_update({ manifest: `${base}/unsigned.json`, version: '1.0.0', publicKey: keys.publicKey })), 'signature');
	check('the running version is up to date', await check_for_update({ manifest: `${base}/update.json`, version: '2.0.0', publicKey: keys.publicKey, target }), null);
	check('a newer running version is up to date too', await check_for_update({ manifest: `${base}/update.json`, version: '2.1.0-beta.1', target }), null);

	const other = await check_for_update({ manifest: `${base}/other-platform.json`, version: '1.0.0', target });
	check('a manifest with nothing for this platform is reported, not installable', [other?.version, other?.installable, other?.reason, other?.asset], ['2.0.0', false, 'no-asset', null]);
	check('installing it throws not-installable', await code_async(() => other!.install()), 'not-installable');

	const dev = await check_for_update({ manifest: `${base}/update.json`, version: '1.0.0' });
	check('without a built app or a target it is a development run', [dev?.installable, dev?.reason], [false, 'development']);

	const wrong_hash = await check_for_update({ manifest: `${base}/wrong-hash.json`, version: '1.0.0', target });
	check('a download whose sha256 differs throws hash', await code_async(() => wrong_hash!.download()), 'hash');
	const wrong_size = await check_for_update({ manifest: `${base}/wrong-size.json`, version: '1.0.0', target });
	check('a download whose size differs throws hash', await code_async(() => wrong_size!.download()), 'hash');
	check('the failed downloads left nothing in place', read_version(target), '1.0.0');

	const update = await check_for_update({ manifest: `${base}/update.json`, version: '1.0.0', publicKey: keys.publicKey, target });
	check(
		'the update carries the manifest',
		[update?.version, update?.current, update?.notes, update?.url, update?.platform, update?.asset?.url, update?.installable, update?.reason],
		['2.0.0', '1.0.0', 'Second', `${base}/page`, platform, `${base}/${fragment.file}`, true, undefined]
	);
	const progress: Array<[number, number | null]> = [];
	const downloaded = await update!.download({ onProgress: (received, total) => progress.push([received, total]) });
	check('the download lands in a temp file and reports its progress to the full size', [existsSync(downloaded), progress.at(-1)], [true, [fragment.size, fragment.size]]);
	check('a second download is the same file', await update!.download(), downloaded);

	await update!.install({ relaunch: false });
	check('the new version is in place', read_version(target), '2.0.0');
	check('the download and the staging directory are gone', [existsSync(downloaded), existsSync(join(installed, `.${process.platform === 'darwin' ? 'Fake.app' : process.platform === 'win32' ? 'fake.exe' : 'fake'}.update`))], [false, false]);
	if (process.platform !== 'win32') {
		const executable = process.platform === 'darwin' ? join(target, 'Contents', 'MacOS', 'fake') : target;
		check('the executable bit survived the archive', (statSync(executable).mode & 0o111) !== 0, true);
	} else {
		check('Windows keeps the old .exe beside the new one until the next launch', existsSync(`${target}.old`), true);
		finish_update(target);
		check('finish_update deletes it', existsSync(`${target}.old`), false);
	}
	check('a read-only install directory is reported at check time, before anything is downloaded', await read_only_reason(), process.platform === 'win32' || process.getuid?.() === 0 ? 'skipped' : 'read-only:not-installable');
} finally {
	server.close();
}

async function read_only_reason(): Promise<string> {
	// Windows ACLs and root ignore mode bits, so the check means nothing there.
	if (process.platform === 'win32' || process.getuid?.() === 0) return 'skipped';
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

const bin = join(root, 'bin', 'gpuix-svelte-update.js');
const cli = (...args: string[]) => spawnSync(process.execPath, [bin, ...args], { cwd: scratch, encoding: 'utf8' });

const keygen = cli('keygen', '--out', 'key.pem');
check('keygen writes the key and prints the public key', [keygen.status, existsSync(join(scratch, 'key.pem')), Buffer.from(keygen.stdout.trim(), 'base64').length], [0, true, 32]);
check('keygen refuses to overwrite', cli('keygen', '--out', 'key.pem').status, 1);
writeFileSync(join(scratch, 'notes.md'), '## 2.0.0\n- things\n');
writeFileSync(join(scratch, 'fragment.json'), JSON.stringify(fragment));
const manifested = cli('manifest', '--out', 'update.json', '--base-url', 'https://example.com/v2/', '--notes', 'notes.md', '--key', 'key.pem', 'fragment.json');
const written = JSON.parse(readFileSync(join(scratch, 'update.json'), 'utf8')) as UpdateManifest;
check(
	'manifest merges, reads the notes and signs',
	[manifested.status, written.version, written.notes, written.platforms[platform]?.url, verify_manifest(written, keygen.stdout.trim())],
	[0, '2.0.0', '## 2.0.0\n- things\n', `https://example.com/v2/${fragment.file}`, true]
);
check('verify accepts it', cli('verify', '--public-key', keygen.stdout.trim(), 'update.json').status, 0);
writeFileSync(join(scratch, 'tampered.json'), JSON.stringify({ ...written, version: '9.9.9' }));
check('verify rejects a tampered copy', cli('verify', '--public-key', keygen.stdout.trim(), 'tampered.json').status, 1);
check('a missing flag is a usage error', cli('manifest', '--out', 'x.json').status, 2);

rmSync(scratch, { recursive: true, force: true });
finish('update', 49);

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
