/**
 * The sidecar half of embedding: a Rust app that owns the window (the
 * `gpuix-svelte-embed` crate) spawns this process with `GPUIX_EMBED=1`, takes the
 * renderer's batches off stdout, answers them through a FIFO, and sends events,
 * props and host events down stdin. Nothing here loads `@gpuix/native`, so a
 * component meant for a slot is plain JS and needs no prebuilt addon.
 *
 * One message per line, `<kind> <id> <json>`, in both directions.
 */

import { openSync, readSync, writeSync } from 'node:fs';
import { mount, unmount, flushSync } from 'svelte';
import { createSubscriber } from 'svelte/reactivity';
import type { EventPayload } from '@gpuix/native';
import renderer, { set_native, set_auto_commit, set_id_base, create_root, commit, dispatch } from './renderer.ts';
import type { AnyComponent, GpuiStyle, NativeSink } from './types.ts';

export interface EmbedOptions {
	/** Styles the root the component mounts into, which fills the host's slot by default. */
	rootStyle?: GpuiStyle;
	/** Sees every native event after the component's handlers ran. */
	onEvent?: (event: EventPayload) => void;
}

export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Pending {
	resolve(value: unknown): void;
	reject(error: Error): void;
}

const env = (name: string): string | undefined => globalThis.process?.env?.[name];

let next_request = 0;
const pending = new Map<number, Pending>();
const listeners = new Map<string, Array<(data: unknown) => void>>();

let props_now: Record<string, unknown> = {};
let notify_props: (() => void) | undefined;
const track_props = createSubscriber((update) => {
	notify_props = update;
	return () => {
		notify_props = undefined;
	};
});

/**
 * What the component's `$props()` read: the object the host's `set_props` last
 * sent, tracked so a new one re-runs whatever read the old.
 */
const props: Record<string, unknown> = new Proxy(
	{},
	{
		get(_, key) {
			track_props();
			return typeof key === 'string' ? props_now[key] : undefined;
		},
		has(_, key) {
			track_props();
			return typeof key === 'string' && key in props_now;
		},
		ownKeys() {
			track_props();
			return Reflect.ownKeys(props_now);
		},
		getOwnPropertyDescriptor(_, key) {
			const found = Object.getOwnPropertyDescriptor(props_now, key);
			return found ? { ...found, configurable: true } : undefined;
		}
	}
);

/** The host app, from inside a component: `import { host } from 'gpuix-svelte/embed'`. */
export const host = {
	props,
	/** Calls a function the host registered with `on_call`; the promise settles with what it returned. */
	call(name: string, ...args: unknown[]): Promise<unknown> {
		const id = ++next_request;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			write_all(1, `call ${id} ${JSON.stringify({ name, args })}\n`);
		});
	},
	/** Subscribes to the host's `emit(name, data)`; returns the unsubscribe. */
	on(name: string, handler: (data: unknown) => void): () => void {
		let handlers = listeners.get(name);
		if (!handlers) listeners.set(name, (handlers = []));
		handlers.push(handler);
		return () => {
			const index = handlers.indexOf(handler);
			if (index !== -1) handlers.splice(index, 1);
		};
	}
};

/**
 * `fs.writeSync` on a pipe can stop short or refuse with EAGAIN once the host is
 * behind by a pipe buffer, and a half-written line would corrupt the next frame.
 */
function write_all(fd: number, text: string) {
	const bytes = Buffer.from(text);
	let offset = 0;
	while (offset < bytes.length) {
		try {
			offset += writeSync(fd, bytes, offset, bytes.length - offset);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
		}
	}
}

/** Reads answers off the FIFO, one blocking line at a time, in request order. */
class Replies {
	#fd: number;
	#buffer = '';
	constructor(path: string) {
		this.#fd = openSync(path, 'r');
	}
	next(): string {
		const chunk = Buffer.alloc(65536);
		for (;;) {
			const newline = this.#buffer.indexOf('\n');
			if (newline !== -1) {
				const line = this.#buffer.slice(0, newline);
				this.#buffer = this.#buffer.slice(newline + 1);
				return line;
			}
			const read = readSync(this.#fd, chunk);
			if (read === 0) throw new Error('[gpuix-svelte] the host closed the reply pipe');
			this.#buffer += chunk.toString('utf8', 0, read);
		}
	}
}

/** Stands in for `GpuixRenderer`: `applyBatch` and the reads `Scroller` makes, over the wire. */
class Wire implements NativeSink {
	#replies: Replies;
	constructor(replies: Replies) {
		this.#replies = replies;
	}
	#request(kind: string, body: string): unknown {
		const id = ++next_request;
		write_all(1, `${kind} ${id} ${body}\n`);
		const line = this.#replies.next();
		const [status, got, json] = split_frame(line);
		if (got !== id) throw new Error(`[gpuix-svelte] the host answered request ${got} where ${id} was expected`);
		if (status === 'err') throw new Error(String(JSON.parse(json)));
		return JSON.parse(json);
	}
	applyBatch(json: string): number[] {
		return this.#request('batch', json) as number[];
	}
	getElementBounds(id: number): Bounds | null {
		return this.#request('query', JSON.stringify({ q: 'bounds', args: [id] })) as Bounds | null;
	}
	// The scroll reads live in the view the host owns; until the host answers them a Scroller gets no thumb.
	getScrollOffset(): number[] | null {
		return null;
	}
	getListScrollTop(): number[] | null {
		return null;
	}
	scrollTo() {}
	scrollToItem() {}
}

function split_frame(line: string): [string, number, string] {
	const first = line.indexOf(' ');
	const second = line.indexOf(' ', first + 1);
	if (first === -1) return [line, NaN, ''];
	if (second === -1) return [line.slice(0, first), Number(line.slice(first + 1)), ''];
	return [line.slice(0, first), Number(line.slice(first + 1, second)), line.slice(second + 1)];
}

function handle_event(event: EventPayload, onEvent?: (event: EventPayload) => void) {
	try {
		dispatch(event);
		// Effects now, so their mutations ship in this frame's batch.
		flushSync();
		commit();
	} catch (error) {
		console.error('[gpuix-svelte] event handler failed:', error);
	}
	onEvent?.(event);
}

/**
 * Mounts the component for the host that spawned this process; the entry's only call.
 * Props arrive from the host before anything renders, and EOF on stdin unmounts and exits.
 */
export function embed(Component: AnyComponent, options: EmbedOptions = {}): void {
	const reply_path = env('GPUIX_EMBED_REPLY');
	if (!env('GPUIX_EMBED') || !reply_path) {
		throw new Error('[gpuix-svelte] embed() runs inside a host app: start this entry through gpuix-svelte-embed, or use render() for a window of its own');
	}
	// stdout is the wire, and a stray log line would be read as a frame.
	console.log = console.info = console.debug = console.error.bind(console);

	set_id_base(Number(env('GPUIX_EMBED_ID_BASE') ?? 0));
	set_native(new Wire(new Replies(reply_path)));
	// No frame loop polls `is_dirty()` here; a timer's mutations drain themselves.
	set_auto_commit(true);

	let component: Record<string, unknown> | null = null;
	let buffer = '';

	const message = (kind: string, id: number, json: string) => {
		switch (kind) {
			case 'init': {
				props_now = JSON.parse(json) as Record<string, unknown>;
				const root = create_root(options.rootStyle);
				const anchor = renderer.createComment('');
				renderer.insert(root, anchor, null);
				component = mount(Component, { renderer, target: root, anchor, props });
				flushSync();
				commit();
				break;
			}
			case 'event':
				handle_event(JSON.parse(json) as EventPayload, options.onEvent);
				break;
			case 'props':
				props_now = JSON.parse(json) as Record<string, unknown>;
				notify_props?.();
				flushSync();
				commit();
				break;
			case 'emit': {
				const { name, data } = JSON.parse(json) as { name: string; data: unknown };
				for (const handler of listeners.get(name)?.slice() ?? []) {
					try {
						handler(data);
					} catch (error) {
						console.error(`[gpuix-svelte] host.on(${JSON.stringify(name)}) handler failed:`, error);
					}
				}
				flushSync();
				commit();
				break;
			}
			case 'reply': {
				const waiting = pending.get(id);
				pending.delete(id);
				const result = JSON.parse(json) as { ok?: unknown; err?: string };
				if (result.err !== undefined) waiting?.reject(new Error(result.err));
				else waiting?.resolve(result.ok);
				break;
			}
			default:
				console.error(`[gpuix-svelte] unknown message from the host: ${kind}`);
		}
	};

	process.stdin.setEncoding('utf8');
	process.stdin.on('data', (chunk: string) => {
		buffer += chunk;
		let newline;
		while ((newline = buffer.indexOf('\n')) !== -1) {
			const line = buffer.slice(0, newline);
			buffer = buffer.slice(newline + 1);
			const [kind, id, json] = split_frame(line);
			try {
				message(kind, id, json);
			} catch (error) {
				console.error('[gpuix-svelte] message failed:', error);
			}
		}
	});
	process.stdin.on('end', () => {
		try {
			if (component) unmount(component);
		} finally {
			process.exit(0);
		}
	});
}
