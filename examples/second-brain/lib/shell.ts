import { dirname } from 'node:path';
import { warn } from './log.js';

// Bun.spawn throws on a missing binary instead of emitting an 'error' event.
function spawn_detached(cmd) {
	try {
		const proc = Bun.spawn(cmd, { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
		proc.unref();
		return true;
	} catch (err) {
		warn(`could not run ${cmd[0]}:`, err.message);
		return false;
	}
}

/** @param {string} url http(s) only — a scraped `canonical` must not reach `open` with another scheme */
export function open_url(url) {
	if (!/^https?:\/\//i.test(url)) {
		warn('refusing to open non-http url:', url);
		return false;
	}
	if (process.platform === 'darwin') return spawn_detached(['open', url]);
	if (process.platform === 'win32') return spawn_detached(['cmd', '/c', 'start', '', url]);
	return spawn_detached(['xdg-open', url]);
}

/** @param {string} path */
export function reveal(path) {
	if (process.platform === 'darwin') return spawn_detached(['open', '-R', path]);
	if (process.platform === 'win32') return spawn_detached(['explorer', `/select,${path}`]);
	return spawn_detached(['xdg-open', dirname(path)]);
}

/** @param {string} path */
export function open_path(path) {
	if (process.platform === 'darwin') return spawn_detached(['open', path]);
	if (process.platform === 'win32') return spawn_detached(['cmd', '/c', 'start', '', path]);
	return spawn_detached(['xdg-open', path]);
}
