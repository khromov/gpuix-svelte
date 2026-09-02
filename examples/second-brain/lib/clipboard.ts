import { track } from './lifecycle.js';
import { warn } from './log.js';

const has_image_api = () => typeof Bun.Image?.fromClipboard === 'function' && process.platform !== 'linux';

export function clipboard_available() {
	return {
		text: { ok: true },
		image: has_image_api() ? { ok: true } : { ok: false, reason: 'clipboard images need macOS or Windows' }
	};
}

function read_command() {
	if (process.platform === 'darwin') return ['pbpaste'];
	if (process.platform === 'win32') return ['powershell', '-NoProfile', '-Command', 'Get-Clipboard'];
	if (process.env.WAYLAND_DISPLAY && Bun.which('wl-paste')) return ['wl-paste', '--no-newline'];
	if (Bun.which('xclip')) return ['xclip', '-selection', 'clipboard', '-o'];
	if (Bun.which('xsel')) return ['xsel', '--clipboard', '--output'];
	return null;
}

function write_command() {
	if (process.platform === 'darwin') return ['pbcopy'];
	if (process.platform === 'win32') return ['powershell', '-NoProfile', '-Command', 'Set-Clipboard -Value ([Console]::In.ReadToEnd())'];
	if (process.env.WAYLAND_DISPLAY && Bun.which('wl-copy')) return ['wl-copy'];
	if (Bun.which('xclip')) return ['xclip', '-selection', 'clipboard'];
	if (Bun.which('xsel')) return ['xsel', '--clipboard', '--input'];
	return null;
}

// pbpaste transcodes through the locale and garbles non-ASCII when LANG is unset.
const env = { ...process.env, LC_CTYPE: process.env.LC_CTYPE ?? 'UTF-8' };

/** @returns {Promise<string>} '' when empty or unsupported */
export async function read_text() {
	const cmd = read_command();
	if (!cmd) return '';
	try {
		const proc = track(Bun.spawn(cmd, { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore', env }));
		const [text, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
		return code === 0 ? text : '';
	} catch (err) {
		warn('clipboard read failed:', err.message);
		return '';
	}
}

/** @param {string} text */
export async function write_text(text) {
	const cmd = write_command();
	if (!cmd) return false;
	try {
		const proc = track(Bun.spawn(cmd, { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore', env }));
		proc.stdin.write(text);
		proc.stdin.end();
		return (await proc.exited) === 0;
	} catch (err) {
		warn('clipboard write failed:', err.message);
		return false;
	}
}

export function has_image() {
	try {
		return has_image_api() && Bun.Image.hasClipboardImage();
	} catch {
		return false;
	}
}

/**
 * @param {{ maxDim?: number }} [opts]
 * @returns {Promise<Uint8Array | null>} PNG bytes
 */
export async function read_image({ maxDim = 4096 } = {}) {
	if (!has_image()) return null;
	try {
		const image = Bun.Image.fromClipboard();
		if (!image) return null;
		return await image.resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true }).png().bytes();
	} catch (err) {
		warn('clipboard image unreadable:', err.message);
		return null;
	}
}

export function clipboard_change_count() {
	try {
		return has_image_api() ? Bun.Image.clipboardChangeCount() : -1;
	} catch {
		return -1;
	}
}

/**
 * macOS has no clipboard notification; the change count is the documented poll.
 *
 * @param {(state: { image: boolean }) => void} cb
 * @param {number} [intervalMs]
 * @returns {() => void}
 */
export function watch_clipboard(cb, intervalMs = 1000) {
	let last = clipboard_change_count();
	if (last === -1) return () => {};
	const timer = setInterval(() => {
		const count = clipboard_change_count();
		if (count === last) return;
		last = count;
		cb({ image: has_image() });
	}, intervalMs);
	return () => clearInterval(timer);
}
