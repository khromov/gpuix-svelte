/**
 * What test/update.ts compiles into a real executable, once per version: an app with no window
 * that updates itself and writes down what happened. `abandon` downloads and exits without
 * installing, the way an app closed midway does; `finish` only runs finish_update(). It reports
 * to and waits for the instance it replaced the way render() does before opening a window, and
 * writes down how that went.
 */

import { appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { app_info, check_for_update, finish_update, updated_from, wait_for_previous_instance } from '../src/update.ts';

// Bun 1.4.4 spins at 100% CPU on a top-level await that never settles, so an update that hangs would otherwise outlive the suite for good.
setTimeout(() => process.exit(3), 60_000).unref();

// A file beside the app rather than a path in the environment, because the launcher passes none on.
const home = process.platform === 'darwin' ? resolve(process.execPath, '../../../..') : dirname(process.execPath);
const version = app_info()?.version;
const trace = (line: string) => appendFileSync(join(home, 'trace.log'), `${line}\n`);

trace(`start ${version} ${process.pid} ${process.argv.slice(2).join(' ')}`.trimEnd());
const previous = Number(process.env.GPUIX_RELAUNCH_AFTER);
const waited = wait_for_previous_instance();
if (waited) {
	let gone = false;
	try {
		process.kill(previous, 0);
	} catch (error) {
		gone = (error as NodeJS.ErrnoException).code === 'ESRCH';
	}
	trace(`waited for ${updated_from()}: ${waited}, previous gone: ${gone}`);
}
if (process.argv[2] === 'finish') {
	finish_update();
	trace('finished');
	process.exit(0);
}
try {
	const update = await check_for_update();
	if (update && process.argv[2] === 'abandon') trace(`abandoned ${await update.download()}`);
	else if (update) await update.install();
	trace(`done ${version}`);
} catch (error) {
	trace(`error ${version} ${(error as Error).message}`);
}
