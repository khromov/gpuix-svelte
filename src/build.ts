/**
 * `gpuix-svelte/build` — `Bun.build({ compile })` over a static-`render()` entry, then the
 * platform's packaging: a `.app` on macOS, a console-less `.exe` with version info on Windows,
 * a bare executable on Linux. Bun is the bundler, so this is Bun-only like plugin.ts.
 */

import type { BunPlugin } from 'bun';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ICON, info_plist, notarize, read_app_options, resolve_app_info, sign, write_icns, write_ico, type AppInfo, type EntryApp } from './app-bundle.ts';

export type { AppInfo } from './app-bundle.ts';

export interface BuildOptions {
	/** The entry that mounts the app with `render()` — `standalone.ts` in a scaffolded app. */
	entry: string | URL;
	/** Where the output goes; `dist` in the working directory by default. */
	outdir?: string | URL;
}

export interface BuildResult {
	/** What to ship: the `.app` on macOS, the `.exe` on Windows, the executable on Linux. */
	output: string;
	/** The executable itself, inside the `.app` on macOS. */
	binary: string;
	app: AppInfo;
	signed: boolean;
	notarized: boolean;
}

interface WindowsInfo {
	hideConsole: boolean;
	icon?: string;
	title?: string;
	publisher?: string;
	version?: string;
	description?: string;
	copyright?: string;
}

const TAG = '[gpuix-svelte/build]';
const log = (line: string) => console.log(`${TAG} ${line}`);
const rel = (path: string) => relative(process.cwd(), path) || '.';
const mb = (bytes: number) => (bytes / 1048576).toFixed(1);

export async function build(options: BuildOptions): Promise<BuildResult> {
	if (!process.versions.bun) throw new Error(`${TAG} needs Bun — run the build script with \`bun\``);
	// Imported after the guard: plugin.ts imports `bun`, which Node cannot resolve.
	const { load_module, load_svelte, resolve_native_cjs, resolve_svelte } = await import('./plugin.ts');

	const entry = to_path(options.entry);
	const outdir = to_path(options.outdir ?? 'dist');
	const scratch = join(outdir, '.gpuix-svelte-build');
	rmSync(scratch, { recursive: true, force: true });
	mkdirSync(scratch, { recursive: true });

	const app = resolve_app_info(entry_app(entry), entry);
	if (!existsSync(app.icon)) throw new Error(`${TAG} the icon ${rel(entry)} names, ${app.icon}, does not exist`);
	const binary = join(outdir, process.platform === 'win32' ? `${app.slug}.exe` : app.slug);
	const bundle = join(outdir, `${app.name.replace(/[/\\:]/g, '-')}.app`);
	try {
		rmSync(binary, { force: true });
	} catch (error) {
		// Windows locks a running .exe, and Bun reports that as EFAULT rather than EBUSY.
		throw new Error(`${TAG} cannot replace ${rel(binary)}; if the app is still running, close it first (${(error as Error).message})`, { cause: error });
	}
	rmSync(bundle, { recursive: true, force: true });

	let windows: WindowsInfo | undefined;
	if (process.platform === 'win32') {
		// Anything left unset keeps bun.exe's own value: description "Bun", publisher "Oven", Bun's version.
		windows = { hideConsole: true, title: app.name, description: app.description || app.name, publisher: app.publisher || app.name, copyright: app.copyright || ' ' };
		const numeric = /^\d+(\.\d+){0,3}/.exec(app.version)?.[0];
		windows.version = numeric && windows_version(numeric) ? numeric : '0.0.0.0';
		if (windows.version !== app.version) log(`version "${app.version}" goes into the .exe as ${windows.version}; Windows file properties take numbers only`);
		windows.icon = join(scratch, 'AppIcon.ico');
		write_ico(app.icon, windows.icon, scratch);
	}

	// `Bun.build` ignores the plugin bunfig.toml preloads, and a `.svelte` import with
	// no plugin silently becomes a file asset, so count what actually went through it.
	let components = 0;
	const plugin: BunPlugin = {
		name: 'gpuix-svelte',
		setup(build) {
			build.onResolve({ filter: /^@gpuix\/native$/ }, resolve_native_cjs);
			build.onResolve({ filter: /^svelte(\/|$)/ }, resolve_svelte(['custom-renderer', 'production']));
			build.onLoad({ filter: /\.svelte\.[jt]s$/ }, load_module);
			build.onLoad({ filter: /\.svelte$/ }, (args) => {
				components++;
				return load_svelte(args);
			});
		}
	};

	const result = await Bun.build({
		entrypoints: [entry],
		target: 'bun',
		// Bun implies `development` unless NODE_ENV is production at build time, and
		// esm-env lists it first, so both are needed for Svelte's production runtime.
		conditions: ['custom-renderer', 'production'],
		define: { 'process.env.NODE_ENV': '"production"' },
		minify: true,
		plugins: [plugin],
		throw: false,
		compile: {
			outfile: binary,
			// A bunfig.toml or .env beside the launched binary must not reconfigure it.
			autoloadBunfig: false,
			autoloadDotenv: false,
			...(windows && { windows })
		}
	});

	if (!result.success) {
		for (const message of result.logs) console.error(message);
		throw new Error(`${TAG} bundling ${rel(entry)} failed`);
	}
	if (components === 0) throw new Error(`${TAG} no .svelte file went through the plugin; ${rel(entry)} has to import the component it renders`);

	// The output is Bun's own executable plus the payload, and the addon is at least
	// 17 MB on every platform, so anything closer to bare Bun than that lost it.
	const size = statSync(binary).size;
	const floor = statSync(process.execPath).size + 12 * 1024 * 1024;
	if (size < floor) throw new Error(`${TAG} ${rel(binary)} is ${mb(size)} MB, under the ${mb(floor)} MB floor — the GPUI addon was not embedded`);

	let output = binary;
	let executable = binary;
	if (process.platform === 'darwin') {
		const macos = join(bundle, 'Contents', 'MacOS');
		const resources = join(bundle, 'Contents', 'Resources');
		mkdirSync(macos, { recursive: true });
		mkdirSync(resources, { recursive: true });
		executable = join(macos, app.slug);
		renameSync(binary, executable);
		chmodSync(executable, 0o755);
		writeFileSync(join(bundle, 'Contents', 'Info.plist'), info_plist(app));
		write_icns(app.icon, join(resources, 'AppIcon.icns'), scratch);
		output = bundle;
	}
	log(`${rel(output)} (${mb(size)} MB) — ${app.name} ${app.version}, ${app.identifier}${app.icon === DEFAULT_ICON ? ', default icon' : ''}`);

	const identity = process.env.CODESIGN_IDENTITY;
	const notary = process.env.NOTARY_PROFILE;
	let signed = false;
	let notarized = false;
	if (process.platform !== 'darwin') {
		if (identity || notary) log('CODESIGN_IDENTITY and NOTARY_PROFILE apply to the macOS build only');
	} else if (!identity) {
		log('CODESIGN_IDENTITY not set; leaving the .app unsigned');
	} else {
		sign(output, identity, scratch);
		signed = true;
		log(`signed as ${identity}`);
		if (!notary) {
			log('NOTARY_PROFILE not set; skipping notarization');
		} else {
			const zip = join(outdir, `${app.slug}.zip`);
			notarize(output, notary, zip, log);
			notarized = true;
			log(`notarized and stapled; ${rel(zip)} is the one to ship`);
		}
	}

	rmSync(scratch, { recursive: true, force: true });
	return { output, binary: executable, app, signed, notarized };
}

function entry_app(entry: string): EntryApp {
	const source = new Bun.Transpiler({ loader: 'ts' }).transformSync(readFileSync(entry, 'utf8'));
	try {
		return read_app_options(source);
	} catch (error) {
		throw new Error(`${TAG} ${rel(entry)}: ${(error as Error).message}`, { cause: error });
	}
}

/** Windows file versions are up to four 16-bit integers. */
function windows_version(version: string): boolean {
	const parts = version.split('.');
	return parts.length <= 4 && parts.every((part) => /^\d+$/.test(part) && Number(part) <= 65535);
}

function to_path(target: string | URL): string {
	return target instanceof URL ? fileURLToPath(target) : resolve(target);
}
