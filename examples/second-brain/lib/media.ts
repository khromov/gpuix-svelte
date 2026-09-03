import { unlinkSync } from 'node:fs';
import { extname, join } from 'node:path';
import { convert_to_wav, ffmpeg_path, wav_info } from './audio.ts';
import { warn } from './log.ts';
import type { DataDirs } from './paths.ts';
import type { Failure } from './types.ts';
import { decode_wav, encode_wav } from './wav.ts';

export interface Encoded {
	bytes: Uint8Array;
	ext: string;
}

export interface ImportedImage extends Encoded {
	width: number;
	height: number;
	format: string;
	display: Encoded | null;
}

export interface Thumb extends Encoded {
	width: number;
	height: number;
}

export interface Segment {
	start: number;
	end: number;
	text: string;
}

export type Media = ReturnType<typeof create_media>;

const EXT_BY_FORMAT: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', bmp: 'bmp', tiff: 'tiff', heic: 'heic', avif: 'avif' };

// GPUI's image crate has no AVIF or HEIC decoder; Bun.Image (ImageIO) does, so those
// get a WebP copy for the window while the original stays on disk.
const GPUI_CAN_PAINT = new Set(['jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff']);
export const needs_display_copy = (format: string | null | undefined) => !!format && !GPUI_CAN_PAINT.has(format);

export function create_media(dirs: DataDirs) {
	return {
		has_ffmpeg: ffmpeg_path() !== null,

		/** `src` is a path or PNG bytes. */
		async import_image(src: string | Uint8Array, { ext }: { ext?: string } = {}): Promise<ImportedImage> {
			const bytes = typeof src === 'string' ? await Bun.file(src).bytes() : src;
			const { width, height, format } = await new Bun.Image(bytes).metadata();
			const extension = EXT_BY_FORMAT[format] ?? ext ?? (typeof src === 'string' ? extname(src).slice(1) : 'png') ?? 'png';
			const display = needs_display_copy(format) ? await this.make_display(bytes) : null;
			return { bytes, ext: extension || 'png', width, height, format, display };
		},

		/** A WebP the window can paint, at most 2048 px on a side. */
		async make_display(bytes: Uint8Array): Promise<Encoded> {
			const out = await new Bun.Image(bytes).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).bytes();
			return { bytes: out, ext: 'webp' };
		},

		/** WebP unless the platform's encoder refuses, then PNG. */
		async make_thumb(bytes: Uint8Array, { size = 480 }: { size?: number } = {}): Promise<Thumb> {
			const fit = { fit: 'inside', withoutEnlargement: true } as const;
			let out: Uint8Array;
			let ext = 'webp';
			try {
				out = await new Bun.Image(bytes).resize(size, size, fit).webp({ quality: 80 }).bytes();
			} catch (err) {
				warn('webp thumbnail failed, using png:', (err as Error).message);
				out = await new Bun.Image(bytes).resize(size, size, fit).png().bytes();
				ext = 'png';
			}
			const { width, height } = await new Bun.Image(out).metadata();
			return { bytes: out, ext, width, height };
		},

		/**
		 * Reads the file in (and unlinks it when it was ours to move); the 16 kHz PCM
		 * sidecar is made later by the pipeline, since ffmpeg can take a while.
		 */
		async import_audio_file(src: string, { move = false }: { move?: boolean } = {}): Promise<Encoded> {
			const bytes = await Bun.file(src).bytes();
			if (move) {
				try {
					unlinkSync(src);
				} catch (err) {
					warn(`could not remove ${src}:`, (err as Error).message);
				}
			}
			return { bytes, ext: extname(src).slice(1).toLowerCase() || 'wav' };
		},

		/**
		 * `null` bytes mean the original already *is* 16 kHz mono PCM and needs no sidecar.
		 * ffmpeg is a subprocess, so the non-WAV path goes through scratch files in tmp/.
		 */
		async prepare_pcm(original: Uint8Array, ext: string, id: number): Promise<{ pcm: Uint8Array | null; duration: number }> {
			const extension = String(ext).toLowerCase();
			// Left null when the original already is what the worker wants, so it needs no sidecar.
			let pcm: Uint8Array | null = null;
			if (extension !== 'wav') {
				pcm = await this.transcode_pcm(original, extension, id);
			} else if (!wav_info(original).ok) {
				try {
					pcm = encode_wav(decode_wav(original).samples, 16000);
				} catch (err) {
					if ((err as Failure).code !== 'EWAVFORMAT') throw err;
					pcm = await this.transcode_pcm(original, extension, id);
				}
			}
			const duration = wav_info(pcm ?? original).duration;
			if (!(duration > 0)) throw Object.assign(new Error('no audio data in the file'), { transient: false });
			return { pcm, duration };
		},

		async transcode_pcm(bytes: Uint8Array, ext: string, id: number): Promise<Uint8Array> {
			const src = join(dirs.tmp, `pcm-${id}-${Date.now()}.${ext || 'bin'}`);
			const dest = `${src}.16k.wav`;
			try {
				await Bun.write(src, bytes);
				await convert_to_wav(src, dest);
				return await Bun.file(dest).bytes();
			} finally {
				for (const scratch of [src, dest]) {
					try {
						unlinkSync(scratch);
					} catch {
						// Never written, because ffmpeg is missing or the conversion failed.
					}
				}
			}
		}
	};
}

/**
 * Paragraphs at pauses longer than 1.5 s or every minute, so the chunker has
 * real boundaries to work with.
 */
export function segments_to_markdown(segments: Segment[] | null | undefined, fallback = ''): string {
	if (!segments?.length) return fallback.trim();
	const paragraphs: string[] = [];
	let current: string[] = [];
	let paragraphStart = segments[0].start;
	let lastEnd = segments[0].start;
	for (const seg of segments) {
		const text = seg.text.trim();
		if (!text) continue;
		if (current.length && (seg.start - lastEnd > 1.5 || seg.start - paragraphStart > 60)) {
			paragraphs.push(current.join(' '));
			current = [];
			paragraphStart = seg.start;
		}
		current.push(text);
		lastEnd = seg.end;
	}
	if (current.length) paragraphs.push(current.join(' '));
	return paragraphs.join('\n\n') || fallback.trim();
}

/** First line, or first sentence, trimmed to a title's length. */
export function derive_title(body: string | null | undefined, max = 60): string {
	const first = (body ?? '')
		.split('\n')
		.map((line) => line.replace(/^#+\s*/, '').replace(/[*_`>]/g, '').trim())
		.find(Boolean);
	if (!first) return '';
	const sentence = first.split(/(?<=[.!?…])\s+/)[0];
	const candidate = sentence.length >= 12 ? sentence : first;
	return candidate.length > max ? candidate.slice(0, max - 1).replace(/\s\S*$/, '') + '…' : candidate;
}
