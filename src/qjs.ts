/**
 * The QuickJS path, behind `gpuix-svelte --qjs` (which runs this under Bun):
 *
 *   --qjs <entry.ts> [--production] [--build-only] [--out <dir>] [-- args]
 *       bundle the entry, run it on the `gpuix-qjs` host, and on every save under the entry's
 *       directory rebuild and tell the host to re-import it, which remounts on the same window
 *   --qjs <entry.ts> --compile [--outfile <path>] [--app [--icon <png>] [--id <bundle id>]]
 *       a production bundle packed into a copy of the host: one executable, or on macOS with
 *       `--app` a signable .app with the bundle beside the binary
 *
 * Bun bundles (the Svelte compiler never runs inside QuickJS) for the same reason as
 * scripts/compile.ts: its plugin hooks are the ones src/plugin.ts already exports.
 */

import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BunPlugin } from 'bun';

if (!process.versions.bun) {
	console.error('[qjs] needs Bun — run it as `gpuix-svelte --qjs <entry>`, which finds one');
	process.exit(1);
}

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash === -1 ? argv : argv.slice(0, dash);
const app_args = dash === -1 ? [] : argv.slice(dash + 1);
const VALUED = ['--out', '--outfile', '--icon', '--id'];
const value_of = (flag: string) => (own.includes(flag) ? own[own.indexOf(flag) + 1] : undefined);
const positional = own.filter((arg, i) => !arg.startsWith('--') && !VALUED.includes(own[i - 1] ?? ''));
const compile = own.includes('--compile');
const app = own.includes('--app');
const production = compile || own.includes('--production');
const build_only = own.includes('--build-only');

if (positional.length !== 1 || (app && !compile)) {
	console.error(
		'usage: gpuix-svelte --qjs <entry.ts> [--production] [--build-only] [--out <dir>] [-- args]\n' +
			'       gpuix-svelte --qjs <entry.ts> --compile [--outfile <path>] [--app [--icon <png>] [--id <bundle id>]]'
	);
	process.exit(2);
}
if (app && process.platform !== 'darwin') {
	console.error(`[qjs] --app wraps the binary in a macOS .app bundle; nothing to wrap on ${process.platform}`);
	process.exit(1);
}

const entry = resolve(positional[0]);
const app_name = basename(dirname(entry));
const out = value_of('--out') ? resolve(value_of('--out')!) : join(process.cwd(), 'dist/qjs', app_name);
// Through the package's own exports: src/qjs-runtime.ts here, lib/qjs-runtime.js once packed.
const runtime_entry = fileURLToPath(import.meta.resolve('gpuix-svelte/qjs-runtime'));
const entry_js = join(out, basename(entry).replace(/\.[cm]?[jt]s$/, '.js'));

// Imported after the guard: a static import would hoist `bun` above it.
const { load_module, load_svelte, resolve_svelte } = await import('./plugin.ts');

const conditions = ['custom-renderer', 'quickjs', production ? 'production' : 'development'];

let chunks: string[] = [];

async function build(): Promise<boolean> {
	// `Bun.build` ignores the plugin bunfig.toml preloads, and a `.svelte` import with
	// no plugin silently becomes a file asset, so count what actually went through it.
	let components = 0;
	const svelte_plugin: BunPlugin = {
		name: 'gpuix-svelte',
		setup(build) {
			// The host provides it as a native module. Through the plugin rather than
			// `external`, which would also externalize `@gpuix/native/host`, plain JS to bundle.
			build.onResolve({ filter: /^@gpuix\/native$/ }, () => ({ path: '@gpuix/native', external: true }));
			build.onResolve({ filter: /^svelte(\/|$)/ }, resolve_svelte(conditions));
			build.onLoad({ filter: /\.svelte\.[jt]s$/ }, load_module);
			build.onLoad({ filter: /\.svelte$/ }, (args) => {
				components++;
				return load_svelte(args);
			});
		}
	};

	rmSync(out, { recursive: true, force: true });
	mkdirSync(out, { recursive: true });

	const result = await Bun.build({
		entrypoints: [entry, runtime_entry],
		outdir: out,
		// `node`, not `browser`: the `quickjs` condition picks this package's node-free entry
		// itself, and esm-env's BROWSER stays false, so nothing reaches for `document`.
		target: 'node',
		format: 'esm',
		splitting: true,
		naming: { entry: '[name].js', chunk: 'chunk-[hash].js' },
		conditions,
		...(production && { define: { 'process.env.NODE_ENV': '"production"' }, minify: true }),
		plugins: [svelte_plugin],
		throw: false
	});

	if (!result.success) {
		for (const message of result.logs) console.error(message);
		return false;
	}
	if (components === 0) {
		console.error('[qjs] no .svelte file went through the plugin');
		return false;
	}
	if (!existsSync(entry_js)) {
		console.error(`[qjs] expected ${entry_js} among ${result.outputs.map((o) => basename(o.path)).join(', ')}`);
		return false;
	}

	const next = result.outputs.filter((output) => output.kind === 'chunk').map((output) => basename(output.path));
	if (chunks.length && (next.length !== chunks.length || next.some((name, i) => name !== chunks[i]))) {
		console.warn('[qjs] the shared runtime chunk changed, so the reload loads a second Svelte runtime; restart for a clean state');
	}
	chunks = next;

	console.log(`[qjs] built ${show(out)} (${result.outputs.length} files${production ? ', production' : ''})`);
	return true;
}

/**
 * The host binary: `GPUIX_QJS`, or the prebuilt package for this platform
 * (`gpuix-qjs-<platform>-<arch>`), which the gpuix fork's packages/qjs publishes.
 */
function find_host(): string {
	const from_env = process.env.GPUIX_QJS;
	if (from_env) {
		const host = resolve(from_env);
		if (existsSync(host)) return host;
		console.error(`[qjs] GPUIX_QJS=${from_env} does not exist`);
		process.exit(1);
	}
	const name = `gpuix-qjs-${process.platform}-${process.arch}`;
	try {
		const manifest = fileURLToPath(import.meta.resolve(`${name}/package.json`));
		const host = join(dirname(manifest), process.platform === 'win32' ? 'gpuix-qjs.exe' : 'gpuix-qjs');
		if (existsSync(host)) return host;
	} catch {
		// Not installed.
	}
	// The repo's own development case: the gpuix fork checked out beside this one and built.
	const sibling = fileURLToPath(new URL('../../gpuix/packages/native/target/release/gpuix-qjs', import.meta.url));
	if (existsSync(sibling)) return sibling;
	console.error(
		`[qjs] no QuickJS host: install ${name}, or set GPUIX_QJS to a gpuix-qjs binary built from the gpuix fork's packages/qjs (\`cargo build --release\` there; a ../gpuix checkout is found on its own)`
	);
	process.exit(1);
}

function run(command: string, args: string[]): string {
	const { status, stdout, stderr } = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	if (status !== 0) {
		console.error(`[qjs] ${command} ${args.join(' ')} failed:\n${stderr || stdout}`);
		process.exit(1);
	}
	return stdout;
}

const mb = (bytes: number) => (bytes / 1048576).toFixed(1);
const show = (path: string) => {
	const rel = relative(process.cwd(), path);
	return rel && !rel.startsWith('..') ? rel : path;
};

// iconutil only reads an .iconset directory holding the ten standard sizes,
// which sips cuts from the 1024px source; both ship with macOS.
function write_icns(png: string, icns: string) {
	const iconset = join(dirname(icns), 'AppIcon.iconset');
	rmSync(iconset, { recursive: true, force: true });
	mkdirSync(iconset);
	for (const points of [16, 32, 128, 256, 512]) {
		run('sips', ['-z', `${points}`, `${points}`, png, '--out', join(iconset, `icon_${points}x${points}.png`)]);
		run('sips', ['-z', `${points * 2}`, `${points * 2}`, png, '--out', join(iconset, `icon_${points}x${points}@2x.png`)]);
	}
	run('iconutil', ['-c', 'icns', iconset, '-o', icns]);
	rmSync(iconset, { recursive: true, force: true });
}

const plist = (executable: string, id: string, name: string, icon: boolean) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>${executable}</string>${icon ? '\n\t<key>CFBundleIconFile</key>\n\t<string>AppIcon</string>' : ''}
	<key>CFBundleIdentifier</key>
	<string>${id}</string>
	<key>CFBundleName</key>
	<string>${name}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
`;

/**
 * The bundle beside the host binary inside a `.app`, where codesign can seal it:
 * appended data fails its strict validation, so a single file is unsigned-only.
 * QuickJS is an interpreter, so unlike the Bun build this needs no JIT entitlements.
 */
function compile_app(host: string, outfile: string) {
	const bundle = outfile.endsWith('.app') ? outfile : `${outfile}.app`;
	const executable = basename(bundle, '.app');
	const macos = join(bundle, 'Contents', 'MacOS');
	const resources = join(bundle, 'Contents', 'Resources');
	rmSync(bundle, { recursive: true, force: true });
	mkdirSync(macos, { recursive: true });
	mkdirSync(join(resources, 'gpuix-app'), { recursive: true });
	copyFileSync(host, join(macos, executable));
	chmodSync(join(macos, executable), 0o755);
	cpSync(out, join(resources, 'gpuix-app'), { recursive: true });
	writeFileSync(join(resources, 'gpuix-app', 'gpuix-app.json'), JSON.stringify({ entry: basename(entry_js) }));
	const icon = value_of('--icon');
	if (icon) write_icns(resolve(icon), join(resources, 'AppIcon.icns'));
	const id = value_of('--id') ?? `dev.gpuix.svelte.${executable.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
	writeFileSync(join(bundle, 'Contents', 'Info.plist'), plist(executable, id, executable, Boolean(icon)));

	const identity = process.env.CODESIGN_IDENTITY;
	if (identity) {
		run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--deep', '--sign', identity, bundle]);
		console.log(`[qjs] signed as ${identity}`);
	} else {
		run('codesign', ['--force', '--deep', '-s', '-', bundle]);
		console.log('[qjs] CODESIGN_IDENTITY not set; signed ad hoc');
	}
	run('codesign', ['--verify', '--strict', bundle]);
	console.log(`[qjs] ${show(bundle)} (${mb(statSync(join(macos, executable)).size)} MB binary + bundle)`);
}

function compile_binary(host: string, outfile: string) {
	run(host, ['--pack', out, '--entry', basename(entry_js), '--out', outfile]);
	console.log(`[qjs] ${show(outfile)} (${mb(statSync(outfile).size)} MB)`);
	if (process.platform === 'darwin') {
		console.log('[qjs] the payload sits after the Mach-O, which codesign refuses; use --app for a signable build');
	}
}

if (!(await build())) process.exit(1);
if (build_only) process.exit(0);

const host = find_host();

if (compile) {
	const outfile = value_of('--outfile')
		? resolve(value_of('--outfile')!)
		: join(process.cwd(), 'dist', app_name + (process.platform === 'win32' ? '.exe' : ''));
	mkdirSync(dirname(outfile), { recursive: true });
	if (app) compile_app(host, outfile);
	else compile_binary(host, outfile);
	process.exit(0);
}

console.log(`[qjs] ${show(host)} ${show(entry_js)}`);
const child = spawn(host, [entry_js, ...app_args], { stdio: ['pipe', 'inherit', 'inherit'] });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// Editors write in bursts; coalesce them. A rebuild that fails leaves the running app alone.
let timer: ReturnType<typeof setTimeout> | undefined;
watch(dirname(entry), { recursive: true }, (_event, file) => {
	if (!file || file.includes('node_modules')) return;
	if (!/\.(svelte|[cm]?[jt]s)$/.test(file)) return;
	if (resolve(dirname(entry), file).startsWith(out)) return;
	clearTimeout(timer);
	timer = setTimeout(async () => {
		if (await build()) child.stdin.write('reload\n');
	}, 60);
});
