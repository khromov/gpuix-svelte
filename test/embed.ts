/**
 * The sidecar half of embedding, driven by a host written here instead of in Rust:
 * batches arrive on stdout and are answered through the FIFO (a named pipe on
 * Windows), props re-render
 * through `$props()`, a host event reaches `host.on`, `host.call` round-trips a
 * reply and a rejection, a bounds query is answered synchronously, a click
 * dispatches by id, and EOF on stdin exits cleanly.
 */

import { execFileSync, spawn } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, finish } from 'gpuix-svelte/test';
import type { Mutation } from 'gpuix-svelte';

const ID_BASE = 2 ** 32;
const windows = process.platform === 'win32';

interface ReplyPipe {
	path: string;
	write(line: string): void;
	close(): void;
}

function open_fifo(): ReplyPipe {
	const dir = mkdtempSync(join(tmpdir(), 'gpuix-svelte-embed-'));
	const path = join(dir, 'reply.fifo');
	execFileSync('mkfifo', [path]);
	// Read+write, so opening never waits for the sidecar, which opens its end read-only.
	const fd = openSync(path, 'r+');
	return {
		path,
		write: (line) => writeSync(fd, line),
		close() {
			closeSync(fd);
			rmSync(dir, { recursive: true, force: true });
		}
	};
}

async function open_named_pipe(): Promise<ReplyPipe> {
	const path = `\\\\.\\pipe\\gpuix-svelte-embed-test-${process.pid}`;
	let socket: Socket | undefined;
	// The sidecar can write its first batch to stdout before this side sees the connection.
	const queued: string[] = [];
	const server = createServer((connection) => {
		socket = connection;
		for (const line of queued.splice(0)) socket.write(line);
	});
	await new Promise<void>((resolve) => server.listen(path, resolve));
	return {
		path,
		write: (line) => (socket ? socket.write(line) : queued.push(line)),
		close() {
			socket?.destroy();
			server.close();
		}
	};
}

const reply = windows ? await open_named_pipe() : open_fifo();

const child = spawn(process.execPath, ['bin/gpuix-svelte.js', 'test/embed/entry.ts'], {
	stdio: ['pipe', 'pipe', 'inherit'],
	env: { ...process.env, GPUIX_EMBED: '1', GPUIX_EMBED_REPLY: reply.path, GPUIX_EMBED_ID_BASE: String(ID_BASE) }
});

const mutations: Mutation[] = [];
const calls: Array<{ id: number; name: string; args: unknown[] }> = [];
const queries: Array<{ id: number; q: string; args: unknown[] }> = [];
let batches = 0;

const send = (kind: string, id: number, body: unknown) => child.stdin.write(`${kind} ${id} ${JSON.stringify(body)}\n`);
const answer = (status: 'ok' | 'err', id: number, body: unknown) => reply.write(`${status} ${id} ${JSON.stringify(body)}\n`);

let buffer = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk: string) => {
	buffer += chunk;
	let newline;
	while ((newline = buffer.indexOf('\n')) !== -1) {
		const line = buffer.slice(0, newline);
		buffer = buffer.slice(newline + 1);
		const first = line.indexOf(' ');
		const second = line.indexOf(' ', first + 1);
		const kind = line.slice(0, first);
		const id = Number(line.slice(first + 1, second));
		const body = JSON.parse(line.slice(second + 1));
		if (kind === 'batch') {
			batches++;
			mutations.push(...(body as Mutation[]));
			answer('ok', id, []);
		} else if (kind === 'query') {
			queries.push({ id, ...(body as { q: string; args: unknown[] }) });
			answer('ok', id, body.q === 'bounds' ? { x: 1, y: 2, width: 30, height: 40 } : null);
		} else if (kind === 'call') {
			const { name, args } = body as { name: string; args: unknown[] };
			calls.push({ id, name, args });
			if (name === 'report') send('reply', id, { ok: `thanks ${args[0]}` });
			else send('reply', id, { err: `no host function named ${name}` });
		} else {
			console.error('unexpected message from the sidecar:', line);
		}
	}
});

const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));

async function wait_for(label: string, predicate: () => boolean, timeout = 20_000) {
	const deadline = Date.now() + timeout;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

const text_set = (text: string) => mutations.some((m) => m[0] === 'setText' && m[2] === text);

try {
	send('init', 0, { label: 'hello' });
	await wait_for('the first paint', () => text_set('hello'));
	check('the tree has a root', mutations.some((m) => m[0] === 'setRoot'));
	check(
		'every id is above the base the host chose',
		mutations.filter((m) => m[0] === 'createElement').every((m) => (m[1] as number) >= ID_BASE)
	);
	check('a first batch rendered the initial props', text_set('clicked 0'));

	const before = batches;
	send('props', 0, { label: 'bye' });
	await wait_for('the props re-render', () => text_set('bye'));
	check('new props commit as a batch of their own', batches > before);

	send('emit', 0, { name: 'tick', data: { n: 7 } });
	await wait_for('the host call reply', () => text_set('thanks: thanks 7'));
	check('host.call sends the name and arguments', calls.find((c) => c.name === 'report')?.args, [7]);
	await wait_for('the rejected call', () => text_set('refused: no host function named missing'));
	await wait_for('the bounds query', () => text_set('bounds: 30x40'));
	check('the bounds query named the element', queries[0]?.q === 'bounds' && (queries[0].args[0] as number) >= ID_BASE);

	const target = mutations.find((m) => m[0] === 'setEventListener' && m[2] === 'click');
	check('the click handler was registered', target != null);
	send('event', 0, { elementId: target![1], eventType: 'click', x: 5, y: 5, button: 0, clickCount: 1 });
	await wait_for('the click', () => text_set('clicked 1'));

	child.stdin.end();
	check('EOF on stdin exits cleanly', await exited, 0);
} finally {
	child.kill();
	reply.close();
}

finish('embed', 8);
