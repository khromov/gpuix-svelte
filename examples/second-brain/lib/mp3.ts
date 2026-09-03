/**
 * A voice memo is captured as 16 kHz mono PCM, which is what Whisper wants and eight times
 * larger than it needs to be once the transcript exists. LAME compiled to WebAssembly keeps
 * that off the ffmpeg dependency and inside the standalone binary.
 */

import { createMp3Encoder } from 'wasm-media-encoders';
import { decode_wav } from './wav.ts';

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
