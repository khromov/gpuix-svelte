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
	// Not an import: render.ts has to bundle for the browser.
	const child_process = process.getBuiltinModule?.('node:child_process');
	if (!child_process) return running;
	checking = true;
	child_process.execFile('/usr/bin/pgrep', ['-x', 'VoiceOver'], (error) => {
		running = error === null;
		checking = false;
	});
	return running;
}
