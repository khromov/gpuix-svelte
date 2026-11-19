import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TXIKI_REVISION = 'c13adc667e3e7761ff4d0c12a6ea34efceb4e1ea';
const root = dirname(fileURLToPath(import.meta.resolve('gpuix-svelte/package.json')));

export function txiki_command(command: string, args: string[], cwd = root, env: NodeJS.ProcessEnv = {}) {
	const result = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
	if (result.error || result.status !== 0) throw new Error(`[txiki] ${command} failed: ${result.error?.message ?? result.status}`);
}

export function prepare_txiki(platform: 'android' | 'ios', work: string): string {
	const checkout = process.env.TXIKI_SOURCE ?? join(root, '.generated/txiki/checkout');
	if (!existsSync(join(checkout, '.git'))) {
		if (existsSync(checkout)) throw new Error(`[txiki] refusing unmarked checkout ${checkout}`);
		mkdirSync(dirname(checkout), { recursive: true });
		txiki_command('git', ['clone', '--no-checkout', 'https://github.com/saghul/txiki.js.git', checkout]);
		txiki_command('git', ['checkout', '--detach', TXIKI_REVISION], checkout);
		txiki_command('git', ['submodule', 'update', '--init', '--recursive', '--depth', '1'], checkout);
	}
	const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' });
	const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--ignore-submodules=all'], { cwd: checkout, encoding: 'utf8' });
	const submodules = spawnSync('git', ['submodule', 'status'], { cwd: checkout, encoding: 'utf8' });
	const nested = spawnSync('git', ['submodule', 'status', '--recursive'], { cwd: checkout, encoding: 'utf8' });
	const substatus = spawnSync('git', ['submodule', 'foreach', '--quiet', '--recursive', 'git status --porcelain --untracked-files=all --ignore-submodules=all'], { cwd: checkout, encoding: 'utf8' });
	if (revision.status !== 0 || revision.stdout.trim() !== TXIKI_REVISION || status.status !== 0 || status.stdout.trim() || submodules.status !== 0 || nested.status !== 0 || substatus.status !== 0 || substatus.stdout.trim() || submodules.stdout.split('\n').some(line => line && !line.startsWith(' ')) || nested.stdout.split('\n').some(line => line.startsWith('+') || line.startsWith('U'))) {
		throw new Error(`[txiki] TXIKI_SOURCE and its submodules must be unmodified checkouts of ${TXIKI_REVISION}`);
	}
	const source = join(work, `source-${platform}`);
	const marker = join(source, '.gpuix-txiki');
	const patch = readFileSync(join(root, `patches/txiki/${platform === 'ios' ? 'ios' : 'android-libuv'}.patch`), 'utf8');
	const stamp = `2\n${TXIKI_REVISION}\n${createHash('sha256').update(patch).digest('hex')}\n`;
	if (existsSync(source) && !existsSync(marker)) throw new Error(`[txiki] refusing unmarked source ${source}`);
	if (!existsSync(marker) || readFileSync(marker, 'utf8') !== stamp) {
		mkdirSync(work, { recursive: true });
		const temporary = mkdtempSync(join(work, '.txiki-source-'));
		try {
			const staged = join(temporary, 'source');
			cpSync(checkout, staged, { recursive: true, filter: path => !['.git', 'build', 'build-ios', 'build-android'].includes(path.split(/[\\/]/).at(-1)!) });
			const env = { ...process.env, GIT_CEILING_DIRECTORIES: staged };
			const apply = (cwd: string, contents: string, name: string) => {
				const result = spawnSync('git', ['apply', '-'], { cwd, input: contents, encoding: 'utf8', env });
				if (result.status !== 0) throw new Error(`[txiki] ${name} patch failed: ${result.stderr}`);
			};
			apply(staged, patch, platform);
			// txiki's own CMake patches must apply before a cached build can reuse its configuration.
			for (const name of readdirSync(join(staged, 'patches')).sort()) {
				const dep = name.startsWith('mbedtls-') ? 'mbedtls' : name.startsWith('lws-') ? 'libwebsockets' : null;
				if (dep && name.endsWith('.patch')) apply(join(staged, 'deps', dep), readFileSync(join(staged, 'patches', name), 'utf8'), name);
			}
			writeFileSync(join(staged, '.gpuix-txiki'), stamp);
			rmSync(source, { recursive: true, force: true });
			renameSync(staged, source);
		} finally { rmSync(temporary, { recursive: true, force: true }); }
	}
	return source;
}

export function build_txiki_ios(source: string, work: string, simulator: boolean, architecture: string, deployment: string): string {
	const build = join(work, `build-${simulator ? 'sim' : 'device'}-${architecture}`);
	txiki_command('cmake', ['-S', source, '-B', build, '-G', 'Ninja', '-DCMAKE_SYSTEM_NAME=iOS', `-DCMAKE_OSX_SYSROOT=${simulator ? 'iphonesimulator' : 'iphoneos'}`, `-DCMAKE_OSX_ARCHITECTURES=${architecture}`, `-DCMAKE_OSX_DEPLOYMENT_TARGET=${deployment}`, '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_WITH_MIMALLOC=OFF', '-DBUILD_WITH_FFI=OFF', '-DBUILD_WITH_WASM=OFF', '-DBUILD_WITH_SQLITE=OFF']);
	txiki_command('cmake', ['--build', build, '--target', 'tjs', '-j', '8']);
	const archives: string[] = [];
	function walk(path: string) {
		for (const item of readdirSync(path, { withFileTypes: true })) {
			const child = join(path, item.name);
			if (item.isDirectory()) walk(child);
			else if (item.name.endsWith('.a')) archives.push(child);
		}
	}
	walk(build);
	const library = join(work, `libtxiki-${simulator ? 'sim' : 'device'}-${architecture}.a`);
	txiki_command('xcrun', ['libtool', '-static', '-o', library, ...archives]);
	return library;
}
