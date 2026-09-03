/**
 * Everything the capture box and the audio controls do: notes, links, images from
 * the chooser or the clipboard, recordings, playback.
 */

import { rmSync } from 'node:fs';
import { data, get_app } from './data.svelte.ts';
import { choose_files } from './dialogs.ts';
import { warn } from './log.ts';
import { play, stop_all } from './player.ts';
import { init_recorder } from './recorder.ts';
import { looks_like_url } from './scrape.ts';
import type { Item } from './store.ts';
import { toast } from './ui.svelte.ts';

export interface Recording {
	path: string;
	startedAt: number;
	elapsed: number;
	level: number;
}

export const capture = $state<{ text: string; recording: Recording | null; busy: boolean }>({
	text: '',
	recording: null,
	busy: false
});

export const playback = $state<{ id: number | null }>({ id: null });

let timer: ReturnType<typeof setInterval> | null = null;

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
	let paths: string[];
	try {
		paths = await choose_files({ kinds: 'image', multiple: true, prompt: 'Add images to Substrate' });
	} catch (err) {
		toast((err as Error).message, 'error');
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
		toast((err as Error).message, 'error');
	}
}

export async function pick_audio() {
	const app = get_app();
	const kinds = data.capabilities?.ffmpeg?.ok ? 'audio' : 'wav';
	let paths: string[];
	try {
		paths = await choose_files({ kinds, multiple: true, prompt: kinds === 'wav' ? 'Import WAV files (install ffmpeg for other formats)' : 'Import audio' });
	} catch (err) {
		toast((err as Error).message, 'error');
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
		toast((err as Error).message, 'error');
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
	clearInterval(timer!);
	timer = null;
	const recording = capture.recording;
	capture.recording = null;
	if (!recording) return;
	const rec = await init_recorder();
	const seconds = await rec.stop();
	if (seconds < 0.5) {
		toast('Recording too short', 'error');
		rmSync(recording.path, { force: true });
		return;
	}
	await get_app().add_audio(recording.path, { move: true, recorded: true });
	toast('Recording saved — transcribing', 'success');
}

export function toggle_play(item: Item) {
	if (playback.id === item.id) {
		stop_all();
		playback.id = null;
		return;
	}
	const file = get_app().blobs.file(item.file_blob);
	if (!file) return;
	try {
		play(file, {
			onEnded: () => {
				if (playback.id === item.id) playback.id = null;
			}
		});
		playback.id = item.id;
	} catch (err) {
		warn('playback failed:', (err as Error).message);
		toast((err as Error).message, 'error');
	}
}
