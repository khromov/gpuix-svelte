# Updating an app

A built app can update itself. You publish a small JSON manifest and one archive per platform on
any HTTPS host. The app reads the manifest, and when it names a newer version than the one
running, it downloads the archive, checks it, swaps itself for the new version and restarts.
GitHub Releases is the easiest host: the starter's workflow builds every platform and uploads both
when you merge a release PR.

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

The build reads these values from the source, so write them as string literals, and bakes them
into the executable along with the version. It refuses a manifest URL that is not `https:`
(`http:` is allowed for `localhost`), a misspelled option, or a version that is not semver. Under
`npm start` nothing is baked in and `check_for_update()` resolves to null without touching the
network; [Trying it out](#trying-it-out) shows how to fake a built app.

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
			await update!.install(); // swaps the app and restarts it
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

`update.notes` holds the release notes as markdown (`<markdown>` renders them).
`update.installable` says whether this copy can update itself, and `update.reason` says why not
(see [When it can't install](#when-it-cant-install)). `install()` downloads first if `download()`
has not run.

**3. Build with the archive.** `bun build.ts --archive` in a scaffolded app, or
`build({ entry, archive: true })`, writes two files beside the app in `dist/`:

- `<slug>-<version>-<platform>.zip`, the archive to upload. The platform is `darwin-arm64`,
  `win32-x64`, `win32-arm64` or `linux-x64`.
- `update-<platform>.json`, the archive's name, hash and size, for the next step.

Build on each platform you ship.

**4. Write the manifest and upload everything.** Given the `update-*.json` files from every
platform:

```bash
npx gpuix-svelte update manifest --out update.json \
    --base-url https://github.com/you/my-app/releases/download/v1.2.0/ \
    --notes CHANGELOG-1.2.0.md \
    --url https://github.com/you/my-app/releases \
    update-darwin-arm64.json update-win32-x64.json update-win32-arm64.json update-linux-x64.json
```

`--base-url` is where the archives will be, `--notes` a markdown file of release notes, and
`--url` a page for people whose copy can't update in place. Upload the archives to the base URL
and `update.json` to the URL the app has. The app fetches the manifest on every check, so
replacing that one file is how you ship an update, and any static host works: a CDN, an S3
bucket, a plain web server.

## On GitHub

`npm create gpuix-svelte` offers to add `.github/workflows/release.yml`, which does steps 3 and 4
for you, and asks for the repository (`owner/name`) to write the manifest URL into
`standalone.ts`. In a script, pass `--github owner/repo` or `--no-github`.

The workflow runs [release-please](https://github.com/googleapis/release-please-action) on every
push to `main`. It keeps a release PR open with the version bump and changelog from your
conventional commits (`feat:`, `fix:`, …), and merging that PR tags a release. Then each platform
builds and uploads its archive to the release, and a last job writes `update.json` with the
release notes and uploads it too. The manifest URL is

```
https://github.com/<owner>/<repo>/releases/latest/download/update.json
```

which GitHub redirects to the newest release. The app never calls GitHub's API, so there are no
tokens or rate limits, but the repository has to be public.

- Turn on "Allow GitHub Actions to create and approve pull requests" in the repository's Actions
  settings, or release-please can't open its PR. The PR appears with the first `feat:` or `fix:`
  commit on `main`.
- A new release has no `update.json` until the last job finishes, and a check in that window
  fails with a `manifest` error. If one platform's build fails, the others still update; re-run
  the failed job and then the manifest job to add it.

Secrets, all optional:

| Secret                       | What it does                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GPUIX_UPDATE_KEY`           | The private key from `gpuix-svelte update keygen` (the `.pem` file's text); set, every manifest is signed      |
| `GPUIX_UPDATE_PUBLIC_KEY`    | A repository *variable*, not a secret: the public key. Set, a missing or wrong `GPUIX_UPDATE_KEY` fails the release instead of every app's update |
| `CODESIGN_IDENTITY`          | `Developer ID Application: Your Name (TEAMID)`: signs the macOS app, as on your machine                          |
| `MACOS_CERTIFICATE`          | That certificate with its private key as a base64 `.p12` (`base64 -i cert.p12 \| pbcopy`)                      |
| `MACOS_CERTIFICATE_PASSWORD` | The `.p12`'s password                                                                                          |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Notarize with an Apple ID and an [app-specific password](shipping.md#signing-and-notarizing-on-macos). Needs `CODESIGN_IDENTITY` too |

Without the macOS secrets the app is unsigned. Updates still work, since the app downloads them
itself and Gatekeeper never sees them, but people downloading the app for the first time need a
signed one. The first release built with `update` set is the first one that can update itself.

## Signing the manifest

The hash in the manifest proves the download is the archive the manifest describes. Whoever can
edit the manifest can edit the hash too, so on its own that trusts your host. To trust only
yourself, sign it:

```bash
npx --no-install gpuix-svelte update keygen   # writes update-key.pem, prints the public key
```

Put the public key in the app and keep the `.pem` out of git (the scaffold's `.gitignore` lists
it):

```ts
update: {
	manifest: 'https://github.com/you/my-app/releases/latest/download/update.json',
	publicKey: 'c2VlIHRoZSBrZXlnZW4gb3V0cHV0IGZvciBhIHJlYWwgb25l'
}
```

From then on the app refuses a manifest that is unsigned or signed with another key.
`gpuix-svelte update manifest` signs with `--key update-key.pem`, or with the key's text in
`GPUIX_UPDATE_KEY` (what the workflow uses), and `--public-key` makes it check its own output.
`gpuix-svelte update verify --public-key <key> update.json` checks a file.

- The signature covers the whole manifest, so a signed one can't be edited to point at another
  archive. It doesn't expire, though: whoever controls the host can keep serving an old signed
  manifest and hold apps at that version.
- If you lose the private key, apps already installed can never accept another update, so back it
  up. If it leaks, ship a release with a new public key, signed with the old one.

## What `install()` does

It downloads the archive and refuses it if its size or hash differs from the manifest's. It checks
that what's inside is this app for this platform (on macOS, the same bundle identifier and the
manifest's version), moves it to where the running app is, and starts it. The running app exits
once the new version has started. If any step fails, the old version is put back and `install()`
throws, so an update can't leave an app that won't start.

- The app exits without running `onDestroy` or other teardown, so save what needs saving before
  calling `install()`.
- The new version starts with the arguments this one got; `install({ args })` passes others.
- `render()` waits for the old version to exit before opening the window. An app without a window
  calls `wait_for_previous_instance()` itself.
- `updated_from()` returns the version this run replaced, or null, so you can show "what's new"
  once.
- `install({ relaunch: false })` swaps the app and keeps running the old code; the next launch is
  the new version.
- On Windows a running `.exe` can't be deleted, so the old one stays as `<name>.exe.old` until the
  next launch's `check_for_update()` removes it. So does anything an update interrupted midway
  left behind. An app that doesn't check at startup calls `finish_update()` instead.

The updater checks no code signature itself. On macOS the system checks the new app's signature
when it launches, as for any app; to sign a Windows `.exe`, run `signtool` in `build()`'s
`beforeArchive` hook. What the updater trusts is the manifest, so sign that.

## When it can't install

`installable` is false, and `install()` throws, when:

| `reason`        | Meaning                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `development`   | Not a built app: `npm start`, a test                                                                 |
| `no-asset`      | The manifest has no archive for this platform                                                        |
| `translocated`  | macOS is running the app from a read-only copy, because it was opened from the download without being moved to Applications |
| `read-only`     | This user can't write to the app's folder (`/usr/local/bin` on Linux, say)                           |
| `unsupported`   | A platform with no installer, or on macOS an executable that is not inside an `.app`                 |

In the last three cases show `update.url`, if the manifest has one, so people can download the new
version by hand.

Errors are `UpdateError`s with a `code`: `version` (the running version is unknown, or a version isn't semver),
`manifest` (unreachable, not https, malformed), `signature`, `download`, `hash`, `extract` (a
damaged archive, or not this app), `install` and `not-installable`.

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

`version` and `platforms` (each with `url` and `sha256`) are required. Versions compare as semver
(`1.2.0-beta.1 < 1.2.0 < 1.10.0`), and only a newer one is offered. Each archive is a zip with the
`.app`, `.exe` or executable at its top level or inside one folder; on Windows and Linux it can
also be the bare executable. `gpuix-svelte update manifest` is one way to write the file, and your
own tooling is another, as long as the shape matches.

## Trying it out

A dev run can pretend to be a built app. `GPUIX_APP_INFO` stands in for what the build would have
baked in, and `GPUIX_UPDATE_MANIFEST` overrides the manifest URL:

```bash
GPUIX_APP_INFO='{"name":"My App","slug":"my-app","identifier":"com.example.my-app","version":"0.0.1"}' \
GPUIX_UPDATE_MANIFEST=http://127.0.0.1:8000/update.json npm start
```

Serve `update.json` and the archives from a folder (`python3 -m http.server`, say), with a manifest
written for `--base-url http://127.0.0.1:8000/` and a version above the one you claim. The check
and the download run for real, and `install()` refuses with `development`. A built app ignores
both variables, so to try the install itself, build with `manifest:
'http://localhost:8000/update.json'` and run the app from `dist/`.

## API

From `gpuix-svelte/update`:

- `check_for_update(options?)` → `Promise<Update | null>`. `manifest`, `publicKey` and `version`
  default to what the build baked in; `platform`, `target` (the app to replace) and `fetch` can be
  overridden for tests.
- `Update`: `version`, `current`, `notes`, `published_at`, `url`, `platform`, `asset`,
  `installable`, `reason`, `installed`; `download({ onProgress, signal })` resolves to the
  archive's path, and `install({ relaunch, args, onProgress, signal })` installs it.
- `wait_for_previous_instance()` → `'exited' | 'timed-out' | false`, and `updated_from()` →
  `string | null`.
- `finish_update()` cleans up after earlier updates; `check_for_update()` calls it.
- `app_info()`: what the build baked in (`name`, `slug`, `identifier`, `version`, `update`), or
  null in a dev run. Handy for an About screen.
- `compare_versions`, `sign_manifest`, `verify_manifest`, `build_manifest` and the rest of what
  the CLI is built from, for your own release tooling.
- `UpdateError`, and the types `Update`, `UpdateManifest`, `UpdateErrorCode`, `CheckOptions`,
  `InstallOptions` and friends.

From `gpuix-svelte/build`: `build({ entry, archive: true })` returns `archive` and `fragment`
paths alongside `output`.
