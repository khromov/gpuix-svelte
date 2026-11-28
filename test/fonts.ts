/**
 * Linux's text system keeps a family it looked up and missed, so a font registered before `render()`
 * has to reach native ahead of the first batch. A plain object stands in for native, so this runs on Linux too.
 */

import { register_font, render } from 'gpuix-svelte';
import { check, finish } from 'gpuix-svelte/test';
import type { Mutation } from '../src/types.ts';
import Fonts from './Fonts.svelte';

const vazirmatn = new Uint8Array([1]);
const noto = new Uint8Array([2]);
const calls: string[] = [];
const batches: Mutation[][] = [];
const native = {
	registerFont: (bytes: Uint8Array) => void calls.push(bytes === vazirmatn ? 'vazirmatn' : bytes === noto ? 'noto' : 'other'),
	applyBatch: (json: string) => (calls.push('batch'), batches.push(JSON.parse(json)), [])
};

register_font(vazirmatn);
(globalThis as unknown as { __gpuix_svelte_host: unknown }).__gpuix_svelte_host = { native, root: null, component: null, loop: { stop() {} }, keys: [] };
render(Fonts, { titlebar: false });
check('a font registered before render() goes in ahead of the first batch, which lays out the text', calls, ['vazirmatn', 'batch']);

const ops = batches.flat();
check(
	"the text's family is the first of its CSS list, and its words reach native in the order they were written",
	[ops.find((op) => op[0] === 'setStyle' && 'fontFamily' in (op[2] as object))?.[2], ops.find((op) => op[0] === 'setText')?.[2]],
	[{ fontFamily: 'Vazirmatn' }, 'سلام دنیا']
);

register_font(noto);
check('once the window is open, a font goes straight in', calls.at(-1), 'noto');

render(Fonts, { titlebar: false });
check('and a remount adds none again', calls.filter((call) => call !== 'batch'), ['vazirmatn', 'noto']);

finish('fonts', 4);
