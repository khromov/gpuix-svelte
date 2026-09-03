/**
 * Whisper wants mono float32 at 16 kHz and Bun has no AudioContext, so WAV is
 * decoded here by hand. Chunks come in any order: CoreAudio pads with a `FLLR`
 * chunk before `data`, and a recorder that was killed leaves `data` sized 0.
 */

import type { Failure } from './types.ts';

export interface WavHeader {
	formatTag: number;
	channels: number;
	sampleRate: number;
	bitsPerSample: number;
	blockAlign: number;
	dataOffset: number;
	dataLength: number;
}

export interface DecodedWav {
	samples: Float32Array;
	sampleRate: number;
	duration: number;
	sourceRate: number;
	channels: number;
}

/** `bytes` is the file, or its first 64 KiB together with `fileSize`. */
export function wav_header(bytes: Uint8Array, fileSize = bytes.length): WavHeader {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

	if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a RIFF/WAVE file');

	let fmt: Omit<WavHeader, 'dataOffset' | 'dataLength'> | null = null;
	let data: Pick<WavHeader, 'dataOffset' | 'dataLength'> | null = null;
	let at = 12;

	while (at + 8 <= bytes.length) {
		const id = tag(at);
		let size = view.getUint32(at + 4, true);
		const body = at + 8;

		if (id === 'fmt ' && body + 16 <= bytes.length) {
			let formatTag = view.getUint16(body, true);
			if (formatTag === 0xfffe && size >= 26) formatTag = view.getUint16(body + 24, true);
			fmt = {
				formatTag,
				channels: view.getUint16(body + 2, true),
				sampleRate: view.getUint32(body + 4, true),
				blockAlign: view.getUint16(body + 12, true),
				bitsPerSample: view.getUint16(body + 14, true)
			};
		} else if (id === 'data') {
			if (size === 0 || size === 0xffffffff || body + size > fileSize) size = fileSize - body;
			data = { dataOffset: body, dataLength: size };
		}

		if (fmt && data) break;
		at = body + size + (size & 1);
	}

	if (!fmt) throw new Error('WAV has no fmt chunk');
	if (!data) throw new Error('WAV has no data chunk');
	return { ...fmt, ...data };
}

export const header_duration = (header: WavHeader) =>
	header.sampleRate > 0 ? header.dataLength / (header.sampleRate * header.channels * (header.bitsPerSample >> 3)) : 0;

export function decode_wav(bytes: Uint8Array, { targetRate = 16000 }: { targetRate?: number } = {}): DecodedWav {
	const h = wav_header(bytes);
	const view = new DataView(bytes.buffer, bytes.byteOffset + h.dataOffset, h.dataLength);
	const { formatTag, channels, bitsPerSample } = h;
	const bytesPer = bitsPerSample >> 3;
	const frames = Math.floor(h.dataLength / (bytesPer * channels));

	let read: (o: number) => number;
	if (formatTag === 1 && bitsPerSample === 8) read = (o) => (view.getUint8(o) - 128) / 128;
	else if (formatTag === 1 && bitsPerSample === 16) read = (o) => view.getInt16(o, true) / 32768;
	else if (formatTag === 1 && bitsPerSample === 24)
		read = (o) => (((view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getUint8(o + 2) << 16)) << 8) >> 8) / 8388608;
	else if (formatTag === 1 && bitsPerSample === 32) read = (o) => view.getInt32(o, true) / 2147483648;
	else if (formatTag === 3 && bitsPerSample === 32) read = (o) => view.getFloat32(o, true);
	else if (formatTag === 3 && bitsPerSample === 64) read = (o) => view.getFloat64(o, true);
	else {
		const err: Failure = new Error(`unsupported WAV: format ${formatTag}, ${bitsPerSample}-bit`);
		err.code = 'EWAVFORMAT';
		throw err;
	}

	const mono = new Float32Array(frames);
	const stride = bytesPer * channels;
	for (let i = 0; i < frames; i++) {
		let sum = 0;
		for (let c = 0; c < channels; c++) sum += read(i * stride + c * bytesPer);
		mono[i] = sum / channels;
	}

	const samples = resample(mono, h.sampleRate, targetRate);
	return { samples, sampleRate: targetRate, duration: samples.length / targetRate, sourceRate: h.sampleRate, channels };
}

/**
 * Box-averaging on the way down is a crude anti-alias filter, but the 44.1k → 16k
 * case is what matters and speech survives it fine.
 */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
	if (fromRate === toRate || samples.length === 0) return samples;
	const ratio = fromRate / toRate;
	const length = Math.max(1, Math.round(samples.length / ratio));
	const out = new Float32Array(length);

	if (ratio > 1) {
		for (let i = 0; i < length; i++) {
			const start = i * ratio;
			const end = Math.min(samples.length, start + ratio);
			let sum = 0;
			let n = 0;
			for (let j = Math.floor(start); j < end; j++) {
				sum += samples[j];
				n++;
			}
			out[i] = n > 0 ? sum / n : 0;
		}
	} else {
		for (let i = 0; i < length; i++) {
			const pos = i * ratio;
			const j = Math.floor(pos);
			const a = samples[Math.min(j, samples.length - 1)];
			const b = samples[Math.min(j + 1, samples.length - 1)];
			out[i] = a + (b - a) * (pos - j);
		}
	}
	return out;
}

export const WAV_HEADER_SIZE = 44;

/**
 * Builds the classic 44-byte 16-bit PCM header — the counterpart to `wav_header`, which
 * parses one. A recorder streaming to disk writes it with `dataLength` 0 and rewrites it
 * once the total is known.
 */
export function build_wav_header(dataLength: number, sampleRate = 16000, channels = 1): Uint8Array {
	const bytes = new Uint8Array(WAV_HEADER_SIZE);
	const view = new DataView(bytes.buffer);
	const str = (at: number, s: string) => {
		for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i);
	};

	str(0, 'RIFF');
	view.setUint32(4, 36 + dataLength, true);
	str(8, 'WAVE');
	str(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channels * 2, true);
	view.setUint16(32, channels * 2, true);
	view.setUint16(34, 16, true);
	str(36, 'data');
	view.setUint32(40, dataLength, true);
	return bytes;
}

/** Interleaved 16-bit little-endian PCM, clamped to the representable range. */
export function pcm16_from_float(samples: Float32Array): Uint8Array {
	const bytes = new Uint8Array(samples.length * 2);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(i * 2, Math.round(s * 32767), true);
	}
	return bytes;
}

/** 16-bit PCM with the classic 44-byte header; `samples` are interleaved when `channels > 1`. */
export function encode_wav(samples: Float32Array, sampleRate = 16000, channels = 1): Uint8Array {
	const pcm = pcm16_from_float(samples);
	const bytes = new Uint8Array(WAV_HEADER_SIZE + pcm.length);
	bytes.set(build_wav_header(pcm.length, sampleRate, channels));
	bytes.set(pcm, WAV_HEADER_SIZE);
	return bytes;
}

/** Header only, from the first 64 KiB; 0 when the file is not a WAV. */
export async function wav_duration(path: string): Promise<number> {
	try {
		const file = Bun.file(path);
		const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
		return header_duration(wav_header(head, file.size));
	} catch {
		return 0;
	}
}

/** `ok` means it is already the 16 kHz mono PCM the worker wants, so no sidecar is needed. */
export function wav_info(bytes: Uint8Array): { ok: boolean; duration: number; sampleRate?: number; channels?: number; bits?: number } {
	try {
		const h = wav_header(bytes);
		return {
			ok: h.formatTag === 1 && h.bitsPerSample === 16 && h.channels === 1 && h.sampleRate === 16000,
			duration: header_duration(h),
			sampleRate: h.sampleRate,
			channels: h.channels,
			bits: h.bitsPerSample
		};
	} catch {
		return { ok: false, duration: 0 };
	}
}
