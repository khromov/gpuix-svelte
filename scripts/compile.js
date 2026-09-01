/**
 * Bun is the compiler — `Bun.build({ compile })` bundles the entry, the Svelte
 * runtime and the GPUI addon into one executable — so this is the one script
 * outside src/plugin.js that needs Bun.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
const identity = process.env.CODESIGN_IDENTITY;
const notary = process.env.NOTARY_PROFILE;

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

// Under the hardened runtime Bun's JavaScriptCore JIT needs the executable-memory
// entitlements, and the GPUI addon is extracted and dlopen'd at launch without our
// team's signature, which library validation would otherwise refuse.
const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
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
		...(process.platform === 'win32' && { windows: { hideConsole: true } })
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

if (!identity) {
	console.log('[compile] CODESIGN_IDENTITY not set; leaving the output unsigned');
} else if (process.platform !== 'darwin') {
	console.log('[compile] CODESIGN_IDENTITY is macOS-only (codesign); leaving the output unsigned');
} else {
	sign(binary);
	if (app) sign(bundle);
}

if (!notary) {
	console.log('[compile] NOTARY_PROFILE not set; skipping notarization');
} else if (!identity || process.platform !== 'darwin') {
	console.log('[compile] NOTARY_PROFILE needs CODESIGN_IDENTITY on macOS; skipping notarization');
} else if (!app) {
	console.log('[compile] notarization applies to the .app bundle; add --app');
} else {
	notarize(bundle);
}

function mb(bytes) {
	return (bytes / 1048576).toFixed(1);
}

function sign(target) {
	const entitlements = join(dist, 'entitlements.plist');
	writeFileSync(entitlements, ENTITLEMENTS);
	run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', entitlements, '--sign', identity, target]);
	run('codesign', ['--verify', '--strict', target]);
	console.log(`[compile] signed ${relative(root, target)} as ${identity}`);
}

// Stapling only works on a bundle, and the ticket has to be stapled before the
// zip that ships is made, so the submission zip is rebuilt afterwards.
function notarize(target) {
	const zip = join(dist, 'Tic-tac-toe.zip');
	run('ditto', ['-c', '-k', '--keepParent', target, zip]);
	console.log('[compile] notarizing (Apple usually takes a few minutes)');
	const output = run('xcrun', ['notarytool', 'submit', zip, '--keychain-profile', notary, '--wait']);
	if (!/status: Accepted/.test(output)) {
		console.error(`[compile] notarization was not accepted; see \`xcrun notarytool log\` for the submission below\n${output}`);
		process.exit(1);
	}
	run('xcrun', ['stapler', 'staple', target]);
	run('spctl', ['--assess', '--type', 'execute', target]);
	run('ditto', ['-c', '-k', '--keepParent', target, zip]);
	console.log(`[compile] notarized and stapled; ${relative(root, zip)} is the one to ship`);
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

function run(command, args) {
	const { status, stdout, stderr } = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	if (status !== 0) {
		console.error(`[compile] ${command} ${args.join(' ')} failed:\n${stderr || stdout}`);
		process.exit(1);
	}
	return stdout;
}
