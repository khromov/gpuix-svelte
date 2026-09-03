/**
 * MP3 is the one compressed format Substrate handles, in both directions and entirely
 * in-process: LAME and mpg123 as WebAssembly, so there is no ffmpeg to install and both
 * inline into the standalone binary.
 */

import { MPEGDecoder } from 'mpg123-decoder';
import { createMp3Encoder } from 'wasm-media-encoders';
import { decode_wav, resample } from './wav.ts';

export async function encode_mp3(wav: Uint8Array, { bitrate = 32 }: { bitrate?: 8 | 16 | 24 | 32 | 40 | 48 | 64 } = {}): Promise<Uint8Array> {
	const { samples, sampleRate } = decode_wav(wav);
	const encoder = await createMp3Encoder();
	encoder.configure({ channels: 1, sampleRate, bitrate });

	// slice() is load-bearing: both calls hand back a view into the wasm heap that the next
	// one overwrites, and the corruption survives into a file ffprobe still parses.
	const parts = [encoder.encode([samples]).slice(), encoder.finalize().slice()];

	const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/** Mono 16 kHz, matching what `decode_wav` hands back. */
export async function decode_mp3(bytes: Uint8Array): Promise<Float32Array> {
	const decoder = new MPEGDecoder();
	await decoder.ready;
	try {
		const { channelData, samplesDecoded, sampleRate } = await decoder.decode(bytes);
		if (!samplesDecoded) throw Object.assign(new Error('no audio data in the file'), { transient: false });
		const mono = new Float32Array(samplesDecoded);
		for (let i = 0; i < samplesDecoded; i++) {
			let sum = 0;
			for (const channel of channelData) sum += channel[i];
			mono[i] = sum / channelData.length;
		}
		return resample(mono, sampleRate, 16000);
	} finally {
		// The decoder's ~24 MB of wasm heap comes back only through free().
		decoder.free();
	}
}
