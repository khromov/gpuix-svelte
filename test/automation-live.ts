/**
 * Not part of `npm test`: it opens a real window. Drives the counter demo through
 * `launch()` the way an external process would, over the app's stdin/stdout.
 */

import { existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from 'gpuix-svelte/automation';
import { check, finish } from 'gpuix-svelte/test';

const app = await launch({ entry: 'examples/counter/main.ts' });

for (let i = 0; i < 3; i++) await app.getByTestId('plus').click();
const branch = await app.getByText('3 clicks').waitFor();
check('three clicks on + reach the {#if} branch', branch.text?.includes('the {#if} branch is live'), true);

const shot = join(tmpdir(), `gpuix-svelte-live-${process.pid}.png`);
await app.screenshot({ path: shot });
check('screenshot() writes a PNG of the window', existsSync(shot) && statSync(shot).size > 0, true);
rmSync(shot, { force: true });

await app.getByText('Reset').click();
check('a read right after a click sees its effect', await app.getByText('clicks').count(), 0);

const started = Date.now();
await app.close();
check('close() ends the app cleanly within two seconds', [app.process.exitCode, Date.now() - started < 2000], [0, true]);

finish('automation-live', 4);
