import { createInterface } from 'node:readline';

export interface Model {
	counter: number;
	items: string[];
	reading: number;
	uptime_s: number;
}

type Message = { type: 'state'; model: Model } | { type: 'toast'; text: string };

export type Command =
	| { type: 'increment' }
	| { type: 'decrement' }
	| { type: 'add_item'; text: string }
	| { type: 'remove_item'; index: number }
	| { type: 'reset' };

export const host = $state({
	connected: false,
	model: { counter: 0, items: [], reading: 0, uptime_s: 0 } as Model,
	toast: '',
	sent: 0,
	received: 0
});

let toast_timer: ReturnType<typeof setTimeout> | null = null;

export function connect() {
	createInterface({ input: process.stdin }).on('line', (line) => {
		let message: Message;
		try {
			message = JSON.parse(line);
		} catch {
			console.error('[ui] not a message:', line);
			return;
		}
		host.received++;
		host.connected = true;
		if (message.type === 'state') host.model = message.model;
		else if (message.type === 'toast') {
			host.toast = message.text;
			if (toast_timer) clearTimeout(toast_timer);
			toast_timer = setTimeout(() => (host.toast = ''), 2000);
		}
	});
	// The host closing its end means the app is gone, and a view without a model is done.
	process.stdin.on('end', () => process.exit(0));
}

export function send(command: Command) {
	host.sent++;
	process.stdout.write(JSON.stringify(command) + '\n');
}
