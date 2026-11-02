/**
 * What test/update.ts compiles into a real executable, once per version: an app with no window
 * that updates itself and writes down what happened. `abandon` downloads and exits without
 * installing, the way an app closed midway does. It waits for the instance it replaced the way
 * render() does before opening a window, and says so.
 */

import { appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { app_info, check_for_update, wait_for_previous_instance } from '../src/update.ts';

// A file beside the app rather than a path in the environment, because macOS's `open` passes none on.
const home = process.platform === 'darwin' ? resolve(process.execPath, '../../../..') : dirname(process.execPath);
const version = app_info()?.version;
const trace = (line: string) => appendFileSync(join(home, 'trace.log'), `${line}\n`);

trace(`start ${version} ${process.pid} ${process.argv.slice(2).join(' ')}`.trimEnd());
const from = process.env.GPUIX_UPDATED_FROM;
if (wait_for_previous_instance()) trace(`waited for ${from}: true`);
try {
	const update = await check_for_update();
	if (update && process.argv[2] === 'abandon') trace(`abandoned ${await update.download()}`);
	else if (update) await update.install();
	trace(`done ${version}`);
} catch (error) {
	trace(`error ${version} ${(error as Error).message}`);
}
