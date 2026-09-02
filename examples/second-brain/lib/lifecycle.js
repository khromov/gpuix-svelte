/**
 * The window closes by `process.exit(0)` from the frame loop, so `exit` is the one
 * hook that always runs — and it only runs synchronous code.
 */

const children = new Set();
const hooks = new Set();
let installed = false;

/** @template {{ exited?: Promise<number>, kill: () => void }} T @param {T} proc @returns {T} */
export function track(proc) {
	children.add(proc);
	proc.exited?.then(() => children.delete(proc), () => children.delete(proc));
	return proc;
}

/** @param {() => void} fn synchronous @returns {() => void} unregister */
export function on_exit(fn) {
	hooks.add(fn);
	return () => hooks.delete(fn);
}

export function install_exit_handlers() {
	if (installed) return;
	installed = true;

	process.on('exit', () => {
		for (const fn of hooks) {
			try {
				fn();
			} catch {}
		}
		for (const proc of children) {
			try {
				proc.kill();
			} catch {}
		}
	});

	// A signal's default handling skips 'exit' entirely.
	for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
		process.on(signal, () => process.exit(code));
	}
}
