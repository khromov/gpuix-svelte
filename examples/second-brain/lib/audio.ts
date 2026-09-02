import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { track } from './lifecycle.ts';
import type { Failure } from './types.ts';
import { decode_wav, header_duration, wav_header } from './wav.ts';

export const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.aiff', '.aif', '.caf', '.webm', '.mp4', '.mov'];

export interface LoadedAudio {
	samples: Float32Array;
	sampleRate: 16000;
	duration: number;
	via: 'wav' | 'ffmpeg';
}

let ffmpeg: string | null | undefined;

/** A Finder-launched app gets a PATH without Homebrew, hence the fixed candidates. */
export function ffmpeg_path(): string | null {
	if (ffmpeg !== undefined) return ffmpeg;
	const candidates = [process.env.GPUIX_BRAIN_FFMPEG, Bun.which('ffmpeg'), '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
	ffmpeg = candidates.find((p) => p && existsSync(p)) ?? null;
	return ffmpeg;
}

export function ffmpeg_available(): { ok: boolean; reason?: string } {
	return ffmpeg_path() ? { ok: true } : { ok: false, reason: 'ffmpeg not on PATH — WAV import only (brew install ffmpeg)' };
}

export async function load_audio(path: string): Promise<LoadedAudio> {
	if (extname(path).toLowerCase() === '.wav') {
		try {
			const { samples, duration } = decode_wav(await Bun.file(path).bytes());
			return { samples, sampleRate: 16000, duration, via: 'wav' };
		} catch (err) {
			if ((err as Failure).code !== 'EWAVFORMAT' || !ffmpeg_path()) throw err;
		}
	}
	return decode_with_ffmpeg(path);
}

async function decode_with_ffmpeg(path: string): Promise<LoadedAudio> {
	const bin = ffmpeg_path();
	if (!bin) {
		const err: Failure = new Error('ffmpeg not found — install it (brew install ffmpeg) or import WAV files');
		err.code = 'ENOFFMPEG';
		throw err;
	}

	const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', path, '-vn', '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '1', '-ar', '16000', '-'];
	const proc = track(Bun.spawn([bin, ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }));
	const [buf, stderr, code] = await Promise.all([
		new Response(proc.stdout).arrayBuffer(),
		new Response(proc.stderr).text(),
		proc.exited
	]);
	if (code !== 0) throw new Error(`ffmpeg: ${stderr.trim().split('\n').pop() || `exit ${code}`}`);

	const samples = new Float32Array(buf, 0, buf.byteLength >> 2);
	return { samples, sampleRate: 16000, duration: samples.length / 16000, via: 'ffmpeg' };
}

/** Converts anything ffmpeg reads into the 16 kHz mono 16-bit WAV the worker wants. */
export async function convert_to_wav(src: string, dest: string) {
	const bin = ffmpeg_path();
	if (!bin) {
		const err: Failure = new Error(`ffmpeg not found — install it (brew install ffmpeg) to import ${extname(src) || 'this'} files`);
		err.code = 'ENOFFMPEG';
		throw err;
	}

	const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', '-f', 'wav', dest];
	const proc = track(Bun.spawn([bin, ...args], { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' }));
	const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
	if (code !== 0) throw new Error(`ffmpeg: ${stderr.trim().split('\n').pop() || `exit ${code}`}`);
}

/** Header only; 0 when the file is not a WAV. */
export async function wav_duration(path: string): Promise<number> {
	try {
		const file = Bun.file(path);
		const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
		return header_duration(wav_header(head, file.size));
	} catch {
		return 0;
	}
}

export async function wav_is_pcm16_mono_16k(path: string): Promise<{ ok: boolean; sampleRate?: number; channels?: number; bits?: number }> {
	try {
		const file = Bun.file(path);
		const h = wav_header(new Uint8Array(await file.slice(0, 65536).arrayBuffer()), file.size);
		return { ok: h.formatTag === 1 && h.bitsPerSample === 16 && h.channels === 1 && h.sampleRate === 16000, sampleRate: h.sampleRate, channels: h.channels, bits: h.bitsPerSample };
	} catch {
		return { ok: false };
	}
}
