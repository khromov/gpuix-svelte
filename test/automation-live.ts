/**
 * Not part of `npm test`: it opens a real window. Drives the counter demo through
 * `launch()` the way an external process would, over the app's stdin/stdout.
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from 'gpuix-svelte/automation';
import { check, finish } from 'gpuix-svelte/test';

// An app that stays up and never answers would otherwise leave this waiting until the CI job's own limit.
setTimeout(() => {
	console.error('automation-live: no verdict after 60 s');
	process.exit(1);
}, 60_000).unref();

const app = await launch({ entry: 'examples/counter/main.ts' });

for (let i = 0; i < 3; i++) await app.getByTestId('plus').click();
const branch = await app.getByText('3 clicks').waitFor();
check('three clicks on + reach the {#if} branch', branch.text?.includes('the {#if} branch is live'), true);

// gpuix builds the Linux addon without image readback, so native throws there.
const screenshots = process.platform !== 'linux';
if (screenshots) {
	const shot = join(tmpdir(), `gpuix-svelte-live-${process.pid}.png`);
	await app.screenshot({ path: shot });
	check('screenshot() writes a PNG of the window', existsSync(shot) && readFileSync(shot).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
	rmSync(shot, { force: true });
}

// Sent in the same turn as the click: a pipe's round trip gives the event time to land, and only this leaves frame_synced as what holds the read back.
const reset = await app.getByText('Reset').center();
const clicked = app.call('click', reset);
check('a read right after a click sees its effect', await app.getByText('clicks').count(), 0);
await clicked;

const started = Date.now();
await app.close();
check('close() ends the app cleanly within two seconds', [app.process.exitCode, Date.now() - started < 2000], [0, true]);

finish('automation-live', screenshots ? 4 : 3);
