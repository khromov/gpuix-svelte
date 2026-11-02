/**
 * The relaunch handshake, Electron's relauncher in portable form: the process that installed an
 * update starts the new executable with its own pid in `GPUIX_RELAUNCH_AFTER` and exits, and the
 * new one waits here for that pid to be gone before it opens a window, so the two never overlap
 * and a single-instance app never sees its predecessor. No imports: render.ts calls it and has to
 * stay bundleable for the browser, where there is no process at all.
 */

/** Blocks until the instance named in `GPUIX_RELAUNCH_AFTER` has exited (or `timeout_ms` passed); false when none was named. */
export function wait_for_previous_instance(timeout_ms = 10000): boolean {
	const proc = globalThis.process;
	const previous = Number(proc?.env?.GPUIX_RELAUNCH_AFTER);
	if (!previous) return false;
	// Children of the new instance must not inherit it.
	delete proc.env.GPUIX_RELAUNCH_AFTER;
	const deadline = Date.now() + timeout_ms;
	const sleeper = new Int32Array(new SharedArrayBuffer(4));
	while (Date.now() < deadline) {
		try {
			proc.kill(previous, 0);
		} catch (error) {
			// Only ESRCH says it is gone; EPERM is a live process of another user.
			if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true;
		}
		Atomics.wait(sleeper, 0, 0, 25);
	}
	return true;
}
