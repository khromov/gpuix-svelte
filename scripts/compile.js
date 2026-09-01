/**
 * Bun is the compiler — `Bun.build({ compile })` bundles the entry, the Svelte
 * runtime and the GPUI addon into one executable — so this is the one script
 * outside src/plugin.js that needs Bun.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.versions.bun) {
	console.error('[compile] needs Bun — `npm run compile` runs `bun scripts/compile.js`');
	process.exit(1);
}

const app = process.argv.includes('--app');
if (app && process.platform !== 'darwin') {
	console.error(`[compile] --app wraps the binary in a macOS .app bundle; nothing to wrap on ${process.platform}`);
	process.exit(1);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const binary = join(dist, process.platform === 'win32' ? 'tictactoe.exe' : 'tictactoe');
const bundle = join(dist, 'Tic-tac-toe.app');
const icon = join(root, 'examples/tic-tac-toe/icon.png');
const ico = join(dist, 'AppIcon.ico');

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>tictactoe</string>
	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
	<key>CFBundleIdentifier</key>
	<string>dev.gpuix.svelte.tictactoe</string>
	<key>CFBundleName</key>
	<string>Tic-tac-toe</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
`;

// Imported after the guard: a static import would hoist `bun` above it.
const { load_svelte } = await import('../src/plugin.js');

// `Bun.build` ignores the plugin bunfig.toml preloads, and a `.svelte` import with
// no plugin silently becomes a file asset, so count what actually went through it.
let components = 0;
const svelte_plugin = {
	name: 'gpuix-svelte',
	setup(build) {
		build.onLoad({ filter: /\.svelte$/ }, (args) => {
			components++;
			return load_svelte(args);
		});
	}
};

rmSync(binary, { force: true });
rmSync(bundle, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Unlike the .app's icon, this one is a resource inside the executable, so it has
// to exist before the build rather than after it.
if (process.platform === 'win32') write_ico(icon, ico);

const result = await Bun.build({
	entrypoints: [join(root, 'examples/tic-tac-toe/standalone.js')],
	target: 'bun',
	// Bun implies `development` unless NODE_ENV is production at build time, and
	// esm-env lists it first, so both are needed for Svelte's production runtime.
	conditions: ['custom-renderer', 'production'],
	define: { 'process.env.NODE_ENV': '"production"' },
	minify: true,
	plugins: [svelte_plugin],
	throw: false,
	compile: {
		outfile: binary,
		// A bunfig.toml or .env beside the launched binary (this repo's, say) must not reconfigure it.
		autoloadBunfig: false,
		autoloadDotenv: false,
		...(process.platform === 'win32' && { windows: { hideConsole: true, icon: ico } })
	}
});

if (!result.success) {
	for (const message of result.logs) console.error(message);
	process.exit(1);
}

if (components === 0) {
	console.error('[compile] no .svelte file went through the plugin');
	process.exit(1);
}

rmSync(ico, { force: true });

// The output is Bun's own executable plus the payload, and the addon is at least
// 17 MB on every platform, so anything closer to bare Bun than that lost it.
const size = statSync(binary).size;
const floor = statSync(process.execPath).size + 12 * 1024 * 1024;
if (size < floor) {
	console.error(`[compile] ${relative(root, binary)} is ${mb(size)} MB, under the ${mb(floor)} MB floor — the GPUI addon was not embedded`);
	process.exit(1);
}

if (app) {
	const macos = join(bundle, 'Contents', 'MacOS');
	const resources = join(bundle, 'Contents', 'Resources');
	mkdirSync(macos, { recursive: true });
	mkdirSync(resources, { recursive: true });
	copyFileSync(binary, join(macos, 'tictactoe'));
	chmodSync(join(macos, 'tictactoe'), 0o755);
	writeFileSync(join(bundle, 'Contents', 'Info.plist'), PLIST);
	write_icns(icon, join(resources, 'AppIcon.icns'));
}

console.log(`[compile] ${relative(root, binary)} (${mb(size)} MB)${app ? ` + ${relative(root, bundle)}` : ''}`);

function mb(bytes) {
	return (bytes / 1048576).toFixed(1);
}

// iconutil only reads an .iconset directory holding the ten standard sizes,
// which sips cuts from the 1024px source; both ship with macOS.
function write_icns(png, out) {
	const iconset = join(dist, 'AppIcon.iconset');
	rmSync(iconset, { recursive: true, force: true });
	mkdirSync(iconset);
	for (const points of [16, 32, 128, 256, 512]) {
		run('sips', ['-z', `${points}`, `${points}`, png, '--out', join(iconset, `icon_${points}x${points}.png`)]);
		run('sips', ['-z', `${points * 2}`, `${points * 2}`, png, '--out', join(iconset, `icon_${points}x${points}@2x.png`)]);
	}
	run('iconutil', ['-c', 'icns', iconset, '-o', out]);
	rmSync(iconset, { recursive: true, force: true });
}

// The Windows counterpart to write_icns: System.Drawing is what every Windows
// PowerShell has in place of sips, and the .ico around the PNGs it cuts is a
// 6-byte header plus a 16-byte entry each, which Windows has read since Vista.
function write_ico(png, out) {
	// Largest first, because Bun leaves its own `IDI_MYICON` group behind pointing at
	// RT_ICON #1 and a string-named group outranks ours: whatever lands first is the
	// icon Explorer shows, upscaled to every size it needs.
	const sizes = [256, 128, 64, 48, 32, 16];
	const iconset = join(dist, 'AppIcon.icoset');
	rmSync(iconset, { recursive: true, force: true });
	mkdirSync(iconset);

	const script = join(iconset, 'resize.ps1');
	writeFileSync(
		script,
		`Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile('${png}')
foreach ($size in ${sizes.join(', ')}) {
	$bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
	$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
	$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
	$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
	$graphics.Clear([System.Drawing.Color]::Transparent)
	$graphics.DrawImage($source, (New-Object System.Drawing.Rectangle 0, 0, $size, $size))
	$graphics.Dispose()
	$bitmap.Save((Join-Path '${iconset}' "$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
	$bitmap.Dispose()
}
$source.Dispose()
`
	);
	run('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script]);

	const images = sizes.map((size) => readFileSync(join(iconset, `${size}.png`)));
	const header = Buffer.alloc(6 + 16 * sizes.length);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(sizes.length, 4);

	let offset = header.length;
	sizes.forEach((size, i) => {
		const entry = 6 + i * 16;
		// 256 doesn't fit the byte, and 0 is how the format spells it.
		header.writeUInt8(size === 256 ? 0 : size, entry);
		header.writeUInt8(size === 256 ? 0 : size, entry + 1);
		header.writeUInt16LE(1, entry + 4);
		header.writeUInt16LE(32, entry + 6);
		header.writeUInt32LE(images[i].length, entry + 8);
		header.writeUInt32LE(offset, entry + 12);
		offset += images[i].length;
	});

	writeFileSync(out, Buffer.concat([header, ...images]));
	rmSync(iconset, { recursive: true, force: true });
}

function run(command, args) {
	const { status, stderr } = spawnSync(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
	if (status !== 0) {
		console.error(`[compile] ${command} ${args.join(' ')} failed:\n${stderr}`);
		process.exit(1);
	}
}
