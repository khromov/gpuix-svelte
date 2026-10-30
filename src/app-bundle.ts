/**
 * The packaging around a compiled executable — the macOS `.app`'s plist, icns, signature and
 * notarization, the Windows `.ico` — and the app metadata both are filled from. Nothing here
 * needs Bun, so the tests run it on Node; `build.ts` is the Bun half.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppOptions } from './types.ts';

export interface AppInfo {
	name: string;
	/** `name` as a file name: lowercase ASCII words joined by `-`. */
	slug: string;
	identifier: string;
	version: string;
	/** Absolute path, or null when the entry gave none. */
	icon: string | null;
	copyright?: string;
	publisher?: string;
	description?: string;
}

/** What the entry wrote under GPUIX_APP_INFO: its `app` options plus the window title. */
export type ReportedApp = AppOptions & { title?: string };

export const MIN_MACOS = '13.0';

export function app_slug(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'app'
	);
}

export function resolve_app_info(reported: ReportedApp, entry: string): AppInfo {
	const pkg = nearest_package(dirname(entry));
	const name = reported.name || reported.title || pkg?.name || 'app';
	const slug = app_slug(name);
	return {
		name,
		slug,
		identifier: reported.identifier || `local.${slug}`,
		version: reported.version || pkg?.version || '0.0.0',
		icon: reported.icon ? icon_path(reported.icon, entry) : null,
		copyright: reported.copyright,
		publisher: reported.publisher,
		description: reported.description
	};
}

// A URL that went through JSON is its href, so both spellings arrive as strings.
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
		['LSMinimumSystemVersion', MIN_MACOS],
		['NSHighResolutionCapable', true]
	];
	if (info.icon) entries.push(['CFBundleIconFile', 'AppIcon']);
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

export const ICO_SIZES = [16, 32, 48, 256];

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

/**
 * Stapling only works on a bundle, and the ticket has to be stapled before the zip that ships is
 * made, so the submission zip is rebuilt afterwards; `zip` is the one to ship.
 */
export function notarize(bundle: string, profile: string, zip: string, log: (line: string) => void) {
	run('ditto', ['-c', '-k', '--keepParent', bundle, zip]);
	log('notarizing (Apple usually takes a few minutes)');
	const output = run('xcrun', ['notarytool', 'submit', zip, '--keychain-profile', profile, '--wait']);
	if (!/status: Accepted/.test(output)) {
		throw new Error(`notarization was not accepted; see \`xcrun notarytool log\` for the submission below\n${output}`);
	}
	run('xcrun', ['stapler', 'staple', bundle]);
	run('spctl', ['--assess', '--type', 'execute', bundle]);
	run('ditto', ['-c', '-k', '--keepParent', bundle, zip]);
}

export function run(command: string, args: string[], env?: Record<string, string>): string {
	const { status, stdout, stderr, error } = spawnSync(command, args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		...(env && { env: { ...process.env, ...env } })
	});
	if (error) throw error;
	if (status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${stderr || stdout}`);
	return stdout;
}
