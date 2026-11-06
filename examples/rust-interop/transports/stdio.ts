/**
 * A child process over stdin/stdout, one line per message. The most portable route:
 * any runtime, any language on the far side, and a crash over there cannot take the
 * window down. Replies are matched to requests in order, so a real app would add ids.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Transport, TransportKind } from './types.ts';
import { ARTIFACTS } from './cargo.ts';

export const stdio: TransportKind = {
	id: 'stdio',
	name: 'Child process',
	mechanism: 'spawn() + lines over stdin/stdout',
	push: 'Rust writes a line whenever it likes',
	async create(): Promise<Transport> {
		const child = spawn(ARTIFACTS.stdio, [], { stdio: ['pipe', 'pipe', 'inherit'] });
		const pending: Array<(reply: string) => void> = [];
		let on_event: (event: string) => void = () => {};

		createInterface({ input: child.stdout }).on('line', (line) => {
			if (line.startsWith('= ')) pending.shift()?.(line.slice(2));
			else if (line.startsWith('! ')) on_event(line.slice(2));
		});
		const spawned = new Promise<void>((resolve, reject) => {
			child.once('spawn', () => resolve());
			child.once('error', reject);
		});
		await spawned;

		return {
			send: (msg) =>
				new Promise((resolve) => {
					pending.push(resolve);
					child.stdin.write(msg.replace(/\n/g, ' ') + '\n');
				}),
			subscribe: (cb) => (on_event = cb),
			close: () => child.stdin.end()
		};
	}
};
