import { track } from './lifecycle.ts';
import { warn } from './log.ts';

/** A spawned player or an in-process winmm stream — both are just "the thing playing now". */
interface Playing {
	stop: () => void;
}

let current: Playing | null = null;

function command(path: string): string[] | null {
	if (process.platform === 'darwin') return ['afplay', path];
	if (process.platform === 'linux') {
		if (Bun.which('paplay')) return ['paplay', path];
		if (Bun.which('ffplay')) return ['ffplay', '-nodisp', '-autoexit', '-loglevel', 'error', path];
		if (Bun.which('aplay')) return ['aplay', '-q', path];
	}
	return null;
}

export function player_available(): { ok: boolean; reason?: string } {
	// Windows plays through winmm, which has no argv — and this is called synchronously from
	// capabilities(), so the device check waits until play() can load bun:ffi.
	if (process.platform === 'win32') return { ok: true };
	return command('x') ? { ok: true } : { ok: false, reason: `no audio player found on ${process.platform}` };
}

export function play(path: string, { onEnded }: { onEnded?: (code: number) => void } = {}): { path: string; ended: Promise<number>; stop: () => void } {
	stop_all();

	if (process.platform === 'win32') return play_win32(path, onEnded);

	const cmd = command(path);
	if (!cmd) throw new Error(player_available().reason);

	const proc = track(Bun.spawn(cmd, { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' }));
	proc.unref();
	const playing: Playing = { stop: () => proc.kill() };
	current = playing;

	const ended = proc.exited.then((code) => {
		if (current === playing) current = null;
		onEnded?.(code);
		return code;
	});

	return {
		path,
		ended,
		stop() {
			if (current === playing) current = null;
			proc.kill();
		}
	};
}

/**
 * Decoding is async but `play` is not, so the slot is claimed up front: a Play → Stop → Play
 * inside the decode would otherwise leave the first stream orphaned on the device.
 */
function play_win32(path: string, onEnded?: (code: number) => void) {
	let stream: { ended: Promise<number>; stop: () => void } | null = null;
	const playing: Playing = { stop: () => stream?.stop() };
	current = playing;

	const ended = import('./player-win.ts')
		.then(({ play_windows }) => {
			if (current !== playing) return 0;
			stream = play_windows(path);
			return stream.ended;
		})
		// Nothing attaches a catch to `ended`, and an unhandled rejection is fatal under Bun.
		.catch((err: Error) => {
			warn('playback failed:', err.message);
			return 1;
		})
		.then((code) => {
			if (current === playing) current = null;
			onEnded?.(code);
			return code;
		});

	return {
		path,
		ended,
		stop() {
			if (current === playing) current = null;
			playing.stop();
		}
	};
}

export function stop_all() {
	if (!current) return;
	const playing = current;
	current = null;
	playing.stop();
}

export const is_playing = () => current !== null;
