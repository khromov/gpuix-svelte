# Updating an app

A built app can update itself. You publish a small JSON manifest and one archive per platform on
any HTTPS host. The app reads the manifest, and when it names a newer version than the one
running, it downloads the archive, checks its hash (and the manifest's signature, if you sign),
swaps itself for the new version and restarts. GitHub Releases is the easiest host: the starter's
workflow builds every platform and uploads both when release-please cuts a release.

The pieces are `gpuix-svelte/update` in the app, `archive: true` in the build, and the
`gpuix-svelte update` command that writes the manifest.

## Setting it up

**1. Tell the app where its manifest is**, in the `app` options of `standalone.ts`. The starter
has this line commented out; uncomment it and fill in your repository:

```ts
render(App, {
	title: 'My App',
	app: {
		identifier: 'com.example.my-app',
		update: {
			manifest: 'https://github.com/you/my-app/releases/latest/download/update.json'
		}
	}
});
```

Write the values as string literals (or one hop through a top-level `const`), because the build
reads them from the source. It bakes them into the executable with the version, so the running app
knows both. Under `npm start` nothing is baked and `check_for_update()` resolves to null without
touching the network (see [Trying it out](#trying-it-out) for how to fake it).

**2. Check and install from the app.** `check_for_update()` resolves to null when the app is
current and otherwise to an `Update`:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { check_for_update, type Update } from 'gpuix-svelte/update';

	let update = $state<Update | null>(null);
	let progress = $state<number | null>(null);
	let error = $state('');

	onMount(() => {
		check_for_update().then((found) => (update = found), (e) => console.warn('update check failed:', e));
	});

	async function install() {
		try {
			await update!.download({ onProgress: (received, total) => (progress = total ? received / total : null) });
			await update!.install(); // swaps the app and restarts it; { relaunch: false } swaps and keeps running
		} catch (e) {
			error = (e as Error).message;
		}
	}
</script>

{#if update}
	<div class="banner">
		<div>Version {update.version} is available</div>
		{#if error}
			<div class="error">{error}</div>
		{:else if update.installable}
			<div class="btn" onclick={install}>{progress === null ? 'Install and restart' : `${Math.round(progress * 100)}%`}</div>
		{:else if update.url}
			<div>Get it at {update.url}</div>
		{/if}
	</div>
{/if}
```

`update.notes` carries the release notes (markdown; `<markdown>` renders it), `update.installable`
says whether `install()` can do its job here, and `update.reason` says why not when it can't (the
table under [What install does](#what-install-does)). `install()` downloads first if `download()`
has not run.

**3. Build with the archive.** `build({ entry, archive: true })`, or `bun build.ts --archive` in a
scaffolded app, writes two files beside the app in `dist/`:

- `<slug>-<version>-<platform>.zip`: the archive to upload, with the `.app`, `.exe` or executable
  at its top level. The platform is `darwin-arm64`, `win32-x64`, `win32-arm64` or `linux-x64`. On
  macOS, with notarization on, it is the stapled zip the build already makes.
- `update-<platform>.json`, a fragment with the archive's name, sha256 and size for the next step.

Run it on each platform you ship, as with any build.

**4. Write the manifest and upload everything.** Given the fragments from every platform:

```bash
npx gpuix-svelte update manifest --out update.json \
    --base-url https://github.com/you/my-app/releases/download/v1.2.0/ \
    --notes CHANGELOG-1.2.0.md \
    --url https://github.com/you/my-app/releases \
    update-darwin-arm64.json update-win32-x64.json update-win32-arm64.json update-linux-x64.json
```

`--base-url` is where the archives go; each asset's URL is that plus its file name. `--notes` is a
markdown file for `notes`, `--url` a page for people whose copy can't update in place. Upload the
archives there, and `update.json` to the URL the app has. The app fetches the manifest every time
it checks, so the file at that URL is all there is to update: there is no server-side logic, and a
CDN, an S3 bucket or a plain web server all do.

## On GitHub

The starter carries `.github/workflows/release.yml`, which does steps 3 and 4 for you. It runs
[release-please](https://github.com/googleapis/release-please-action) on every push to `main`: it
keeps a release PR open from the conventional commits (`feat:`, `fix:`, …) since the last release,
bumps `package.json`'s version and the changelog, and merging that PR tags a release. Then a build
matrix (macOS, Windows x64, Windows arm64, Linux) runs `bun build.ts --archive` on each, uploads
the archive to the release, and one last job merges the fragments into `update.json` with the
release notes and uploads that too.

The manifest URL the app wants is then

```
https://github.com/<owner>/<repo>/releases/latest/download/update.json
```

which GitHub redirects to the newest release's copy. Nothing in the app talks to GitHub's API, so
there are no rate limits or tokens involved; a private repository would need both, so publish
releases from a public one.

Two things about the workflow:

- release-please opens its PR with `GITHUB_TOKEN`, which needs "Allow GitHub Actions to create and
  approve pull requests" turned on under the repository's Actions settings. No PR appears until a
  `feat:` or `fix:` commit lands on `main`.
- The release exists before its assets do. Until the manifest job finishes, `update.json` is a 404
  and the check fails with a `manifest` error; the next check sees it. The manifest job runs even
  when a platform's build failed and lists what was uploaded, so the other platforms still update;
  re-run the failed job and then the manifest job (`--clobber` lets uploads be replaced) to fill in
  the rest.

Secrets, all optional:

| Secret                       | What it does                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GPUIX_UPDATE_KEY`           | The private key from `gpuix-svelte update keygen` (the PEM file's text); set, every manifest is signed         |
| `GPUIX_UPDATE_PUBLIC_KEY`    | A repository *variable*, not a secret: the public key. Set, the manifest job fails unless the manifest verifies with it, so a missing or wrong `GPUIX_UPDATE_KEY` fails the release rather than every app's update |
| `CODESIGN_IDENTITY`          | `Developer ID Application: Your Name (TEAMID)`: signs the macOS app, as on your machine                          |
| `MACOS_CERTIFICATE`          | That certificate with its private key as a base64 `.p12` (`base64 -i cert.p12 \| pbcopy`), imported into a keychain for the build |
| `MACOS_CERTIFICATE_PASSWORD` | The `.p12`'s password                                                                                          |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Notarize with an Apple ID and an [app-specific password](shipping.md#signing-and-notarizing-on-macos); a runner has no keychain profile. Needs `CODESIGN_IDENTITY` too |

Without the macOS secrets the app is unsigned, which is fine for an update (the app downloads the
archive itself, so Gatekeeper's quarantine never applies) but not for first installs. The updater
itself checks no code signature on any platform: what it trusts is the manifest's hash and, if you
sign, its signature, so sign the manifest.

Make the first release by merging the PR release-please opens; the app built from it is the first
one that can update.

## Signing the manifest

The sha256 in the manifest proves the archive is the one the manifest describes, which covers a
corrupted or swapped download. Whoever can edit the manifest can edit the hash too, though, so on
its own the check trusts the host as far as HTTPS does. To trust only yourself, sign:

```bash
npx --no-install gpuix-svelte update keygen   # writes update-key.pem, prints the public key
```

Put the public key in the app and keep the PEM out of git (the scaffold's `.gitignore` lists it):

```ts
update: {
	manifest: 'https://github.com/you/my-app/releases/latest/download/update.json',
	publicKey: 'c2VlIHRoZSBrZXlnZW4gb3V0cHV0IGZvciBhIHJlYWwgb25l'
}
```

From then on the app refuses a manifest that is unsigned or signed with another key. The
`manifest` command signs when given `--key update-key.pem` or the PEM in `GPUIX_UPDATE_KEY`, which
is what the workflow reads, and with `--public-key` it checks its own output, so a release with a
missing or mismatched key fails on CI; `gpuix-svelte update verify --public-key <key> update.json`
checks a file. The signature (ed25519) covers the whole manifest, version, notes and every asset's
URL and hash, so a signed manifest can't be edited to point at an older or different archive. What
it does not cover: an old signed manifest is still valid, so whoever controls the host can keep
apps on a version you have since replaced, and a key is not tied to one app. Losing the private
key means apps in the field can never accept another update, so keep a copy somewhere safe; if it
leaks, ship a release with a new public key, signed with the old key, and retire it.

The build refuses what would ship a broken updater: a manifest URL that is not `https:` (plain
`http:` is allowed to `localhost` only), a `publicKey` that is not the one `keygen` printed, a
misspelled option, or a version that is not semver.

## What `install()` does

On every platform the archive is downloaded to a temporary directory while its sha256 is computed;
the download stops as soon as it passes the size the manifest promised, and is refused if the hash
or size differs. The archive is told apart by its bytes, not its name (a zip, or a bare
executable), and the zip is opened by [adm-zip](https://www.npmjs.com/package/adm-zip) (no
dependencies, `node:zlib` underneath), the same on every platform: unix modes are kept, every entry
is checked to land inside the directory before anything is written, and the `__MACOSX` and `._`
sidecars Finder and `ditto` add are skipped. Symlinks are not supported in an update archive (an
app gpuix-svelte builds has none); one would come out as a file. Extraction goes into a directory
next to the app, so the final move never crosses a file system, and what was extracted has to be
an app of this platform: the entry named like the running one, or the only candidate, and a real
`.app` with an `Info.plist`, a Windows PE or a Linux ELF executable. Then it is swapped in:

- **macOS.** The `.app`'s `CFBundleIdentifier` has to be the app's and its
  `CFBundleShortVersionString` the manifest's, so a manifest can only hand the app a newer build
  of itself. The old bundle is renamed aside, the new one moved into place, the old one deleted;
  if moving the new one in fails, the old one is moved back, and if even that fails, the error
  names where the old bundle is. To relaunch, a shell waits for this process to exit and then runs
  `open -n` on the new one.
- **Windows.** A running executable can't be deleted or overwritten, but it can be renamed: the
  old one becomes `<name>.exe.old`, the new one takes its place and is started directly as this
  process exits, and the `.old` file is deleted by `check_for_update()` (or `finish_update()`) on
  the next launch.
- **Linux.** The executable is renamed over the old one (atomic; the running process keeps its
  old inode) and started with `exec` once this one has exited.

With `relaunch: false`, `install()` returns after the swap and the app keeps running on the old
code; the next launch is the new version. `update.installed` is then true and a second `install()`
throws. A download in flight is shared between callers, and `download`/`install` take a `signal`
to abort it. An app closed or killed midway leaves its archive in the temp directory, or a staging
directory beside the app. `check_for_update()` (or `finish_update()`) deletes those on the next
launch once the process that made them is gone, so another running instance's download is safe.
No code signature is checked at install on any platform: on macOS the system checks the new
bundle's signature when it launches, as for any app, and `build()`'s `beforeArchive` hook is where
a Windows `.exe` gets `signtool` before the archive is made.

`installable` is false, and `install()` throws, when:

| `reason`        | Meaning                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `development`   | Not an executable Bun compiled: `npm start`, a test                                                 |
| `no-asset`      | The manifest has no entry for this platform                                                          |
| `translocated`  | macOS is running the app from a read-only copy because it was opened from the download without being moved to Applications |
| `read-only`     | The directory the app is in can't be written by this user (`/usr/local/bin` on Linux, say); checked with a real write, so Windows ACLs count |
| `unsupported`   | A platform without a swap, or on macOS an executable that is not inside an `.app`                   |

In the last three cases show `update.url`, if the manifest has one, and let the person download
the new version by hand.

Errors are `UpdateError`s with a `code`: `version` (the running version is unknown, or the
manifest's is not semver), `manifest` (unreachable, not https, not JSON, malformed), `signature`,
`download`, `hash`, `extract` (a damaged or hostile zip, nothing usable in it, or another app's
bundle), `install` and `not-installable`.

## The manifest

```json
{
	"version": "1.2.0",
	"notes": "## What's new\n\n- …",
	"published_at": "2026-11-01T12:00:00Z",
	"url": "https://github.com/you/my-app/releases",
	"platforms": {
		"darwin-arm64": { "url": "https://…/my-app-1.2.0-darwin-arm64.zip", "sha256": "…", "size": 115331072 },
		"win32-x64": { "url": "https://…/my-app-1.2.0-win32-x64.zip", "sha256": "…", "size": 136314880 },
		"win32-arm64": { "url": "https://…/my-app-1.2.0-win32-arm64.zip", "sha256": "…", "size": 120586240 },
		"linux-x64": { "url": "https://…/my-app-1.2.0-linux-x64.zip", "sha256": "…", "size": 162529280 }
	},
	"signature": "base64 ed25519 over the rest, keys sorted, no whitespace"
}
```

`version` and `platforms` (each with `url` and a 64-hex-character `sha256`) are required; the rest
is optional. Versions compare as semver (`1.2.0-beta.1 < 1.2.0 < 1.10.0`), and only a strictly
newer version is offered. The archive at `url` holds the `.app`, the `.exe` or the executable at its
top level (or inside one folder). The download's type is read from its bytes, not its name: a zip
(stored or deflated entries, under 4 GB; what `build()`, `ditto`, bsdtar, Finder and `zip` write),
or on Windows and Linux a bare executable. You can write the file by hand or with your own tooling
as long as it has this shape; `gpuix-svelte update manifest` is one way.

## Trying it out

A dev run can pretend to be a built app. `GPUIX_UPDATE_MANIFEST` overrides the manifest URL, and
`GPUIX_APP_INFO` is what the build would have embedded:

```bash
GPUIX_APP_INFO='{"name":"My App","slug":"my-app","identifier":"com.example.my-app","version":"0.0.1"}' \
GPUIX_UPDATE_MANIFEST=http://127.0.0.1:8000/update.json npm start
```

with `update.json` and the archives served from a directory (`python3 -m http.server`, say). Write
the manifest with `--base-url http://127.0.0.1:8000/` and a version above the one you claim. The
check and the download run for real; `install()` refuses with `development`, since the running
executable is Node or Bun. A built app ignores both variables. To exercise the swap, build with
`manifest: 'http://localhost:8000/update.json'` (the build allows plain `http:` for `localhost`)
and run that app from `dist/`, or in a test hand `check_for_update()` a `target`, the path of a
copy of the app to replace, along with a `version`: the repository's `test/update.ts` does that
against a local server.

## API

From `gpuix-svelte/update`:

- `check_for_update(options?)` → `Promise<Update | null>`. Options: `manifest`, `publicKey` and
  `version` (the running one) default to what the build embedded, and in a dev run
  `GPUIX_UPDATE_MANIFEST` in the environment outranks `manifest`; `platform` defaults to this
  machine, `target` to the running app, and `fetch` to the global one.
- `Update`: `version`, `current`, `notes`, `published_at`, `url`, `platform`, `asset`
  (`{ url, sha256, size }` or null), `installable`, `reason`, `installed`;
  `download({ onProgress, signal })` resolves to the archive's path (aborting fails it with code
  `download`); `install({ relaunch, onProgress, signal })` throws if it already ran.
- `finish_update()` deletes what earlier updates left: the `.old` executable on Windows, and the
  archive or staging directory of an app closed midway. `check_for_update()` calls it, so an app
  that never checks at startup calls this instead.
- `app_info()`: what the build embedded (`name`, `slug`, `identifier`, `version`, `update`), or
  null in a dev run. Handy for an About screen.
- `compare_versions(a, b)`, `is_version`, `is_public_key`, `canonical_manifest`, `sign_manifest`,
  `verify_manifest`, `generate_keys`, `build_manifest`: the building blocks of the CLI, for your
  own release tooling.
- `UpdateError` with `code`, and the types `Update`, `UpdateManifest`, `UpdateAsset`,
  `UpdateFragment`, `NotInstallable`, `UpdateErrorCode`, `CheckOptions`, `DownloadOptions`,
  `InstallOptions`, `ManifestOptions` and `EmbeddedAppInfo`.

From `gpuix-svelte/build`: `build({ entry, archive: true })` returns `archive` and `fragment`
paths alongside `output`.
