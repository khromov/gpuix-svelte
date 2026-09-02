import { copyFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { extname } from 'node:path';
import { convert_to_wav, ffmpeg_path, wav_duration, wav_is_pcm16_mono_16k } from './audio.js';
import { warn } from './log.js';
import { file_path } from './paths.js';
import { decode_wav, encode_wav } from './wav.js';

const EXT_BY_FORMAT = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', bmp: 'bmp', tiff: 'tiff', heic: 'heic', avif: 'avif' };

// GPUI's image crate has no AVIF or HEIC decoder; Bun.Image (ImageIO) does, so those
// get a WebP copy for the window while the original stays on disk.
const GPUI_CAN_PAINT = new Set(['jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff']);
export const needs_display_copy = (format) => !!format && !GPUI_CAN_PAINT.has(format);

/** @param {import('./paths.js').DataDirs} dirs */
export function create_media(dirs) {
	return {
		has_ffmpeg: ffmpeg_path() !== null,

		/**
		 * @param {string | Uint8Array} src a path or PNG bytes
		 * @param {number} id
		 * @param {{ ext?: string }} [opts]
		 * @returns {Promise<{ file_path: string, width: number, height: number, format: string, display_path: string | null }>}
		 */
		async import_image(src, id, { ext } = {}) {
			const bytes = typeof src === 'string' ? await Bun.file(src).bytes() : src;
			const { width, height, format } = await new Bun.Image(bytes).metadata();
			const extension = EXT_BY_FORMAT[format] ?? ext ?? (typeof src === 'string' ? extname(src).slice(1) : 'png') ?? 'png';
			const file = file_path(dirs, id, extension || 'png');
			await Bun.write(file, bytes);
			const display_path = needs_display_copy(format) ? await this.make_display(file, id) : null;
			return { file_path: file, width, height, format, display_path };
		},

		/** A WebP the window can paint, at most 2048 px on a side. */
		async make_display(file, id) {
			const path = file_path(dirs, `${id}.display`, 'webp');
			await new Bun.Image(file).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).write(path);
			return path;
		},

		/**
		 * WebP unless the platform's encoder refuses, then PNG.
		 * @param {string} file @param {string} thumb @param {{ size?: number }} [opts]
		 * @returns {Promise<{ path: string, width: number, height: number }>}
		 */
		async make_thumb(file, thumb, { size = 480 } = {}) {
			let path = thumb;
			try {
				await new Bun.Image(file).resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).write(path);
			} catch (err) {
				warn('webp thumbnail failed, using png:', err.message);
				path = thumb.replace(/\.webp$/, '.png');
				await new Bun.Image(file).resize(size, size, { fit: 'inside', withoutEnlargement: true }).png().write(path);
			}
			const { width, height } = await new Bun.Image(path).metadata();
			return { path, width, height };
		},

		/** @param {string} file @param {{ max?: number, quality?: number }} [opts] */
		image_data_url(file, { max = 1024, quality = 80 } = {}) {
			return new Bun.Image(file).resize(max, max, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).dataurl();
		},

		/**
		 * Copies (or moves) the original into files/; the 16 kHz PCM sidecar is made later
		 * by the pipeline, since ffmpeg can take a while.
		 * @param {string} src @param {number} id @param {{ move?: boolean }} [opts]
		 */
		import_audio_file(src, id, { move = false } = {}) {
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

		/**
		 * @param {string} file the stored original
		 * @param {number} id
		 * @returns {Promise<{ pcm_path: string, duration: number, converted: boolean }>}
		 */
		async prepare_pcm(file, id) {
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
					if (err.code !== 'EWAVFORMAT') throw err;
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

		/** @param {Array<string | null | undefined>} paths */
		remove_files(paths) {
			for (const path of paths) {
				if (!path || !existsSync(path)) continue;
				try {
					unlinkSync(path);
				} catch (err) {
					warn(`could not remove ${path}:`, err.message);
				}
			}
		}
	};
}

/**
 * Paragraphs at pauses longer than 1.5 s or every minute, so the chunker has
 * real boundaries to work with.
 *
 * @param {Array<{ start: number, end: number, text: string }>} segments
 * @param {string} fallback
 */
export function segments_to_markdown(segments, fallback = '') {
	if (!segments?.length) return fallback.trim();
	const paragraphs = [];
	let current = [];
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
export function derive_title(body, max = 60) {
	const first = (body ?? '')
		.split('\n')
		.map((line) => line.replace(/^#+\s*/, '').replace(/[*_`>]/g, '').trim())
		.find(Boolean);
	if (!first) return '';
	const sentence = first.split(/(?<=[.!?…])\s+/)[0];
	const candidate = sentence.length >= 12 ? sentence : first;
	return candidate.length > max ? candidate.slice(0, max - 1).replace(/\s\S*$/, '') + '…' : candidate;
}
