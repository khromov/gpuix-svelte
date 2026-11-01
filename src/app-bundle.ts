/**
 * The packaging around a compiled executable — the macOS `.app`'s plist, icns, signature and
 * notarization, the Windows `.ico` — and the app metadata both are filled from, as the entry's
 * source declares it. Nothing here needs Bun, so the tests run it on Node; `build.ts` is the Bun half.
 */

import { Parser, type CallExpression, type Expression, type Literal, type Node, type SpreadElement } from 'acorn';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppOptions, AppUpdateOptions } from './types.ts';
import { is_public_key } from './update.ts';

export interface AppInfo {
	name: string;
	/** `name` as a file name: lowercase ASCII words joined by `-`. */
	slug: string;
	identifier: string;
	version: string;
	/** Absolute path; `DEFAULT_ICON` when the entry gives none. */
	icon: string;
	copyright?: string;
	publisher?: string;
	description?: string;
	update?: AppUpdateOptions;
}

/** What the executable knows about itself at runtime: `AppInfo` without the build-only icon, as `GPUIX_APP_INFO`. */
export type EmbeddedAppInfo = Omit<AppInfo, 'icon'>;

/** One platform's build, as `build({ archive: true })` writes it beside the archive for `gpuix-svelte-update manifest`. */
export interface UpdateFragment {
	platform: string;
	version: string;
	file: string;
	sha256: string;
	size: number;
}

/** The `app` options and window title written in the entry's `render()` call. */
export type EntryApp = AppOptions & { title?: string };

export const MIN_MACOS = '13.0';

// One level up from both src/ and the published lib/.
export const DEFAULT_ICON = fileURLToPath(new URL('../assets/icon.png', import.meta.url));

const UNREADABLE = "the build reads the app options from the entry's source, so they have to be written out there (or in a top-level const)";

/** `title` and `app` from the entry's one top-level `render()` call; `source` is JavaScript, its types already stripped. */
export function read_app_options(source: string): EntryApp {
	const program = Parser.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
	const renders = new Set<string>();
	const consts = new Map<string, Expression>();
	const top: Array<Expression | null | undefined> = [];
	for (const statement of program.body) {
		if (statement.type === 'ImportDeclaration' && statement.source.value === 'gpuix-svelte') {
			for (const specifier of statement.specifiers) {
				if (specifier.type !== 'ImportSpecifier') continue;
				const imported = specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
				if (imported === 'render') renders.add(specifier.local.name);
			}
		} else if (statement.type === 'ExpressionStatement') {
			top.push(statement.expression);
		} else if (statement.type === 'VariableDeclaration') {
			for (const { id, init } of statement.declarations) {
				top.push(init);
				if (statement.kind === 'const' && id.type === 'Identifier' && init) consts.set(id.name, init);
			}
		}
	}
	const calls = top.filter(
		(node): node is CallExpression => node?.type === 'CallExpression' && node.callee.type === 'Identifier' && renders.has(node.callee.name)
	);
	if (calls.length === 0) throw new Error("no top-level render() from 'gpuix-svelte', which is where the build reads the app options (a render_hot entry can't be compiled)");
	if (calls.length > 1) throw new Error(`render() is called ${calls.length} times at the top level; the build reads the app options from one call`);

	const text = (node: Node) => source.slice(node.start, node.end);
	const follow = (node: Expression | SpreadElement) => (node.type === 'Identifier' && consts.get(node.name)) || node;

	function string(node: Expression | undefined): string | undefined {
		const value = node && follow(node);
		if (value?.type === 'Literal' && typeof value.value === 'string') return value.value;
		if (value?.type === 'TemplateLiteral' && value.expressions.length === 0) return value.quasis[0].value.cooked ?? undefined;
		// `new URL('./icon.png', import.meta.url)` names the same file as './icon.png' does from the entry.
		if (value?.type === 'NewExpression' && value.callee.type === 'Identifier' && value.callee.name === 'URL') {
			const [href, base] = value.arguments;
			if (href && href.type !== 'SpreadElement' && (!base || text(base) === 'import.meta.url')) return string(href);
		}
		return undefined;
	}

	function object(node: Expression | SpreadElement, path: string): Map<string, Expression> {
		const value = follow(node);
		if (value.type !== 'ObjectExpression') throw new Error(`${path} is \`${text(node)}\`; ${UNREADABLE}`);
		const fields = new Map<string, Expression>();
		for (const property of value.properties) {
			if (property.type === 'SpreadElement' || property.computed) throw new Error(`${path} has \`${text(property)}\`; ${UNREADABLE}`);
			const key = property.key.type === 'Identifier' ? property.key.name : String((property.key as Literal).value);
			fields.set(key, property.value as Expression);
		}
		return fields;
	}

	const options = calls[0].arguments[1];
	if (!options) return {};
	const fields = object(options, "render()'s second argument");
	const app: Record<string, string | Record<string, string>> = {};
	const declared = fields.get('app');
	if (declared) {
		for (const [key, node] of object(declared, 'app')) {
			if (key === 'update') {
				const update: Record<string, string> = {};
				for (const [field, inner] of object(node, 'app.update')) {
					if (field !== 'manifest' && field !== 'publicKey') throw new Error(`app.update.${field} is not an option (manifest and publicKey are)`);
					const value = string(inner);
					if (value === undefined || inner.type === 'NewExpression') throw new Error(`app.update.${field} is \`${text(inner)}\`; ${UNREADABLE}`);
					update[field] = value;
				}
				// A wrong value here ships in an executable that can never update itself to a fixed one.
				if (!update.manifest) throw new Error('app.update has no manifest URL');
				if (!is_manifest_url(update.manifest)) throw new Error(`app.update.manifest is ${update.manifest}; it has to be an https URL (http only to this machine)`);
				if (update.publicKey !== undefined && !is_public_key(update.publicKey)) {
					throw new Error('app.update.publicKey is not the base64 key gpuix-svelte-update keygen printed');
				}
				app[key] = update;
				continue;
			}
			const value = string(node);
			if (value === undefined) throw new Error(`app.${key} is \`${text(node)}\`; ${UNREADABLE}`);
			app[key] = value;
		}
	}
	// A title worked out at runtime only costs the name its fallback, and package.json covers that.
	const title = string(fields.get('title'));
	return (title === undefined ? app : { ...app, title }) as EntryApp;
}

function is_manifest_url(url: string): boolean {
	try {
		const { protocol, hostname } = new URL(url);
		return protocol === 'https:' || (protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(hostname));
	} catch {
		return false;
	}
}

export function app_slug(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'app'
	);
}

export function resolve_app_info(declared: EntryApp, entry: string): AppInfo {
	const pkg = nearest_package(dirname(entry));
	const name = declared.name || declared.title || pkg?.name || 'app';
	const slug = app_slug(name);
	return {
		name,
		slug,
		identifier: declared.identifier || `local.${slug}`,
		version: declared.version || pkg?.version || '0.0.0',
		icon: declared.icon ? icon_path(declared.icon, entry) : DEFAULT_ICON,
		copyright: declared.copyright,
		publisher: declared.publisher,
		description: declared.description,
		update: declared.update
	};
}

/** `update-<platform>.json`'s platform key, the same string `gpuix-svelte/update` looks its asset up by. */
export function update_platform(platform = process.platform, arch = process.arch): string {
	return `${platform}-${arch}`;
}

/** `<slug>-<version>-<platform>.zip` on macOS and Windows, `.tar.gz` on Linux. */
export function archive_name(info: Pick<AppInfo, 'slug' | 'version'>, platform = update_platform()): string {
	return `${info.slug}-${info.version}-${platform}${platform.startsWith('linux') ? '.tar.gz' : '.zip'}`;
}

/**
 * The archive that ships and that `gpuix-svelte/update` installs: the `.app` zipped by `ditto`
 * (resource forks and the stapled ticket survive it), the `.exe` zipped by bsdtar, the Linux
 * executable in a `.tar.gz`, each with the file at the archive's top level.
 */
export function write_archive(output: string, out: string, platform = process.platform) {
	rmSync(out, { force: true });
	if (platform === 'darwin') run('/usr/bin/ditto', ['-c', '-k', '--keepParent', output, out]);
	// Windows' own bsdtar by its full path: Git's GNU tar, if it is first on PATH, can't write zip.
	else if (platform === 'win32') run(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-cf', out, '-C', dirname(output), basename(output)]);
	else run('tar', ['-czf', out, '-C', dirname(output), basename(output)]);
}

export function sha256_file(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function update_fragment(info: Pick<AppInfo, 'version'>, archive: string, platform = update_platform()): UpdateFragment {
	return { platform, version: info.version, file: basename(archive), sha256: sha256_file(archive), size: statSync(archive).size };
}

function icon_path(icon: string | URL, entry: string): string {
	const text = String(icon);
	return text.startsWith('file:') ? fileURLToPath(text) : resolve(dirname(entry), text);
}

function nearest_package(dir: string): { name?: string; version?: string } | null {
	for (let at = dir; ; at = dirname(at)) {
		const file = join(at, 'package.json');
		if (existsSync(file)) {
			try {
				return JSON.parse(readFileSync(file, 'utf8'));
			} catch {
				return null;
			}
		}
		if (dirname(at) === at) return null;
	}
}

export function info_plist(info: AppInfo): string {
	const entries: Array<[string, string | boolean]> = [
		['CFBundleDevelopmentRegion', 'en'],
		['CFBundleDisplayName', info.name],
		['CFBundleExecutable', info.slug],
		['CFBundleIdentifier', info.identifier],
		['CFBundleInfoDictionaryVersion', '6.0'],
		['CFBundleName', info.name],
		['CFBundlePackageType', 'APPL'],
		['CFBundleShortVersionString', info.version],
		// At most three integers here, so a prerelease suffix stays on the string above only.
		['CFBundleVersion', /^\d+(\.\d+){0,2}/.exec(info.version)?.[0] ?? '0'],
		['CFBundleIconFile', 'AppIcon'],
		['LSMinimumSystemVersion', MIN_MACOS],
		['NSHighResolutionCapable', true]
	];
	if (info.copyright) entries.push(['NSHumanReadableCopyright', info.copyright]);
	const body = entries
		.map(([key, value]) => `\t<key>${key}</key>\n\t${typeof value === 'boolean' ? `<${value}/>` : `<string>${escape_xml(value)}</string>`}`)
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

function escape_xml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Under the hardened runtime Bun's JavaScriptCore JIT needs the executable-memory
// entitlements, and the GPUI addon is extracted and dlopen'd at launch without our
// team's signature, which library validation would otherwise refuse.
export const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.cs.allow-jit</key>
	<true/>
	<key>com.apple.security.cs.allow-unsigned-executable-memory</key>
	<true/>
	<key>com.apple.security.cs.disable-executable-page-protection</key>
	<true/>
	<key>com.apple.security.cs.allow-dyld-environment-variables</key>
	<true/>
	<key>com.apple.security.cs.disable-library-validation</key>
	<true/>
</dict>
</plist>
`;

/** Scales a PNG with what the platform ships: sips on macOS, .NET's System.Drawing through PowerShell on Windows. */
export function resize_png(png: string, size: number, out: string) {
	if (process.platform === 'darwin') {
		run('sips', ['-s', 'format', 'png', '-z', `${size}`, `${size}`, png, '--out', out]);
	} else if (process.platform === 'win32') {
		// The paths travel in the environment: PowerShell treats the typographic quotes as
		// delimiters too, so no quoting of a literal is safe.
		const script = [
			"$ErrorActionPreference = 'Stop'",
			'Add-Type -AssemblyName System.Drawing',
			'$src = [System.Drawing.Image]::FromFile($env:GPUIX_ICON_SRC)',
			`$bmp = New-Object System.Drawing.Bitmap ${size}, ${size}`,
			'$g = [System.Drawing.Graphics]::FromImage($bmp)',
			"$g.InterpolationMode = 'HighQualityBicubic'",
			`$g.DrawImage($src, 0, 0, ${size}, ${size})`,
			'$g.Dispose()',
			'$bmp.Save($env:GPUIX_ICON_OUT, [System.Drawing.Imaging.ImageFormat]::Png)',
			'$bmp.Dispose()',
			'$src.Dispose()'
		].join('; ');
		run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { GPUIX_ICON_SRC: png, GPUIX_ICON_OUT: out });
	} else {
		throw new Error(`no image scaler on ${process.platform}`);
	}
}

/** iconutil reads only an .iconset directory holding the ten standard sizes; both tools ship with macOS. */
export function write_icns(png: string, out: string, scratch: string) {
	const iconset = join(scratch, 'AppIcon.iconset');
	rmSync(iconset, { recursive: true, force: true });
	mkdirSync(iconset, { recursive: true });
	for (const points of [16, 32, 128, 256, 512]) {
		resize_png(png, points, join(iconset, `icon_${points}x${points}.png`));
		resize_png(png, points * 2, join(iconset, `icon_${points}x${points}@2x.png`));
	}
	run('iconutil', ['-c', 'icns', iconset, '-o', out]);
	rmSync(iconset, { recursive: true, force: true });
}

// Largest first: Bun keeps its own icon group, which the shell picks and which points at the first image.
export const ICO_SIZES = [256, 48, 32, 16];

export function write_ico(png: string, out: string, scratch: string) {
	mkdirSync(scratch, { recursive: true });
	const images = ICO_SIZES.map((size) => {
		const file = join(scratch, `icon-${size}.png`);
		resize_png(png, size, file);
		const bytes = readFileSync(file);
		rmSync(file);
		return { size, bytes };
	});
	writeFileSync(out, ico(images));
}

/** An .ico is a directory over image blobs; Windows has read PNG-compressed entries since Vista, 256 px included. */
export function ico(images: Array<{ size: number; bytes: Uint8Array }>): Buffer {
	const header = Buffer.alloc(6 + 16 * images.length);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	images.forEach(({ size, bytes }, i) => {
		const at = 6 + 16 * i;
		// A 256 px entry writes its dimensions as 0, the one value the byte can't hold.
		header.writeUInt8(size === 256 ? 0 : size, at);
		header.writeUInt8(size === 256 ? 0 : size, at + 1);
		header.writeUInt8(0, at + 2);
		header.writeUInt8(0, at + 3);
		header.writeUInt16LE(1, at + 4);
		header.writeUInt16LE(32, at + 6);
		header.writeUInt32LE(bytes.length, at + 8);
		header.writeUInt32LE(offset, at + 12);
		offset += bytes.length;
	});
	return Buffer.concat([header, ...images.map((image) => Buffer.from(image.bytes))]);
}

export function sign(target: string, identity: string, scratch: string) {
	const entitlements = join(scratch, 'entitlements.plist');
	mkdirSync(scratch, { recursive: true });
	writeFileSync(entitlements, ENTITLEMENTS);
	run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', entitlements, '--sign', identity, target]);
	run('codesign', ['--verify', '--strict', target]);
}

/** A keychain profile on a developer's machine; an Apple ID with an app-specific password on CI, where no keychain profile exists. */
export type NotaryAuth = { profile: string } | { apple_id: string; password: string; team_id: string };

/** `NOTARY_PROFILE`, else `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID`; null when neither is complete. */
export function notary_auth(env: Record<string, string | undefined> = process.env): NotaryAuth | null {
	if (env.NOTARY_PROFILE) return { profile: env.NOTARY_PROFILE };
	if (env.APPLE_ID && env.APPLE_PASSWORD && env.APPLE_TEAM_ID) return { apple_id: env.APPLE_ID, password: env.APPLE_PASSWORD, team_id: env.APPLE_TEAM_ID };
	return null;
}

/**
 * Stapling only works on a bundle, and the ticket has to be stapled before the zip that ships is
 * made, so the submission zip is rebuilt afterwards; `zip` is the one to ship.
 */
export function notarize(bundle: string, auth: NotaryAuth, zip: string, log: (line: string) => void) {
	run('ditto', ['-c', '-k', '--keepParent', bundle, zip]);
	log('notarizing (Apple usually takes a few minutes)');
	const credentials =
		'profile' in auth ? ['--keychain-profile', auth.profile] : ['--apple-id', auth.apple_id, '--password', auth.password, '--team-id', auth.team_id];
	const output = run('xcrun', ['notarytool', 'submit', zip, ...credentials, '--wait']);
	if (!/status: Accepted/.test(output)) {
		throw new Error(`notarization was not accepted; see \`xcrun notarytool log\` for the submission below\n${output}`);
	}
	run('xcrun', ['stapler', 'staple', bundle]);
	run('spctl', ['--assess', '--type', 'execute', bundle]);
	run('ditto', ['-c', '-k', '--keepParent', bundle, zip]);
}

export function run(command: string, args: string[], env?: Record<string, string>, cwd?: string): string {
	const { status, stdout, stderr, error } = spawnSync(command, args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
		...(env && { env: { ...process.env, ...env } }),
		...(cwd && { cwd })
	});
	if (error) throw error;
	// notarytool's --password must not end up in a log through the error.
	const shown = args.map((arg, i) => (args[i - 1] === '--password' ? '***' : arg));
	if (status !== 0) throw new Error(`${command} ${shown.join(' ')} failed:\n${stderr || stdout}`);
	return stdout;
}
