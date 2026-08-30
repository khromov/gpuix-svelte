/**
 * `demo:counter & demo:tictactoe & ... & wait` only works in a POSIX shell, and npm
 * runs scripts through cmd.exe on Windows, so the fan-out lives here instead.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXAMPLES = ['counter', 'tic-tac-toe', 'hacker-news', 'liquid-glass'];

const bun = process.argv.includes('--bun');
const root = new URL('../', import.meta.url);
const conditions = ['--conditions', 'custom-renderer', '--conditions', 'development'];

const children = EXAMPLES.map((name) => {
	const entry = fileURLToPath(new URL(`examples/${name}/main.js`, root));
	const args = bun
		? [...conditions, entry]
		: [...conditions, '--import', pathToFileURL(fileURLToPath(new URL('src/register.js', root))).href, entry];

	return spawn(bun ? 'bun' : process.execPath, args, {
		cwd: fileURLToPath(root),
		stdio: 'inherit',
		// Bun is a shim on PATH rather than a resolvable executable on Windows.
		shell: bun && process.platform === 'win32'
	});
});

const stop = () => {
	for (const child of children) child.kill();
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
