/**
 * winmm.dll is the one Windows audio API with a flat C ABI, so bun:ffi drives it with no
 * shim to compile — WASAPI would mean hand-walking COM vtables. Only ever reached through
 * a dynamic import from a win32 branch, so bun:ffi stays off every other platform's path.
 */

import { dlopen, ptr, type Pointer } from 'bun:ffi';

export type WaveHandle = bigint;

export const WAVEHDR_SIZE = 48;
export const WAVE_MAPPER = 0xffffffff;
export const MMSYSERR_NOERROR = 0;
export const CALLBACK_NULL = 0;

const WHDR_DONE = 0x1;

// Handles are DWORD_PTR-sized; declaring them u64 rather than ptr keeps the waveInOpen
// out-param round-trip free of bun:ffi's pointer coercion rules.
function open_winmm() {
	return dlopen('winmm.dll', {
		waveInGetNumDevs: { args: [], returns: 'u32' },
		waveInOpen: { args: ['ptr', 'u32', 'ptr', 'u64', 'u64', 'u32'], returns: 'u32' },
		waveInPrepareHeader: { args: ['u64', 'ptr', 'u32'], returns: 'u32' },
		waveInUnprepareHeader: { args: ['u64', 'ptr', 'u32'], returns: 'u32' },
		waveInAddBuffer: { args: ['u64', 'ptr', 'u32'], returns: 'u32' },
		waveInStart: { args: ['u64'], returns: 'u32' },
		waveInStop: { args: ['u64'], returns: 'u32' },
		waveInReset: { args: ['u64'], returns: 'u32' },
		waveInClose: { args: ['u64'], returns: 'u32' },
		waveInGetErrorTextA: { args: ['u32', 'ptr', 'u32'], returns: 'u32' },
		waveOutGetNumDevs: { args: [], returns: 'u32' },
		waveOutOpen: { args: ['ptr', 'u32', 'ptr', 'u64', 'u64', 'u32'], returns: 'u32' },
		waveOutPrepareHeader: { args: ['u64', 'ptr', 'u32'], returns: 'u32' },
		waveOutUnprepareHeader: { args: ['u64', 'ptr', 'u32'], returns: 'u32' },
		waveOutWrite: { args: ['u64', 'ptr', 'u32'], returns: 'u32' },
		waveOutReset: { args: ['u64'], returns: 'u32' },
		waveOutClose: { args: ['u64'], returns: 'u32' },
		waveOutGetErrorTextA: { args: ['u32', 'ptr', 'u32'], returns: 'u32' }
	});
}

let lib: ReturnType<typeof open_winmm> | null = null;

export function winmm() {
	if (process.platform !== 'win32') throw new Error(`winmm.dll is Windows-only; this is ${process.platform}`);
	return (lib ??= open_winmm());
}

const message = new Uint8Array(256);

export function mm_error(rc: number, { out = false } = {}): string {
	const s = winmm().symbols;
	const get = out ? s.waveOutGetErrorTextA : s.waveInGetErrorTextA;
	if (get(rc, ptr(message), message.length) !== MMSYSERR_NOERROR) return `MMRESULT ${rc}`;
	return new TextDecoder().decode(message).split('\0')[0] || `MMRESULT ${rc}`;
}

/** WAVEFORMATEX for plain PCM: 18 bytes, `cbSize` 0. */
export function wave_format(sampleRate: number, channels: number, bits = 16): Uint8Array {
	const bytes = new Uint8Array(18);
	const view = new DataView(bytes.buffer);
	view.setUint16(0, 1, true);
	view.setUint16(2, channels, true);
	view.setUint32(4, sampleRate, true);
	view.setUint32(8, (sampleRate * channels * bits) / 8, true);
	view.setUint16(12, (channels * bits) / 8, true);
	view.setUint16(14, bits, true);
	return bytes;
}

/** `waveInOpen`/`waveOutOpen` return the handle through a pointer to eight bytes. */
export function open_handle(call: (out: Uint8Array) => number): { rc: number; handle: WaveHandle } {
	const out = new Uint8Array(8);
	const rc = call(out);
	return { rc, handle: new DataView(out.buffer).getBigUint64(0, true) };
}

/**
 * A ring of WAVEHDRs, laid out x64: lpData@0, dwBufferLength@8, dwBytesRecorded@12,
 * dwUser@16, dwFlags@24, dwLoops@28, lpNext@32, reserved@40. The driver writes into both
 * these bytes and the audio buffer from its own thread, so the caller must hold this object
 * for the whole session — `ptr()` keeps nothing alive on its own.
 */
export class WaveHeaders {
	readonly count: number;
	readonly bytes: Uint8Array;
	/** The ring's own capture buffers; empty when the headers point at caller-owned memory. */
	readonly audio: Uint8Array;
	readonly #view: DataView;
	readonly #size: number;
	readonly #held: (Uint8Array | null)[];

	constructor(count: number, bufferBytes = 0) {
		this.count = count;
		this.#size = bufferBytes;
		this.bytes = new Uint8Array(count * WAVEHDR_SIZE);
		this.audio = new Uint8Array(count * bufferBytes);
		this.#view = new DataView(this.bytes.buffer);
		this.#held = Array.from({ length: count }, () => null);
		if (!bufferBytes) return;
		const base = BigInt(ptr(this.audio));
		for (let i = 0; i < count; i++) {
			this.#view.setBigUint64(i * WAVEHDR_SIZE, base + BigInt(i * bufferBytes), true);
			this.#view.setUint32(i * WAVEHDR_SIZE + 8, bufferBytes, true);
		}
	}

	/** Aims a header at caller-owned memory, held here so the driver's pages stay alive. */
	point(i: number, buffer: Uint8Array) {
		this.#held[i] = buffer;
		this.#view.setBigUint64(i * WAVEHDR_SIZE, BigInt(ptr(buffer)), true);
		this.#view.setUint32(i * WAVEHDR_SIZE + 8, buffer.byteLength, true);
	}

	ptr(i: number): Pointer {
		return ptr(this.bytes, i * WAVEHDR_SIZE);
	}

	done(i: number): boolean {
		return (this.#view.getUint32(i * WAVEHDR_SIZE + 24, true) & WHDR_DONE) !== 0;
	}

	recorded(i: number): number {
		return this.#view.getUint32(i * WAVEHDR_SIZE + 12, true);
	}

	chunk(i: number): Uint8Array {
		return this.audio.subarray(i * this.#size, i * this.#size + this.recorded(i));
	}

	/** Unprepare leaves WHDR_DONE set, and prepare refuses a header that still carries it. */
	clear(i: number) {
		this.#view.setUint32(i * WAVEHDR_SIZE + 12, 0, true);
		this.#view.setUint32(i * WAVEHDR_SIZE + 24, 0, true);
	}
}
