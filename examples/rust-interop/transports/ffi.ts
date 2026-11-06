/**
 * The cdylib over `bun:ffi` or `node:ffi`. Calls are synchronous and cheap, but strings
 * cross as C pointers the host has to free, and only Bun's threadsafe JSCallback lets a
 * Rust thread call JS: node:ffi's registerCallback may only run on the thread that made
 * it, so on Node Rust queues events and JS polls them (node needs --experimental-ffi).
 */

import type { Transport, TransportKind } from './types.ts';
import { ARTIFACTS } from './cargo.ts';

const POLL_MS = 100;

async function on_bun(): Promise<Transport> {
	const { dlopen, JSCallback, CString } = await import('bun:ffi');
	type Pointer = import('bun:ffi').Pointer;
	const lib = dlopen(ARTIFACTS.ffi, {
		hello_send: { args: ['cstring'], returns: 'ptr' },
		hello_free: { args: ['ptr'], returns: 'void' },
		hello_start: { args: [], returns: 'void' },
		hello_stop: { args: [], returns: 'void' },
		hello_set_callback: { args: ['ptr'], returns: 'void' }
	});
	const take = (p: Pointer | bigint | null) => {
		if (p === null || p === 0n) return null;
		const ptr = Number(p) as Pointer;
		const s = new CString(ptr).toString();
		lib.symbols.hello_free(ptr);
		return s;
	};
	let callback: InstanceType<typeof JSCallback> | null = null;
	return {
		send: (msg) => take(lib.symbols.hello_send(Buffer.from(msg + '\0'))) ?? '',
		subscribe(cb) {
			callback = new JSCallback((p: Pointer | null) => cb(take(p) ?? ''), { args: ['ptr'], returns: 'void', threadsafe: true });
			lib.symbols.hello_set_callback(callback.ptr);
			lib.symbols.hello_start();
		},
		close() {
			lib.symbols.hello_stop();
			lib.symbols.hello_set_callback(null);
			callback?.close();
			lib.close();
		}
	};
}

async function on_node(): Promise<Transport> {
	const { dlopen, toString } = await import('node:ffi').catch(() => {
		throw new Error('node:ffi needs Node >= 26.1 started with --experimental-ffi');
	});
	const { functions: f } = dlopen(ARTIFACTS.ffi, {
		hello_send: { arguments: ['string'], return: 'pointer' },
		hello_free: { arguments: ['pointer'], return: 'void' },
		hello_start: { arguments: [], return: 'void' },
		hello_stop: { arguments: [], return: 'void' },
		hello_poll: { arguments: [], return: 'pointer' }
	});
	const take = (p: bigint) => {
		if (p === 0n) return null;
		const s = toString(p);
		f.hello_free(p);
		return s;
	};
	let timer: ReturnType<typeof setInterval> | null = null;
	return {
		send: (msg) => take(f.hello_send(msg)) ?? '',
		subscribe(cb) {
			f.hello_start();
			timer = setInterval(() => {
				for (let event = take(f.hello_poll()); event !== null; event = take(f.hello_poll())) cb(event);
			}, POLL_MS);
		},
		close() {
			f.hello_stop();
			if (timer) clearInterval(timer);
		}
	};
}

export const ffi: TransportKind = {
	id: 'ffi',
	name: 'C ABI (FFI)',
	mechanism: process.versions.bun ? 'bun:ffi dlopen, C strings' : 'node:ffi dlopen, C strings',
	push: process.versions.bun ? 'threadsafe JSCallback from a Rust thread' : `JS polls a queue every ${POLL_MS} ms`,
	create: () => (process.versions.bun ? on_bun() : on_node())
};
