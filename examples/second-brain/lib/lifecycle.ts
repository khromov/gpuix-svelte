/**
 * The window closes by `process.exit(0)` from the frame loop, so `exit` is the one
 * hook that always runs — and it only runs synchronous code.
 */

interface Child {
	exited?: Promise<number>;
	kill: () => void;
}

const children = new Set<Child>();
const hooks = new Set<() => void>();
let installed = false;

export function track<T extends Child>(proc: T): T {
	children.add(proc);
	proc.exited?.then(() => children.delete(proc), () => children.delete(proc));
	return proc;
}

/** `fn` must be synchronous; returns the unregister function. */
export function on_exit(fn: () => void): () => void {
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
			} catch {
				// One hook failing must not skip the rest at exit.
			}
		}
		for (const proc of children) {
			try {
				proc.kill();
			} catch {
				// Already gone.
			}
		}
	});

	// A signal's default handling skips 'exit' entirely.
	for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]] as const) {
		process.on(signal, () => process.exit(code));
	}
}
