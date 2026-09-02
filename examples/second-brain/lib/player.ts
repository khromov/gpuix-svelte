import { track } from './lifecycle.js';

let current = null;

function command(path) {
	if (process.platform === 'darwin') return ['afplay', path];
	if (process.platform === 'linux') {
		if (Bun.which('paplay')) return ['paplay', path];
		if (Bun.which('ffplay')) return ['ffplay', '-nodisp', '-autoexit', '-loglevel', 'error', path];
		if (Bun.which('aplay')) return ['aplay', '-q', path];
	}
	return null;
}

export function player_available() {
	return command('x') ? { ok: true } : { ok: false, reason: `no audio player found on ${process.platform}` };
}

/**
 * @param {string} path
 * @param {{ onEnded?: (code: number) => void }} [opts]
 * @returns {{ path: string, ended: Promise<number>, stop: () => void }}
 */
export function play(path, { onEnded } = {}) {
	stop_all();
	const cmd = command(path);
	if (!cmd) throw new Error(player_available().reason);

	const proc = track(Bun.spawn(cmd, { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' }));
	proc.unref();
	current = proc;

	const ended = proc.exited.then((code) => {
		if (current === proc) current = null;
		onEnded?.(code);
		return code;
	});

	return {
		path,
		ended,
		stop() {
			if (current === proc) current = null;
			proc.kill();
		}
	};
}

export function stop_all() {
	if (!current) return;
	const proc = current;
	current = null;
	proc.kill();
}

export const is_playing = () => current !== null;
