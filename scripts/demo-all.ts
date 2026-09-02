/**
 * `demo:counter & demo:tictactoe & ... & wait` only works in a POSIX shell, and npm
 * runs scripts through cmd.exe on Windows, so the fan-out lives here instead.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXAMPLES = ['counter', 'tic-tac-toe', 'hacker-news', 'liquid-glass'];

const bin = fileURLToPath(new URL('../bin/gpuix-svelte.js', import.meta.url));
const flags = process.argv.includes('--bun') ? ['--bun'] : [];

const children = EXAMPLES.map((name) =>
	spawn(process.execPath, [bin, ...flags, fileURLToPath(new URL(`../examples/${name}/main.js`, import.meta.url))], {
		stdio: 'inherit'
	})
);

const stop = () => {
	for (const child of children) child.kill();
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
