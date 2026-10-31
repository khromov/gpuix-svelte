// Scaffolds an app with create-gpuix-svelte and installs the packed tarball into it the way
// a consumer would — a tarball, not a symlink, so the bundled svelte, the emitted declarations
// and the bin's own resolution are what gets tested — then typechecks and runs its headless
// test where there is one (or opens the window).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bun = process.argv.includes('--bun');
const open = process.argv.includes('--open');

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'gpuix-svelte-consume-'));
const consumer = join(dir, 'app');

function run(command: string, args: string[], cwd: string) {
	console.log(`\n[consume] ${command} ${args.join(' ')}`);
	// npm and bun can be .cmd shims on Windows; process.execPath is a real path, often with a space.
	const shell = process.platform === 'win32' && command !== process.execPath;
	const { status } = spawnSync(command, args, { cwd, stdio: 'inherit', shell });
	if (status !== 0) {
		console.error(`[consume] failed (${status}); the consumer is left at ${consumer}`);
		process.exit(status ?? 1);
	}
}

// RT_ICON 1 is what Explorer shows, because Bun leaves bun.exe's own icon group pointing at it.
function first_icon_width(exe: Buffer): number {
	const pe = exe.readUInt32LE(0x3c);
	const sections = pe + 24 + exe.readUInt16LE(pe + 20);
	const rsrc = Array.from({ length: exe.readUInt16LE(pe + 6) }, (_, i) => sections + 40 * i).find((at) => exe.toString('latin1', at, at + 5) === '.rsrc');
	if (rsrc === undefined) throw new Error('the .exe has no resource section');
	const rva = exe.readUInt32LE(rsrc + 12);
	const root = exe.readUInt32LE(rsrc + 20);
	const child = (directory: number, id: number) => {
		const named = exe.readUInt16LE(directory + 12);
		for (let i = named; i < named + exe.readUInt16LE(directory + 14); i++) {
			const entry = directory + 16 + 8 * i;
			if (exe.readUInt32LE(entry) === id) return root + (exe.readUInt32LE(entry + 4) & 0x7fffffff);
		}
		throw new Error(`the .exe has no resource ${id}`);
	};
	const languages = child(child(root, 3), 1);
	const data = root + exe.readUInt32LE(languages + 20);
	return exe.readUInt32BE(exe.readUInt32LE(data) - rva + root + 16);
}

function file_properties(exe: string): string {
	const script = '(Get-Item -LiteralPath $env:GPUIX_EXE).VersionInfo | Select-Object ProductName, FileDescription, CompanyName, LegalCopyright, FileVersion | ConvertTo-Json -Compress';
	const { status, stdout, stderr } = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', env: { ...process.env, GPUIX_EXE: exe } });
	if (status !== 0) throw new Error(`could not read ${exe}'s file properties:\n${stderr}`);
	return stdout.trim();
}

run(process.execPath, [join(root, 'scripts/publish.ts'), 'pack', dir], root);
const tarball = readdirSync(dir).find((f) => f.endsWith('.tgz'));
if (!tarball) throw new Error(`npm pack left no tarball in ${dir}`);

// The scaffolder prefers its own template/ over starter/, so refresh it the way prepack would.
run(process.execPath, [join(root, 'packages/create-gpuix-svelte/sync-template.js')], root);
run(process.execPath, [join(root, 'packages/create-gpuix-svelte/index.js'), consumer], dir);
for (const file of ['.gitignore', 'AGENTS.md', 'CLAUDE.md']) {
	if (!existsSync(join(consumer, file))) throw new Error(`create-gpuix-svelte wrote no ${file}`);
}
const manifest = join(consumer, 'package.json');
const json = JSON.parse(readFileSync(manifest, 'utf8'));
json.dependencies['gpuix-svelte'] = `file:${join(dir, tarball)}`;
writeFileSync(manifest, JSON.stringify(json, null, '\t') + '\n');

const pm = bun ? 'bun' : 'npm';
run(pm, bun ? ['install'] : ['install', '--no-audit', '--no-fund'], consumer);

// Node refuses to strip types under node_modules, so the installed package must run as plain JS.
const installed = join(consumer, 'node_modules/gpuix-svelte');
if (existsSync(join(consumer, 'node_modules/tsx'))) throw new Error('tsx was installed into the consumer');
const typescript = (readdirSync(installed, { recursive: true }) as string[]).filter(
	(f) => /\.(c|m)?ts$/.test(f) && !f.endsWith('.d.ts') && !f.startsWith('node_modules')
);
if (typescript.length) throw new Error(`the package ships TypeScript Node cannot run: ${typescript.join(', ')}`);
run(pm, ['run', 'typecheck'], consumer);
// The Linux addon has no TestGpuixRenderer, so the starter's test can only throw there.
if (open || process.platform !== 'linux') run(pm, ['run', open ? 'start' : 'test'], consumer);
// The build needs Bun whichever manager installed the app, and only the Bun pass is sure to have it.
if (bun) {
	run(pm, ['run', 'build'], consumer);
	// The scaffolder named the app after its directory, so the build is dist/app.app (dist/app.exe, dist/app).
	const binary =
		process.platform === 'darwin'
			? join(consumer, 'dist', 'app.app', 'Contents', 'MacOS', 'app')
			: join(consumer, 'dist', process.platform === 'win32' ? 'app.exe' : 'app');
	// Bun's own executable plus a GPUI addon of at least 17 MB; anything smaller lost the addon.
	const bun_path = spawnSync('bun', ['-e', 'console.log(process.execPath)'], { encoding: 'utf8', shell: process.platform === 'win32' }).stdout.trim();
	if (statSync(binary).size < statSync(bun_path).size + 12 * 1024 * 1024) throw new Error(`${binary} is missing the GPUI addon`);
	if (process.platform === 'darwin') {
		const plist = join(consumer, 'dist', 'app.app', 'Contents', 'Info.plist');
		if (!existsSync(join(consumer, 'dist', 'app.app', 'Contents', 'Resources', 'AppIcon.icns'))) throw new Error('the .app has no AppIcon.icns');
		// The directory and the package are both `app`, so only the identifier proves the build read standalone.ts.
		if (!readFileSync(plist, 'utf8').includes('<string>com.example.app</string>')) throw new Error('the .app did not take its identifier from standalone.ts');
	}
	if (process.platform === 'win32') {
		const width = first_icon_width(readFileSync(binary));
		if (width !== 256) throw new Error(`Explorer would show the .exe's icon from a ${width} px image, not its 256 px one`);
		const properties = file_properties(binary);
		const expected = JSON.stringify({ ProductName: 'app', FileDescription: 'app', CompanyName: 'app', LegalCopyright: ' ', FileVersion: '0.0.0.0' });
		if (properties !== expected) throw new Error(`the .exe's file properties are ${properties}, expected ${expected}`);
	}
}

console.log(`\n[consume] ok — the consumer is at ${consumer}`);
