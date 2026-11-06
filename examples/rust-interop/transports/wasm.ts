/**
 * The crate as wasm32-unknown-unknown, no wasm-bindgen: bytes are copied into the
 * module's memory and every string Rust produces comes back through an imported
 * `emit`. Sandboxed and the only route that also works in the web build, but wasm has
 * no threads or clock, so "Rust-initiated" events need the host to call in.
 */

import { readFileSync } from 'node:fs';
import type { Transport, TransportKind } from './types.ts';
import { ARTIFACTS } from './cargo.ts';

interface Exports {
	memory: WebAssembly.Memory;
	alloc(len: number): number;
	send(ptr: number, len: number): void;
	tick(n: bigint): void;
}

export const wasm: TransportKind = {
	id: 'wasm',
	name: 'WebAssembly',
	mechanism: 'WebAssembly.instantiate, bytes in linear memory',
	push: 'host timer calls tick(); wasm has no threads',
	async create(): Promise<Transport> {
		const encoder = new TextEncoder();
		const decoder = new TextDecoder();
		let out: string[] = [];
		let on_event: (event: string) => void = () => {};
		// memory.buffer is replaced when the module grows its memory, so read it per call.
		const emit = (ptr: number, len: number) => out.push(decoder.decode(new Uint8Array(exports.memory.buffer, ptr, len)));
		const { instance } = await WebAssembly.instantiate(readFileSync(ARTIFACTS.wasm), { env: { emit } });
		const exports = instance.exports as unknown as Exports;

		let timer: ReturnType<typeof setInterval> | null = null;
		let ticks = 0n;
		return {
			send(msg) {
				const bytes = encoder.encode(msg);
				const ptr = exports.alloc(bytes.length);
				new Uint8Array(exports.memory.buffer, ptr, bytes.length).set(bytes);
				out = [];
				exports.send(ptr, bytes.length);
				return out.join('');
			},
			subscribe(cb) {
				on_event = cb;
				timer = setInterval(() => {
					out = [];
					exports.tick(++ticks);
					for (const event of out) on_event(event);
				}, 1000);
			},
			close() {
				if (timer) clearInterval(timer);
			}
		};
	}
};
