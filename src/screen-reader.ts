import { execFile } from 'node:child_process';

const POLL_MS = 2000;

let running = false;
let checked = -POLL_MS;
let checking = false;

/**
 * Whether VoiceOver is running, asked of `pgrep` every couple of seconds: native has no signal for
 * an assistive client, and `defaults` only knows a VoiceOver that was started with its shortcut.
 */
export function voiceover_running(now: number): boolean {
	const process = globalThis.process;
	if (process?.platform !== 'darwin' || checking || now - checked < POLL_MS) return running;
	checked = now;
	checking = true;
	// Bun's browser build stubs node:child_process, which the platform check above never reaches.
	execFile('/usr/bin/pgrep', ['-x', 'VoiceOver'], (error) => {
		running = error === null;
		checking = false;
	});
	return running;
}
