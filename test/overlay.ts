/**
 * GPUI's frame-cost overlay through the package's wrappers, the rule `render()` applies it
 * by, and `render()` following that rule on a seeded native, since its window can't be
 * driven headlessly.
 */

import {
	render,
	set_debug_overlay,
	cycle_debug_overlay,
	debug_overlay,
	debug_overlay_stats,
	reset_debug_overlay_stats,
	type DebugFrameOverlayMode
} from 'gpuix-svelte';
import { overlay_on_render } from '../src/render.ts';
import { mount_headless, settle, check, finish } from 'gpuix-svelte/test';
import { seed_window } from './seed-window.ts';

// Through String, because `check` compares JSON, where undefined and null are the same inside an array.
check(
	'every wrapper is a no-op before anything is mounted',
	[set_debug_overlay('full'), cycle_debug_overlay(), debug_overlay(), debug_overlay_stats(), reset_debug_overlay_stats()].map(String),
	['undefined', 'undefined', 'undefined', 'undefined', 'undefined']
);

check('GPUIX_FPS=1 means full, on the window it creates', overlay_on_render('1', undefined, undefined, true), 'full');
check('GPUIX_FPS outranks the option', overlay_on_render('minimal', 'full', undefined, true), 'minimal');
check('and is not re-applied on a remount', overlay_on_render('1', 'full', undefined, false) === undefined);
check('the option applies on the first render', overlay_on_render(undefined, 'full', undefined, true), 'full');
check(
	'and again only when it changed',
	[overlay_on_render(undefined, 'full', 'full', false), overlay_on_render(undefined, 'minimal', 'full', false)].map(String),
	['undefined', 'minimal']
);
check('leaving it out leaves the mode alone', overlay_on_render(undefined, undefined, 'full', false) === undefined);

const Reorder = (await import('./Reorder.svelte')).default;
mount_headless(Reorder);

check('the overlay starts hidden', debug_overlay(), 'hidden');
check('set_debug_overlay switches it', [set_debug_overlay('full'), debug_overlay()], ['full', 'full']);
check('cycle_debug_overlay wraps around', [cycle_debug_overlay(), cycle_debug_overlay()], ['hidden', 'minimal']);

const warnings: string[] = [];
const warn = console.warn;
console.warn = (message) => warnings.push(String(message));
const typo = [set_debug_overlay('ful' as DebugFrameOverlayMode), set_debug_overlay('ful' as DebugFrameOverlayMode)];
console.warn = warn;
check('an unknown mode returns undefined instead of throwing', typo.map(String), ['undefined', 'undefined']);
check('warns once, naming it', warnings.filter((w) => w.includes('"ful"')).length, 1);
check('and leaves the mode as it was', debug_overlay(), 'minimal');

const mounted_frames = debug_overlay_stats()!.frames;
for (let i = 0; i < 5; i++) settle();
const before = debug_overlay_stats()!;
check('stats count the frames drawn', before.frames - mounted_frames >= 5, true);
reset_debug_overlay_stats();
settle();
const after = debug_overlay_stats()!;
check('reset drops the samples but not the frame count', [after.samples < before.samples, after.frames > before.frames], [true, true]);

process.env.GPUIX_FPS = '1';
seed_window({ created: true });
render(Reorder, { debugFrameOverlay: 'minimal' });
check('render() applies GPUIX_FPS=1 over the option, on the window it creates', debug_overlay(), 'full');
cycle_debug_overlay();
render(Reorder, { debugFrameOverlay: 'minimal' });
check('and a remount leaves the mode where it was cycled to', debug_overlay(), 'hidden');
delete process.env.GPUIX_FPS;

seed_window();
render(Reorder, { debugFrameOverlay: 'minimal' });
check('render() applies the option', debug_overlay(), 'minimal');
cycle_debug_overlay();
render(Reorder, { debugFrameOverlay: 'minimal' });
check('a remount with the same option keeps a cycled mode', debug_overlay(), 'full');
render(Reorder, { debugFrameOverlay: 'hidden' });
check('a changed option applies on the remount', debug_overlay(), 'hidden');

finish('overlay', 20);
