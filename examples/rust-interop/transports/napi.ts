/**
 * A Node-API addon built with napi-rs, the route @gpuix/native itself takes: typed
 * arguments, JS strings in and out, and a ThreadsafeFunction that a Rust thread calls to
 * run JS on the event loop. Node and Bun both load it with a plain require().
 */

import { createRequire } from 'node:module';
import type { Transport, TransportKind } from './types.ts';
import { ARTIFACTS } from './cargo.ts';

interface Addon {
	send(msg: string): string;
	subscribe(callback: (event: string) => void): void;
	unsubscribe(): void;
}

export const napi: TransportKind = {
	id: 'napi',
	name: 'Node-API addon',
	mechanism: 'napi-rs cdylib, require()d as .node',
	push: 'ThreadsafeFunction from a Rust thread',
	async create(): Promise<Transport> {
		const addon = createRequire(import.meta.url)(ARTIFACTS.napi) as Addon;
		return {
			send: (msg) => addon.send(msg),
			subscribe: (cb) => addon.subscribe(cb),
			close: () => addon.unsubscribe()
		};
	}
};
