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

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BunPlugin } from 'bun';

if (!process.versions.bun) {
	console.error('[qjs] needs Bun — run it as `gpuix-svelte --qjs <entry>`, which finds one');
	process.exit(1);
}

const USAGE =
	'usage: gpuix-svelte --qjs <entry.ts> [--production] [--build-only] [--out <dir>] [-- args]\n' +
	'       gpuix-svelte --qjs <entry.ts> --compile [--outfile <path>] [--app [--icon <png>] [--id <bundle id>]]';

function fail(message: string): never {
	console.error(`[qjs] ${message}\n${USAGE}`);
	process.exit(2);
}

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const own = dash === -1 ? argv : argv.slice(0, dash);
const app_args = dash === -1 ? [] : argv.slice(dash + 1);
const VALUED = new Set(['--out', '--outfile', '--icon', '--id']);
const BOOLEAN = new Set(['--production', '--build-only', '--compile', '--app']);
const options = new Map<string, string>();
const positional: string[] = [];
for (let i = 0; i < own.length; i++) {
	const arg = own[i];
	if (!arg.startsWith('--')) {
		positional.push(arg);
		continue;
	}
	const eq = arg.indexOf('=');
	const name = eq === -1 ? arg : arg.slice(0, eq);
	if (VALUED.has(name)) {
		const value = eq === -1 ? own[++i] : arg.slice(eq + 1);
		if (value === undefined || value.startsWith('--')) fail(`${name} needs a value`);
		options.set(name, value);
	} else if (BOOLEAN.has(name)) {
		options.set(name, 'true');
	} else {
		fail(`unknown flag ${arg}`);
	}
}
const compile = options.has('--compile');
const app = options.has('--app');
const production = compile || options.has('--production');
const build_only = options.has('--build-only');

if (positional.length !== 1) fail('exactly one entry is expected');
if (app && !compile) fail('--app needs --compile');
if (app && process.platform !== 'darwin') fail(`--app wraps the binary in a macOS .app bundle; nothing to wrap on ${process.platform}`);

const entry = resolve(positional[0]);
const app_name = basename(dirname(entry));
const out = options.has('--out') ? resolve(options.get('--out')!) : join(process.cwd(), 'dist/qjs', app_name);
// Through the package's own exports: src/qjs-runtime.ts here, lib/qjs-runtime.js once packed.
const runtime_entry = fileURLToPath(import.meta.resolve('gpuix-svelte/qjs-runtime'));
const entry_js = join(out, basename(entry).replace(/\.[cm]?[jt]s$/, '.js'));
const runtime_js = join(out, basename(runtime_entry).replace(/\.[cm]?[jt]s$/, '.js'));
// Written into `out` by every build; its absence in a non-empty directory means the directory is not ours to clear.
const MARKER = '.gpuix-qjs';

const inside = (parent: string, child: string) => {
	const rel = relative(parent, child);
	return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
if (out === parse(out).root || inside(out, process.cwd()) || inside(out, entry)) {
	fail(`refusing to use ${out} as the output directory: it contains the project or the entry`);
}
if (existsSync(out) && readdirSync(out).length > 0 && !existsSync(join(out, MARKER))) {
	fail(`refusing to clear ${out}: not a directory this tool created (empty it yourself, or pick another --out)`);
}

// Imported after the guard: a static import would hoist `bun` above it.
const { load_module, load_svelte, resolve_svelte } = await import('./plugin.ts');

const conditions = ['custom-renderer', 'quickjs', production ? 'production' : 'development'];

const show = (path: string) => {
	const rel = relative(process.cwd(), path);
	return rel && !rel.startsWith('..') ? rel : path;
};

/** The chunks the runtime entry imports: the ones a reload must find unchanged. */
function runtime_chunks(): string {
	if (!existsSync(runtime_js)) return '';
	const source = readFileSync(runtime_js, 'utf8');
	return [...source.matchAll(/from\s*"(\.\/chunk-[^"]+)"|import\s*\(\s*"(\.\/chunk-[^"]+)"/g)]
		.map((match) => match[1] ?? match[2])
		.sort()
		.join(',');
}

let chunks = '';

/** Builds into `out`. Resolves to whether it succeeded and whether the shared runtime chunk changed. */
async function build(): Promise<{ ok: boolean; runtime_changed: boolean }> {
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
	writeFileSync(join(out, MARKER), 'written by gpuix-svelte --qjs; this directory is cleared on every build\n');

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
		return { ok: false, runtime_changed: false };
	}
	if (components === 0) {
		console.error('[qjs] no .svelte file went through the plugin');
		return { ok: false, runtime_changed: false };
	}
	if (!existsSync(entry_js)) {
		console.error(`[qjs] expected ${entry_js} among ${result.outputs.map((o) => basename(o.path)).join(', ')}`);
		return { ok: false, runtime_changed: false };
	}

	const next = runtime_chunks();
	const runtime_changed = chunks !== '' && next !== chunks;
	chunks = next;

	console.log(`[qjs] built ${show(out)} (${result.outputs.length} files${production ? ', production' : ''})`);
	return { ok: true, runtime_changed };
}

/**
 * The host binary: `GPUIX_QJS`, the prebuilt package for this platform
 * (`gpuix-qjs-<platform>-<arch>`, which the gpuix fork's packages/qjs publishes), or
 * a gpuix checkout built beside a checkout of this repository.
 */
function find_host(): string {
	const exe = process.platform === 'win32' ? 'gpuix-qjs.exe' : 'gpuix-qjs';
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
		const host = join(dirname(manifest), exe);
		if (existsSync(host)) return host;
	} catch {
		// Not installed.
	}
	const sibling = fileURLToPath(new URL(`../../gpuix/packages/native/target/release/${exe}`, import.meta.url));
	if (existsSync(sibling)) return sibling;
	console.error(`[qjs] no QuickJS host: install ${name}, or set GPUIX_QJS to a gpuix-qjs binary built from the gpuix fork's packages/qjs (\`cargo build --release\` there)`);
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
const xml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

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
	<string>${xml(executable)}</string>${icon ? '\n\t<key>CFBundleIconFile</key>\n\t<string>AppIcon</string>' : ''}
	<key>CFBundleIdentifier</key>
	<string>${xml(id)}</string>
	<key>CFBundleName</key>
	<string>${xml(name)}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
`;

/** The bundle's files, without the build marker and the runtime entry nothing imports. */
const app_files = () => readdirSync(out).filter((name) => name !== MARKER && name !== basename(runtime_js) && statSync(join(out, name)).isFile());

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
	for (const name of app_files()) copyFileSync(join(out, name), join(resources, 'gpuix-app', name));
	writeFileSync(join(resources, 'gpuix-app', 'gpuix-app.json'), JSON.stringify({ entry: basename(entry_js) }));
	const icon = options.get('--icon');
	if (icon) write_icns(resolve(icon), join(resources, 'AppIcon.icns'));
	const id = options.get('--id') ?? `dev.gpuix.svelte.${executable.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
	writeFileSync(join(bundle, 'Contents', 'Info.plist'), plist(executable, id, executable, Boolean(icon)));

	// Inner binary first, then the bundle: `--deep` is deprecated for signing.
	const identity = process.env.CODESIGN_IDENTITY;
	const sign = identity ? ['--force', '--options', 'runtime', '--timestamp', '--sign', identity] : ['--force', '-s', '-'];
	run('codesign', [...sign, join(macos, executable)]);
	run('codesign', [...sign, bundle]);
	console.log(identity ? `[qjs] signed as ${identity}` : '[qjs] CODESIGN_IDENTITY not set; signed ad hoc');
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

if (!(await build()).ok) process.exit(1);
if (build_only) process.exit(0);

const host = find_host();

if (compile) {
	const outfile = options.has('--outfile')
		? resolve(options.get('--outfile')!)
		: join(process.cwd(), 'dist', `${app_name}-qjs${process.platform === 'win32' ? '.exe' : ''}`);
	mkdirSync(dirname(outfile), { recursive: true });
	if (app) compile_app(host, outfile);
	else compile_binary(host, outfile);
	process.exit(0);
}

let child: ChildProcess;
let stopping = false;

function start_host() {
	console.log(`[qjs] ${show(host)} ${show(entry_js)}`);
	// `GPUIX_QJS_DEV` is what makes the host read its stdin for `reload` lines, and exit when that closes.
	child = spawn(host, [entry_js, ...app_args], { stdio: ['pipe', 'inherit', 'inherit'], env: { ...process.env, GPUIX_QJS_DEV: '1' } });
	child.on('error', (error) => {
		console.error(`[qjs] could not start ${host}: ${error.message}`);
		process.exit(1);
	});
	child.on('exit', (code, signal) => {
		if (!stopping) process.exit(code ?? (signal ? 1 : 0));
	});
}

start_host();
const stop = () => {
	stopping = true;
	child.kill();
	process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);

// Editors write in bursts; coalesce them, and never run two builds at once: a
// second build would wipe `out` under the first. A rebuild that fails leaves the
// running app alone. A changed runtime chunk means the cached Svelte runtime no
// longer matches the app, so the host restarts instead of reloading into two.
let timer: ReturnType<typeof setTimeout> | undefined;
let building = false;
let dirty = false;
async function rebuild() {
	if (building) {
		dirty = true;
		return;
	}
	building = true;
	try {
		let result;
		do {
			dirty = false;
			result = await build();
		} while (dirty);
		if (!result.ok) return;
		if (result.runtime_changed) {
			console.warn('[qjs] the shared runtime chunk changed; restarting the host so it loads one Svelte runtime');
			stopping = true;
			child.once('exit', () => {
				stopping = false;
				start_host();
			});
			child.kill();
			return;
		}
		child.stdin?.write('reload\n');
	} catch (error) {
		console.error(`[qjs] rebuild failed: ${(error as Error).message}`);
	} finally {
		building = false;
	}
}
watch(dirname(entry), { recursive: true }, (_event, file) => {
	if (!file || file.includes('node_modules')) return;
	if (!/\.(svelte|[cm]?[jt]s)$/.test(file)) return;
	if (inside(out, resolve(dirname(entry), file))) return;
	clearTimeout(timer);
	timer = setTimeout(rebuild, 60);
});
