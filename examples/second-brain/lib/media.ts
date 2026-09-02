import { copyFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { extname } from 'node:path';
import { convert_to_wav, ffmpeg_path, wav_duration, wav_is_pcm16_mono_16k } from './audio.ts';
import { warn } from './log.ts';
import { file_path, type DataDirs } from './paths.ts';
import type { Failure } from './types.ts';
import { decode_wav, encode_wav } from './wav.ts';

export interface ImportedImage {
	file_path: string;
	width: number;
	height: number;
	format: string;
	display_path: string | null;
}

export interface Thumb {
	path: string;
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
		async import_image(src: string | Uint8Array, id: number, { ext }: { ext?: string } = {}): Promise<ImportedImage> {
			const bytes = typeof src === 'string' ? await Bun.file(src).bytes() : src;
			const { width, height, format } = await new Bun.Image(bytes).metadata();
			const extension = EXT_BY_FORMAT[format] ?? ext ?? (typeof src === 'string' ? extname(src).slice(1) : 'png') ?? 'png';
			const file = file_path(dirs, id, extension || 'png');
			await Bun.write(file, bytes);
			const display_path = needs_display_copy(format) ? await this.make_display(file, id) : null;
			return { file_path: file, width, height, format, display_path };
		},

		/** A WebP the window can paint, at most 2048 px on a side. */
		async make_display(file: string, id: number): Promise<string> {
			const path = file_path(dirs, `${id}.display`, 'webp');
			await new Bun.Image(file).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).write(path);
			return path;
		},

		/** WebP unless the platform's encoder refuses, then PNG. */
		async make_thumb(file: string, thumb: string, { size = 480 }: { size?: number } = {}): Promise<Thumb> {
			let path = thumb;
			try {
				await new Bun.Image(file).resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).write(path);
			} catch (err) {
				warn('webp thumbnail failed, using png:', (err as Error).message);
				path = thumb.replace(/\.webp$/, '.png');
				await new Bun.Image(file).resize(size, size, { fit: 'inside', withoutEnlargement: true }).png().write(path);
			}
			const { width, height } = await new Bun.Image(path).metadata();
			return { path, width, height };
		},

		image_data_url(file: string, { max = 1024, quality = 80 }: { max?: number; quality?: number } = {}) {
			return new Bun.Image(file).resize(max, max, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).dataurl();
		},

		/**
		 * Copies (or moves) the original into files/; the 16 kHz PCM sidecar is made later
		 * by the pipeline, since ffmpeg can take a while.
		 */
		import_audio_file(src: string, id: number, { move = false }: { move?: boolean } = {}): { file_path: string } {
			const extension = extname(src).slice(1).toLowerCase() || 'wav';
			const file = file_path(dirs, id, extension);
			if (move) {
				try {
					renameSync(src, file);
				} catch {
					copyFileSync(src, file);
					unlinkSync(src);
				}
			} else {
				copyFileSync(src, file);
			}
			return { file_path: file };
		},

		/** `file` is the stored original. */
		async prepare_pcm(file: string, id: number): Promise<{ pcm_path: string; duration: number; converted: boolean }> {
			const extension = extname(file).slice(1).toLowerCase();
			let pcm_path = file;
			if (extension === 'wav' && (await wav_is_pcm16_mono_16k(file)).ok) {
				pcm_path = file;
			} else if (extension === 'wav') {
				pcm_path = file_path(dirs, `${id}.16k`, 'wav');
				try {
					const { samples } = decode_wav(await Bun.file(file).bytes());
					await Bun.write(pcm_path, encode_wav(samples, 16000));
				} catch (err) {
					if ((err as Failure).code !== 'EWAVFORMAT') throw err;
					await convert_to_wav(file, pcm_path);
				}
			} else {
				pcm_path = file_path(dirs, `${id}.16k`, 'wav');
				await convert_to_wav(file, pcm_path);
			}
			const duration = await wav_duration(pcm_path);
			if (!(duration > 0)) throw Object.assign(new Error('no audio data in the file'), { transient: false });
			return { pcm_path, duration, converted: pcm_path !== file };
		},

		remove_files(paths: Array<string | null | undefined>) {
			for (const path of paths) {
				if (!path || !existsSync(path)) continue;
				try {
					unlinkSync(path);
				} catch (err) {
					warn(`could not remove ${path}:`, (err as Error).message);
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
