/**
 * Everything the capture box and the audio controls do: notes, links, images from
 * the chooser or the clipboard, recordings, playback.
 */

import { unlinkSync } from 'node:fs';
import { data, get_app } from './data.svelte.js';
import { choose_files } from './dialogs.js';
import { warn } from './log.js';
import { play, stop_all } from './player.js';
import { init_recorder } from './recorder.js';
import { looks_like_url } from './scrape.js';
import { toast } from './ui.svelte.js';

export const capture = $state({
	text: '',
	/** @type {{ path: string, startedAt: number, elapsed: number, level: number } | null} */
	recording: null,
	busy: false
});

/** @type {{ id: number | null }} */
export const playback = $state({ id: null });

let timer = null;

export async function submit() {
	const text = capture.text.trim();
	if (!text) return;
	const app = get_app();
	capture.text = '';
	if (looks_like_url(text)) {
		const { existed } = await app.add_link(text);
		toast(existed ? 'That link is already in your brain' : 'Link added — reading it now', existed ? 'info' : 'success');
	} else {
		app.add_note({ body: text });
	}
}

export async function add_link_from_text() {
	const text = capture.text.trim();
	if (!looks_like_url(text)) {
		toast('Paste a full http(s) URL first', 'error');
		return;
	}
	await submit();
}

export async function pick_images() {
	const app = get_app();
	let paths;
	try {
		paths = await choose_files({ kinds: 'image', multiple: true, prompt: 'Add images to Substrate' });
	} catch (err) {
		toast(err.message, 'error');
		return;
	}
	for (const path of paths) await app.add_image(path);
	if (paths.length) toast(`${paths.length} image${paths.length === 1 ? '' : 's'} added`, 'success');
}

export async function paste_image() {
	try {
		await get_app().add_image({ clipboard: true });
		toast('Image pasted', 'success');
	} catch (err) {
		toast(err.message, 'error');
	}
}

export async function pick_audio() {
	const app = get_app();
	const kinds = data.capabilities?.ffmpeg?.ok ? 'audio' : 'wav';
	let paths;
	try {
		paths = await choose_files({ kinds, multiple: true, prompt: kinds === 'wav' ? 'Import WAV files (install ffmpeg for other formats)' : 'Import audio' });
	} catch (err) {
		toast(err.message, 'error');
		return;
	}
	for (const path of paths) await app.add_audio(path);
	if (paths.length) toast(`${paths.length} recording${paths.length === 1 ? '' : 's'} queued for transcription`, 'success');
}

export async function start_recording() {
	if (capture.recording) return;
	const app = get_app();
	const rec = await init_recorder();
	if (!rec.available) {
		toast(rec.reason ?? 'recording unavailable', 'error');
		return;
	}
	capture.busy = true;
	const status = await rec.requestPermission();
	capture.busy = false;
	if (status !== 'authorized') {
		toast(`Microphone ${status} — allow your terminal under System Settings → Privacy & Security → Microphone`, 'error');
		return;
	}
	const path = `${app.dirs.tmp}/recording-${Date.now()}.wav`;
	try {
		rec.start(path);
	} catch (err) {
		toast(err.message, 'error');
		return;
	}
	capture.recording = { path, startedAt: Date.now(), elapsed: 0, level: 0 };
	timer = setInterval(() => {
		if (!capture.recording) return;
		capture.recording.elapsed = rec.elapsed();
		capture.recording.level = rec.level();
	}, 100);
}

export async function stop_recording() {
	clearInterval(timer);
	timer = null;
	const recording = capture.recording;
	capture.recording = null;
	if (!recording) return;
	const rec = await init_recorder();
	const seconds = await rec.stop();
	if (seconds < 0.5) {
		toast('Recording too short', 'error');
		try {
			unlinkSync(recording.path);
		} catch {}
		return;
	}
	await get_app().add_audio(recording.path, { move: true });
	toast('Recording saved — transcribing', 'success');
}

export function toggle_play(item) {
	if (playback.id === item.id) {
		stop_all();
		playback.id = null;
		return;
	}
	if (!item.file_path) return;
	try {
		play(item.file_path, {
			onEnded: () => {
				if (playback.id === item.id) playback.id = null;
			}
		});
		playback.id = item.id;
	} catch (err) {
		warn('playback failed:', err.message);
		toast(err.message, 'error');
	}
}
