/**
 * Playback over the same winmm handle the recorder uses, decoding in-process with the
 * codecs already here rather than shelling out — Windows ships nothing that plays an MP3
 * from a command line without a window.
 */

import { extname } from 'node:path';
import { decode_mp3 } from './mp3.ts';
import { decode_wav, pcm16_from_float, wav_header } from './wav.ts';
import { CALLBACK_NULL, MMSYSERR_NOERROR, open_handle, WAVE_MAPPER, WAVEHDR_SIZE, WaveHeaders, wave_format, mm_error, winmm } from './winmm.ts';

const POLL_MS = 50;

interface Pcm {
	bytes: Uint8Array;
	rate: number;
	channels: number;
}

async function to_pcm16(path: string, bytes: Uint8Array): Promise<Pcm> {
	if (extname(path).toLowerCase() === '.mp3') {
		return { bytes: pcm16_from_float(await decode_mp3(bytes)), rate: 16000, channels: 1 };
	}
	const header = wav_header(bytes);
	// Plain 16-bit PCM goes to the driver untouched; decode_wav would downmix an imported
	// 44.1 kHz stereo file to 16 kHz mono, which afplay never does.
	if (header.formatTag === 1 && header.bitsPerSample === 16) {
		return {
			bytes: bytes.subarray(header.dataOffset, header.dataOffset + header.dataLength),
			rate: header.sampleRate,
			channels: header.channels
		};
	}
	const decoded = decode_wav(bytes);
	return { bytes: pcm16_from_float(decoded.samples), rate: decoded.sampleRate, channels: 1 };
}

/**
 * Returns synchronously so the caller can claim the slot before the decode resolves; the
 * whole clip goes out as one WAVEHDR, which the driver reads at its own pace.
 */
export function play_windows(path: string): { ended: Promise<number>; stop: () => void } {
	let stopped = false;
	let halt: (() => void) | null = null;

	const ended = (async () => {
		const s = winmm().symbols;
		const bytes = await Bun.file(path).bytes();
		const pcm = await to_pcm16(path, bytes);
		if (stopped) return 0;

		const opened = open_handle((out) => s.waveOutOpen(out, WAVE_MAPPER, wave_format(pcm.rate, pcm.channels), 0n, 0n, CALLBACK_NULL));
		if (opened.rc !== MMSYSERR_NOERROR) throw new Error(`could not open the speakers: ${mm_error(opened.rc, { out: true })}`);
		const handle = opened.handle;

		// One header, sized to the clip, borrowing WaveHeaders only for its layout.
		const header = new WaveHeaders(1, 0);
		header.point(0, pcm.bytes);

		let closed = false;
		const close = () => {
			if (closed) return;
			closed = true;
			s.waveOutReset(handle);
			s.waveOutUnprepareHeader(handle, header.ptr(0), WAVEHDR_SIZE);
			s.waveOutClose(handle);
		};

		try {
			const rc = s.waveOutPrepareHeader(handle, header.ptr(0), WAVEHDR_SIZE) || s.waveOutWrite(handle, header.ptr(0), WAVEHDR_SIZE);
			if (rc !== MMSYSERR_NOERROR) throw new Error(`could not play the audio: ${mm_error(rc, { out: true })}`);
		} catch (err) {
			close();
			throw err;
		}

		return await new Promise<number>((resolve) => {
			const finish = (code: number) => {
				clearInterval(timer);
				halt = null;
				close();
				resolve(code);
			};
			// The interval, not the header, is what keeps this alive — so it has to go on both
			// the natural end and an explicit stop.
			const timer = setInterval(() => {
				if (stopped) finish(0);
				else if (header.done(0)) finish(0);
			}, POLL_MS);
			halt = () => finish(0);
		});
	})();

	return {
		ended,
		stop() {
			stopped = true;
			halt?.();
		}
	};
}
