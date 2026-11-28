/**
 * `gpuix-svelte/build` — `Bun.build({ compile })` over a static-`render()` entry, then the
 * platform's packaging: a `.app` on macOS, a console-less `.exe` with version info on Windows,
 * a bare executable on Linux that installs its icon when it runs. Bun is the bundler, so this is Bun-only like plugin.ts.
 */

import type { BunPlugin } from 'bun';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	archive_name,
	decode_png,
	DEFAULT_ICON,
	icon_group,
	info_plist,
	LINUX_ICON_SIZES,
	native_addon,
	net_wm_icon,
	notarize,
	notary_auth,
	pe_resources,
	read_app_options,
	resolve_app_info,
	RT_GROUP_ICON,
	RT_ICON,
	sign,
	update_fragment,
	update_platform,
	windows_icons,
	write_archive,
	write_icns,
	X11_ICON_SIZES,
	type AppInfo,
	type EmbeddedAppInfo,
	type EntryApp,
	type IconImage
} from './app-bundle.ts';
import { APP_ID, type EmbeddedIcon } from './linux-icon.ts';

import { is_version } from './update.ts';

export type { AppInfo, UpdateFragment } from './app-bundle.ts';

export interface BuildOptions {
	/** The entry that mounts the app with `render()` — `standalone.ts` in a scaffolded app. */
	entry: string | URL;
	/** Where the output goes; `dist` in the working directory by default. */
	outdir?: string | URL;
	/**
	 * Also write the archive to distribute, `<slug>-<version>-<platform>.zip`,
	 * and `update-<platform>.json` beside it, the fragment `gpuix-svelte update manifest` merges.
	 */
	archive?: boolean;
	/** With `archive`, runs on the packaged output before macOS signing, so the signature and the archive both cover what it does: where a Windows `.exe` gets `signtool`, say. */
	beforeArchive?: (result: Pick<BuildResult, 'output' | 'binary' | 'app'>) => void | Promise<void>;
	/**
	 * Compile the app to machine code ahead of time (Bun's experimental `compile.aot`). Off by
	 * default; on a Bun that lacks it the build says so and goes ahead without it.
	 */
	aot?: boolean;
	/**
	 * Leave out the Bun and Node.js APIs the app never calls (Bun's experimental `compile.trim`).
	 * Off by default; on a Bun that lacks it the build says so and goes ahead without it. An object
	 * is passed to Bun as it is: `remove` takes features out even where the compiler cannot prove
	 * them unused, and the app throws `ERR_FEATURE_REMOVED` if it reaches one.
	 */
	trim?: boolean | TrimOptions;
	/**
	 * On Linux the executable installs `<identifier>.desktop` and its icon under `~/.local/share` when it starts,
	 * which is the only place GNOME takes a window's icon from. False leaves the user's home alone; X11 window
	 * managers that read the icon off the window still get it.
	 */
	desktopEntry?: boolean;
}

/** Bun's `compile.trim` object; the names are Bun's feature names (https://bun.com/docs/compiler/size#feature-names). */
export interface TrimOptions {
	allow?: string[];
	remove?: string[];
}

type CompileFlag = 'aot' | 'trim';

export interface BuildResult {
	/** What to ship: the `.app` on macOS, the `.exe` on Windows, the executable on Linux. */
	output: string;
	/** The executable itself, inside the `.app` on macOS. */
	binary: string;
	app: AppInfo;
	signed: boolean;
	notarized: boolean;
	/** With `archive: true`: the archive and its update fragment. */
	archive?: string;
	fragment?: string;
}

interface WindowsInfo {
	hideConsole: boolean;
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
	const outdir = to_path(options.outdir ?? 'dist');
	const scratch = join(outdir, '.gpuix-svelte-build');
	rmSync(scratch, { recursive: true, force: true });
	mkdirSync(scratch, { recursive: true });
	try {
		return await build_in(options, outdir, scratch);
	} finally {
		try {
			rmSync(scratch, { recursive: true, force: true });
		} catch (error) {
			// Thrown from a finally, this would replace the error the build itself failed with.
			log(`could not remove ${rel(scratch)}: ${(error as Error).message}`);
		}
	}
}

async function build_in(options: BuildOptions, outdir: string, scratch: string): Promise<BuildResult> {
	// Imported after the guard: plugin.ts imports `bun`, which Node cannot resolve.
	const { load_module, load_svelte, resolve_native_cjs, resolve_svelte } = await import('./plugin.ts');

	const entry = to_path(options.entry);
	const app = resolve_app_info(entry_app(entry), entry);
	if (!existsSync(app.icon)) throw new Error(`${TAG} the icon ${rel(entry)} names, ${app.icon}, does not exist`);
	if (app.update && !is_version(app.version)) throw new Error(`${TAG} version "${app.version}" is not semver, which an app that updates itself compares by`);
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
	let icons: IconImage[] | undefined;
	if (process.platform === 'win32') {
		// Anything left unset keeps bun.exe's own value: description "Bun", publisher "Oven", Bun's version.
		windows = { hideConsole: true, title: app.name, description: app.description || app.name, publisher: app.publisher || app.name, copyright: app.copyright || ' ' };
		const numeric = /^v?(\d+(?:\.\d+){0,3})/.exec(app.version)?.[1];
		windows.version = numeric && windows_version(numeric) ? numeric : '0.0.0.0';
		if (windows.version !== app.version) log(`version "${app.version}" goes into the .exe as ${windows.version}; Windows file properties take numbers only`);
		icons = windows_icons(app.icon, scratch);
	}
	const linux = process.platform === 'linux' ? await embedded_linux_icon(app.icon, options.desktopEntry !== false) : null;
	if (linux?.png && !APP_ID.test(app.identifier)) {
		log(`identifier "${app.identifier}" cannot name a desktop entry (letters, digits, ".", "-" and "_"), so the app installs none and GNOME shows it without an icon`);
	}

	const flags = supported_flags([...(options.aot ? ['aot' as const] : []), ...(options.trim ? ['trim' as const] : [])]);
	const addon = flags.length > 0 ? native_addon() : null;
	// Bun's `trim` report blames napi-rs's loader for a `require()` of a path from the environment and for `eval` (at a `hasOwnProperty.call`), which keep Bun's module loader and interpreter in.
	const direct = join(scratch, 'native.cjs');
	if (addon) writeFileSync(direct, `module.exports = require(${JSON.stringify(addon)});\n`);

	// `Bun.build` ignores the plugin bunfig.toml preloads, and a `.svelte` import with
	// no plugin silently becomes a file asset, so count what actually went through it.
	let components = 0;
	const plugin: BunPlugin = {
		name: 'gpuix-svelte',
		setup(build) {
			build.onResolve({ filter: /^@gpuix\/native$/ }, addon ? () => ({ path: direct }) : resolve_native_cjs);
			build.onResolve({ filter: /^svelte(\/|$)/ }, resolve_svelte(['svelte-custom-renderer', 'production']));
			build.onLoad({ filter: /\.svelte\.[jt]s$/ }, load_module);
			build.onLoad({ filter: /\.svelte$/ }, (args) => {
				components++;
				return load_svelte(args);
			});
		}
	};

	// What gpuix-svelte/update knows about the executable it is running in.
	const embedded: EmbeddedAppInfo = { name: app.name, slug: app.slug, identifier: app.identifier, version: app.version, ...(app.update && { update: app.update }) };

	const result = await Bun.build({
		entrypoints: [entry],
		target: 'bun',
		// Bun implies `development` unless NODE_ENV is production at build time, and
		// esm-env lists it first, so both are needed for Svelte's production runtime.
		conditions: ['svelte-custom-renderer', 'production'],
		define: {
			'process.env.NODE_ENV': '"production"',
			'process.env.GPUIX_APP_INFO': JSON.stringify(JSON.stringify(embedded)),
			'process.env.GPUIX_APP_ICON': JSON.stringify(linux ? JSON.stringify(linux) : ''),
			// The dev-run override must not redirect a shipped app.
			'process.env.GPUIX_UPDATE_MANIFEST': '""',
			// A binary cannot serve automation, and `aot` would otherwise compile the server and zod in.
			'process.env.GPUIX_AUTOMATION': '""'
		},
		minify: true,
		plugins: [plugin],
		throw: false,
		compile: {
			outfile: binary,
			// A bunfig.toml or .env beside the launched binary must not reconfigure it.
			autoloadBunfig: false,
			autoloadDotenv: false,
			...(windows && { windows }),
			// Spread, since @types/bun does not declare them yet.
			...(flags.includes('aot') && { aot: true }),
			...(flags.includes('trim') && { trim: options.trim })
		}
	});

	if (!result.success) {
		for (const message of result.logs) console.error(message);
		throw new Error(`${TAG} bundling ${rel(entry)} failed`);
	}
	if (components === 0) throw new Error(`${TAG} no .svelte file went through the plugin; ${rel(entry)} has to import the component it renders`);

	// First, since Windows' resource writer drops anything appended past the last section, and the checks below must see the final file.
	if (icons) await set_exe_icon(binary, icons);
	const size = statSync(binary).size;
	if (addon) {
		// Both flags shrink the runtime below bare Bun, so no size floor can tell a lost addon apart.
		if (!readFileSync(binary).includes(readFileSync(addon))) throw new Error(`${TAG} ${rel(binary)} does not contain the GPUI addon`);
	} else {
		// The output is Bun's own executable plus the payload, and the addon is at least
		// 17 MB on every platform, so anything closer to bare Bun than that lost it.
		const floor = statSync(process.execPath).size + 12 * 1024 * 1024;
		if (size < floor) throw new Error(`${TAG} ${rel(binary)} is ${mb(size)} MB, under the ${mb(floor)} MB floor — the GPUI addon was not embedded`);
	}

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
	log(`${rel(output)} (${mb(size)} MB${flags.length > 0 ? `, ${flags.join(' + ')}` : ''}) — ${app.name} ${app.version}, ${app.identifier}${app.icon === DEFAULT_ICON ? ', default icon' : ''}`);

	const archive = options.archive ? join(outdir, archive_name(app)) : undefined;
	if (archive) await options.beforeArchive?.({ output, binary: executable, app });

	const identity = process.env.CODESIGN_IDENTITY;
	const notary = notary_auth();
	let signed = false;
	let notarized = false;
	if (process.platform !== 'darwin') {
		if (identity || notary) log('CODESIGN_IDENTITY and the notarization variables apply to the macOS build only');
	} else if (!identity) {
		log('CODESIGN_IDENTITY not set; leaving the .app unsigned');
	} else {
		sign(output, identity, scratch);
		signed = true;
		log(`signed as ${identity}`);
		if (!notary) {
			log('neither NOTARY_PROFILE nor APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID set; skipping notarization');
		} else {
			const zip = archive ?? join(outdir, `${app.slug}.zip`);
			notarize(output, notary, zip, log);
			notarized = true;
			log(`notarized and stapled; ${rel(zip)} is the one to ship`);
		}
	}

	let fragment: string | undefined;
	if (archive) {
		// Notarization already wrote the stapled zip there.
		if (!notarized) write_archive(output, archive);
		fragment = join(outdir, `update-${update_platform()}.json`);
		writeFileSync(fragment, JSON.stringify(update_fragment(app, archive), null, '\t') + '\n');
		log(`${rel(archive)} (${mb(statSync(archive).size)} MB) and ${rel(fragment)}, for gpuix-svelte update manifest`);
	}

	return { output, binary: executable, app, signed, notarized, archive, fragment };
}

function entry_app(entry: string): EntryApp {
	const source = new Bun.Transpiler({ loader: 'ts' }).transformSync(readFileSync(entry, 'utf8'));
	try {
		return read_app_options(source);
	} catch (error) {
		throw new Error(`${TAG} ${rel(entry)}: ${(error as Error).message}`, { cause: error });
	}
}

/** `Bun.build` silently ignores a compile option it does not know, so ask the CLI, which lists each flag wherever the API has it. */
function supported_flags(requested: CompileFlag[]): CompileFlag[] {
	if (requested.length === 0) return [];
	const help = spawnSync(process.execPath, ['build', '--help'], { encoding: 'utf8' }).stdout ?? '';
	const supported = requested.filter((flag) => new RegExp(`^\\s*--${flag}\\s`, 'm').test(help));
	const missing = requested.filter((flag) => !supported.includes(flag));
	if (missing.length > 0) {
		const [verb, pronoun] = missing.length > 1 ? ['have', 'them'] : ['has', 'it'];
		log(`${missing.join(' and ')} ${verb} no effect on this build: Bun ${Bun.version_with_sha} does not support ${pronoun}`);
	}
	return supported;
}

const EN_US = 0x409;

/**
 * GPUI's window class takes its icon from group 1 of the executable, and Bun's `compile.windows.icon` writes group 0 beside
 * bun.exe's named group, which Explorer then shows, so the build replaces every icon resource with its own.
 */
async function set_exe_icon(exe: string, images: IconImage[]) {
	const { dlopen, FFIType, ptr } = await import('bun:ffi');
	const { symbols: kernel32, close } = dlopen('kernel32.dll', {
		BeginUpdateResourceW: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.u64 },
		UpdateResourceW: { args: [FFIType.u64, FFIType.u64, FFIType.u64, FFIType.u16, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
		EndUpdateResourceW: { args: [FFIType.u64, FFIType.i32], returns: FFIType.i32 }
	});
	const wide = (text: string) => Buffer.from(`${text}\0`, 'utf16le');
	const group = icon_group(images);
	const writes = [...images.map((image, i) => ({ type: RT_ICON, name: i + 1, data: image.bytes })), { type: RT_GROUP_ICON, name: 1, data: group }];
	const before = readFileSync(exe);
	const stale = [RT_ICON, RT_GROUP_ICON]
		.flatMap((type) => pe_resources(before, type).map((resource) => ({ type, ...resource })))
		.filter(({ type, name, lang }) => lang !== EN_US || !writes.some((write) => write.type === type && write.name === name));
	try {
		const handle = kernel32.BeginUpdateResourceW(wide(exe), 0);
		if (handle === 0n) throw new Error(`${TAG} cannot open ${rel(exe)} to write its icon`);
		const update = (type: number, name: number | string, lang: number, data: Uint8Array | null) => {
			const named = typeof name === 'string' ? wide(name) : null;
			return kernel32.UpdateResourceW(handle, BigInt(type), named ? BigInt(ptr(named)) : BigInt(name), lang, data, data?.length ?? 0) !== 0;
		};
		const written = stale.every(({ type, name, lang }) => update(type, name, lang, null)) && writes.every(({ type, name, data }) => update(type, name, EN_US, data));
		if (!kernel32.EndUpdateResourceW(handle, written ? 0 : 1) || !written) throw new Error(`${TAG} could not write the icon into ${rel(exe)}`);
	} finally {
		close();
	}
	const after = readFileSync(exe);
	const groups = pe_resources(after, RT_GROUP_ICON);
	const icons = pe_resources(after, RT_ICON);
	const exact = groups.length === 1 && groups[0].name === 1 && groups[0].data.equals(group) && icons.length === images.length && images.every((image, i) => icons.some((icon) => icon.name === i + 1 && icon.data.equals(image.bytes)));
	if (!exact) throw new Error(`${TAG} ${rel(exe)} came out with icon groups ${JSON.stringify(groups.map((g) => g.name))} and ${icons.length} icons, not the one group and ${images.length} icons written`);
}

/** Bun.Image cuts the sizes because Linux has no scaler of its own, and every one comes out as the RGBA PNG `decode_png` reads. */
async function embedded_linux_icon(png: string, desktop_entry: boolean): Promise<EmbeddedIcon> {
	const source = readFileSync(png);
	const theme = await Promise.all(LINUX_ICON_SIZES.map(async (size) => Buffer.from(await new Bun.Image(source).resize(size, size).png().bytes())));
	const x11 = net_wm_icon(X11_ICON_SIZES.map((size) => decode_png(theme[LINUX_ICON_SIZES.indexOf(size)])));
	return {
		...(desktop_entry && { png: Object.fromEntries(theme.map((bytes, i) => [LINUX_ICON_SIZES[i], bytes.toString('base64')])) }),
		x11: x11.toString('base64')
	};
}

/** Windows file versions are up to four 16-bit integers. */
function windows_version(version: string): boolean {
	const parts = version.split('.');
	return parts.length <= 4 && parts.every((part) => /^\d+$/.test(part) && Number(part) <= 65535);
}

function to_path(target: string | URL): string {
	return target instanceof URL ? fileURLToPath(target) : resolve(target);
}
