/**
 * `bun run <script>` runs a body that starts with `node` on real Node (Bun only
 * symlinks node→bun under `--bun`), so the runtime is read off how this launcher
 * was invoked rather than off the script text.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const entry = args.find((arg) => !arg.startsWith('--'));
if (!entry) {
	console.error('usage: node scripts/run-example.js [--bun] examples/<name>/main.js');
	process.exit(2);
}

const bun =
	args.includes('--bun') ||
	process.versions.bun != null ||
	(process.env.npm_config_user_agent ?? '').startsWith('bun/');

const root = new URL('../', import.meta.url);
const conditions = ['--conditions', 'custom-renderer', '--conditions', 'development'];
const target = fileURLToPath(new URL(entry, root));
const argv = bun
	? [...conditions, target]
	: [...conditions, '--import', pathToFileURL(fileURLToPath(new URL('src/register.js', root))).href, target];

const child = spawn(bun ? 'bun' : process.execPath, argv, {
	cwd: fileURLToPath(root),
	stdio: 'inherit',
	// Bun is a shim on PATH rather than a resolvable executable on Windows.
	shell: bun && process.platform === 'win32'
});

const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
