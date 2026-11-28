/**
 * Not part of `npm test`: Linux and Bun only, and it opens a window on the X11 display in DISPLAY (CI runs it
 * under xvfb-run). Builds an entry that declares no identifier, starts the executable with an empty
 * XDG_DATA_HOME, and reads back the app id its window got, the desktop entry and icons it installed, and the
 * `_NET_WM_ICON` it set on its window.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, finish } from 'gpuix-svelte/test';
import { decode_png, LINUX_ICON_SIZES, net_wm_icon, X11_ICON_SIZES } from '../src/app-bundle.ts';
import { desktop_entry, open_display } from '../src/linux-icon.ts';

if (process.platform !== 'linux' || !process.versions.bun || !process.env.DISPLAY) {
	console.log('linux-icon: skipped, it needs Linux, Bun and an X11 display');
	process.exit(0);
}

let child: ChildProcess | null = null;
process.on('exit', () => child?.kill());
setTimeout(() => {
	console.error('linux-icon: no verdict after 120 s');
	process.exit(1);
}, 120_000).unref();

// Inside the repo, so `gpuix-svelte` resolves from the entry as the build requires.
const entry_dir = fileURLToPath(new URL('.linux-icon-tmp', import.meta.url));
rmSync(entry_dir, { recursive: true, force: true });
mkdirSync(entry_dir);
const entry = join(entry_dir, 'standalone.ts');
writeFileSync(entry, `import { render } from 'gpuix-svelte';\nimport Counter from '../../examples/counter/Counter.svelte';\n\nrender(Counter, { title: 'Icon test' });\n`);

const { build } = await import('../src/build.ts');
const scratch = mkdtempSync(join(tmpdir(), 'gpuix-svelte-linux-icon-'));
const data = join(scratch, 'data');
const { binary, app } = await build({ entry, outdir: join(scratch, 'dist') });
child = spawn(binary, [], { env: { ...process.env, WAYLAND_DISPLAY: '', XDG_DATA_HOME: data }, stdio: 'inherit' });

const x = await open_display();
if (!x) throw new Error(`linux-icon: DISPLAY=${process.env.DISPLAY} is not a local display`);
const [pid_atom, icon_atom, class_atom] = await Promise.all(['_NET_WM_PID', '_NET_WM_ICON', 'WM_CLASS'].map((name) => x.atom(name)));
const CARDINAL = 6;
const STRING = 31;
let window = 0;
let icon: Buffer | null = null;
const started = Date.now();
while (!icon && Date.now() - started < 60_000) {
	await new Promise((resolve) => setTimeout(resolve, 250));
	[window = 0] = await x.windows_of(pid_atom, child.pid ?? -1);
	if (window) icon = (await x.property(window, icon_atom, CARDINAL, 1 << 20))?.data ?? null;
}
const wm_class = window ? (await x.property(window, class_atom, STRING, 1024))?.data.toString('latin1') : null;
x.close();
child.kill();

const theme = LINUX_ICON_SIZES.map((size) => readFileSync(join(data, 'icons', 'hicolor', `${size}x${size}`, 'apps', `${app.identifier}.png`)));
check(
	"with no identifier in the entry, the window's WM_CLASS is the build's local.<slug>",
	[app.identifier, wm_class],
	['local.icon-test', 'local.icon-test\0local.icon-test\0']
);
check(
	'the executable installed a desktop entry naming itself',
	readFileSync(join(data, 'applications', `${app.identifier}.desktop`), 'utf8'),
	desktop_entry(app.identifier, app.name, binary)
);
check(
	'and an icon at every size, each the size its directory says',
	theme.map((png) => decode_png(png).width),
	LINUX_ICON_SIZES
);
check(
	"the window's _NET_WM_ICON is those icons' pixels",
	icon?.equals(net_wm_icon(X11_ICON_SIZES.map((size) => decode_png(theme[LINUX_ICON_SIZES.indexOf(size)])))),
	true
);

rmSync(scratch, { recursive: true, force: true });
rmSync(entry_dir, { recursive: true, force: true });
finish('linux-icon', 4);
