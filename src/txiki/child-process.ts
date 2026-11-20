import { EventEmitter } from 'events';

interface SpawnOptions { stdio?: unknown; detached?: boolean; shell?: boolean }

class Child extends EventEmitter {
	pid: undefined;
	unref() { return this; }
	ref() { return this; }
	kill() { return false; }
}

/** Mobile has no shell or child processes; the common desktop URL launchers use the platform instead. */
export function spawn(command: string, args: readonly string[] = [], options: SpawnOptions = {}): Child {
	const child = new Child();
	queueMicrotask(() => {
		try {
			let url: string | undefined;
			if (!options.shell && (command === 'open' || command === 'xdg-open') && args.length === 1) url = args[0];
			if (!options.shell && command.toLowerCase() === 'cmd' && args.length === 4 && args[0]?.toLowerCase() === '/c' && args[1]?.toLowerCase() === 'start' && args[2] === '') url = args[3];
			if (!url || !/^https?:\/\//i.test(url)) throw Object.assign(new Error(`spawn ${command} is not supported on mobile`), { code: 'ENOSYS', syscall: 'spawn', path: command });
			(globalThis as typeof globalThis & { gpuixHost: { openUrl(url: string): void } }).gpuixHost.openUrl(url);
			child.emit('exit', 0, null);
			child.emit('close', 0, null);
		} catch (error) {
			child.emit('error', error);
			child.emit('close', -1, null);
		}
	});
	return child;
}
export default { spawn };
