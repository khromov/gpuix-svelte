/**
 * The relaunch handshake, Electron's relauncher in portable form. The process that installed an
 * update starts the new executable with its own pid in `GPUIX_RELAUNCH_AFTER` and a sentinel path
 * in `GPUIX_RELAUNCH_READY`, then waits for the sentinel before it exits (and rolls the update
 * back if it never comes). The new instance, here, writes the sentinel as soon as it runs this
 * code, then waits for the old pid to be gone before it opens a window, so the two never overlap
 * and a single-instance app never sees its predecessor. No imports: render.ts calls it and has to
 * stay bundleable for the browser, where there is no process at all.
 */

export type PreviousInstance = 'exited' | 'timed-out' | false;

let from: string | null | undefined;

/** Takes the handshake variables out of the environment once, so children of this process never inherit them. */
function handshake(): { previous: number | null; ready: string | null } {
	const env = globalThis.process?.env;
	if (!env) return { previous: null, ready: null };
	const raw = env.GPUIX_RELAUNCH_AFTER;
	const ready = env.GPUIX_RELAUNCH_READY ?? null;
	if (from === undefined) from = env.GPUIX_UPDATED_FROM || null;
	delete env.GPUIX_RELAUNCH_AFTER;
	delete env.GPUIX_RELAUNCH_READY;
	delete env.GPUIX_UPDATED_FROM;
	return { previous: raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : null, ready };
}

/**
 * Reports to the instance that installed this one and blocks until it has exited: `'exited'`,
 * or `'timed-out'` after `timeout_ms` (a warning is logged and the caller carries on), or false
 * when this process was not started by an update.
 */
export function wait_for_previous_instance(timeout_ms = 10000): PreviousInstance {
	const proc = globalThis.process;
	const { previous, ready } = handshake();
	if (ready) {
		try {
			(proc.getBuiltinModule('node:fs') as typeof import('node:fs')).writeFileSync(ready, String(proc.pid));
		} catch {
			// The old instance then rolls back after its timeout; nothing more to do here.
		}
	}
	if (previous === null) return false;
	const deadline = Date.now() + timeout_ms;
	const sleeper = new Int32Array(new SharedArrayBuffer(4));
	while (Date.now() < deadline) {
		try {
			proc.kill(previous, 0);
		} catch (error) {
			// Only ESRCH says it is gone; EPERM is a live process of another user.
			if ((error as NodeJS.ErrnoException).code === 'ESRCH') return 'exited';
		}
		Atomics.wait(sleeper, 0, 0, 25);
	}
	console.warn(`[gpuix-svelte] the instance this one replaced (pid ${previous}) is still running after ${timeout_ms} ms; carrying on`);
	return 'timed-out';
}

/** The version this process replaced through an update, or null; the same answer on every call in this process. */
export function updated_from(): string | null {
	handshake();
	return from ?? null;
}
