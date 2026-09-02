/**
 * Substrate → dist/substrate + dist/Substrate.app. transformers.js cannot be
 * compiled into a Bun binary (huggingface/transformers.js#1672: onnxruntime's
 * dylib and sharp's addon are not embedded), and it never has to be: the models run
 * in a child process, so the worker ships as source with its node_modules in
 * Contents/Resources, and the app runs it on its own embedded Bun (BUN_BE_BUN=1).
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.versions.bun) {
	console.error('[compile-brain] needs Bun — `npm run brain:compile` runs `bun scripts/compile-brain.js`');
	process.exit(1);
}
if (process.platform !== 'darwin') {
	console.error(`[compile-brain] Substrate's build makes a macOS .app (AVFoundation recorder, Metal); nothing to build on ${process.platform}`);
	process.exit(1);
}

const root = fileURLToPath(new URL('../', import.meta.url));
const brain = join(root, 'examples/second-brain');
const dist = join(root, 'dist');
const binary = join(dist, 'substrate');
const bundle = join(dist, 'Substrate.app');
const identity = process.env.CODESIGN_IDENTITY;
const notary = process.env.NOTARY_PROFILE;

if (!existsSync(join(brain, 'ml/node_modules/@huggingface/transformers/package.json'))) {
	console.error('[compile-brain] the ML dependencies are not installed; run `npm run brain:install` first');
	process.exit(1);
}

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>substrate</string>
	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
	<key>CFBundleIdentifier</key>
	<string>dev.gpuix.svelte.substrate</string>
	<key>CFBundleName</key>
	<string>Substrate</string>
	<key>CFBundleDisplayName</key>
	<string>Substrate</string>
	<key>CFBundleShortVersionString</key>
	<string>0.1.0</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSMicrophoneUsageDescription</key>
	<string>Substrate records voice memos and transcribes them on this Mac.</string>
</dict>
</plist>
`;

// Under the hardened runtime Bun's JavaScriptCore JIT needs the executable-memory
// entitlements, and the GPUI addon, onnxruntime and sharp are dlopen'd without our
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
	<key>com.apple.security.device.audio-input</key>
	<true/>
	<key>com.apple.security.network.client</key>
	<true/>
</dict>
</plist>
`;

// Imported after the guard: a static import would hoist `bun` above it.
const { load_module, load_svelte } = await import('../src/plugin.js');
const { CLANG_ARGS } = await import('../examples/second-brain/lib/recorder.js');

let components = 0;
const svelte_plugin = {
	name: 'gpuix-svelte',
	setup(build) {
		build.onLoad({ filter: /\.svelte\.js$/ }, load_module);
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
	entrypoints: [join(brain, 'standalone.js')],
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
		autoloadBunfig: false,
		autoloadDotenv: false
	}
});

if (!result.success) {
	for (const message of result.logs) console.error(message);
	process.exit(1);
}
if (components === 0) {
	console.error('[compile-brain] no .svelte file went through the plugin');
	process.exit(1);
}

const size = statSync(binary).size;
const floor = statSync(process.execPath).size + 12 * 1024 * 1024;
if (size < floor) {
	console.error(`[compile-brain] ${relative(root, binary)} is ${mb(size)} MB, under the ${mb(floor)} MB floor — the GPUI addon was not embedded`);
	process.exit(1);
}

const macos = join(bundle, 'Contents', 'MacOS');
const resources = join(bundle, 'Contents', 'Resources');
mkdirSync(macos, { recursive: true });
mkdirSync(join(resources, 'ml'), { recursive: true });
mkdirSync(join(resources, 'native'), { recursive: true });
copyFileSync(binary, join(macos, 'substrate'));
chmodSync(join(macos, 'substrate'), 0o755);
writeFileSync(join(bundle, 'Contents', 'Info.plist'), PLIST);
write_icns(join(brain, 'icon.png'), join(resources, 'AppIcon.icns'));

// The worker is bundled to one file (its shared lib/wav.js inlined) and keeps its
// real node_modules beside it: onnxruntime and sharp load from there as usual.
const worker = await Bun.build({
	entrypoints: [join(brain, 'ml/worker.js')],
	target: 'bun',
	external: ['@huggingface/transformers'],
	naming: 'worker.js',
	throw: false
});
if (!worker.success) {
	for (const message of worker.logs) console.error(message);
	process.exit(1);
}
writeFileSync(join(resources, 'ml', 'worker.js'), await worker.outputs[0].text());
copyFileSync(join(brain, 'ml/package.json'), join(resources, 'ml', 'package.json'));
console.log('[compile-brain] copying the ML dependencies (a few hundred MB)');
cpSync(join(brain, 'ml/node_modules'), join(resources, 'ml', 'node_modules'), { recursive: true, dereference: true });

run('clang', [...CLANG_ARGS, '-o', join(resources, 'native', 'recorder-shim.dylib'), join(brain, 'native/recorder-shim.m')]);

console.log(`[compile-brain] ${relative(root, binary)} (${mb(size)} MB) + ${relative(root, bundle)} (${mb(dir_size(bundle))} MB)`);

if (!identity) {
	console.log('[compile-brain] CODESIGN_IDENTITY not set; leaving the output unsigned');
} else {
	sign_bundle();
}

if (!notary) {
	console.log('[compile-brain] NOTARY_PROFILE not set; skipping notarization');
} else if (!identity) {
	console.log('[compile-brain] NOTARY_PROFILE needs CODESIGN_IDENTITY; skipping notarization');
} else {
	notarize(bundle);
}

function mb(bytes) {
	return (bytes / 1048576).toFixed(1);
}

function dir_size(path) {
	let total = 0;
	(function walk(p) {
		const st = statSync(p);
		if (st.isDirectory()) for (const name of readdirSync(p)) walk(join(p, name));
		else total += st.size;
	})(path);
	return total;
}

// Nested Mach-O files (the addons and their dylibs under Resources) are signed
// first, inside out, as Apple's notarization requires; --deep is not enough.
function sign_bundle() {
	const entitlements = join(dist, 'entitlements.plist');
	writeFileSync(entitlements, ENTITLEMENTS);
	const nested = [];
	(function walk(p) {
		for (const name of readdirSync(p)) {
			const full = join(p, name);
			if (statSync(full).isDirectory()) walk(full);
			else if (/\.(node|dylib)$/.test(name)) nested.push(full);
		}
	})(resources);
	for (const target of nested) {
		run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--sign', identity, target]);
	}
	run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', entitlements, '--sign', identity, join(macos, 'substrate')]);
	run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', entitlements, '--sign', identity, bundle]);
	run('codesign', ['--verify', '--strict', bundle]);
	console.log(`[compile-brain] signed ${relative(root, bundle)} (${nested.length} nested binaries) as ${identity}`);
}

function notarize(target) {
	const zip = join(dist, 'Substrate.zip');
	run('ditto', ['-c', '-k', '--keepParent', target, zip]);
	console.log('[compile-brain] notarizing (Apple usually takes a few minutes)');
	const output = run('xcrun', ['notarytool', 'submit', zip, '--keychain-profile', notary, '--wait']);
	if (!/status: Accepted/.test(output)) {
		console.error(`[compile-brain] notarization was not accepted; see \`xcrun notarytool log\` for the submission below\n${output}`);
		process.exit(1);
	}
	run('xcrun', ['stapler', 'staple', target]);
	run('spctl', ['--assess', '--type', 'execute', target]);
	run('ditto', ['-c', '-k', '--keepParent', target, zip]);
	console.log(`[compile-brain] notarized and stapled; ${relative(root, zip)} is the one to ship`);
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
		console.error(`[compile-brain] ${command} ${args.join(' ')} failed:\n${stderr || stdout}`);
		process.exit(1);
	}
	return stdout;
}
