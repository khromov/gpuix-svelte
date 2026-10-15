// After a native bump, this is what finds the new surface, rather than another read of index.d.ts.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_PROPS } from '@gpuix/native/host';
import { GPUI_EVENTS } from '../src/events.ts';

interface Source {
	path: string;
	text: string;
}

const root = fileURLToPath(new URL('..', import.meta.url));
const native = new URL('.', import.meta.resolve('@gpuix/native'));
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, native)), 'utf8');

function classes(dts: string) {
	const found = new Map<string, Set<string>>();
	for (const [, name, body] of dts.matchAll(/^export (?:declare )?class (\w+)[^{]*\{([\s\S]*?)^\}/gm)) {
		const methods = [...body.matchAll(/^ +(\w+)\(/gm)].map((m) => m[1]);
		found.set(name, new Set(methods.filter((m) => m !== 'constructor' && m !== 'free')));
	}
	return found;
}

function sources(dir: string): Source[] {
	return readdirSync(join(root, dir), { recursive: true })
		.map(String)
		.filter((f) => /\.(ts|svelte)$/.test(f) && !f.endsWith('.d.ts') && !f.includes('.samples-tmp'))
		.map((f) => ({ path: join(dir, f), text: readFileSync(join(root, dir, f), 'utf8') }));
}

const callers = (name: string, files: Source[]) => {
	const call = new RegExp(String.raw`\.${name}\??\.?\(`);
	return files.filter((f) => call.test(f.text)).map((f) => f.path);
};

const dts = read('index.d.ts');
const napi = classes(dts);
const wasm = classes(read('wasm/gpuix-web.d.ts')).get('GpuixRenderer') ?? new Set<string>();
const window_class = napi.get('GpuixRenderer') ?? new Set<string>();
const test_class = napi.get('TestGpuixRenderer') ?? new Set<string>();
const src = sources('src');
const elsewhere = [...sources('test'), ...sources('examples')];
// The one module that only ever holds a TestGpuixRenderer; every other caller gets whichever `get_native()` has.
const HARNESS = join('src', 'test.ts');

console.log(`@gpuix/native ${JSON.parse(read('package.json')).version}: GpuixRenderer ${window_class.size} methods, TestGpuixRenderer ${test_class.size}, wasm GpuixRenderer ${wasm.size}\n`);

if (process.argv.includes('--all')) {
	const flag = (set: Set<string>, m: string) => (set.has(m) ? '+' : '-');
	console.log(`${'method'.padEnd(30)}R T W  src/`);
	for (const m of [...new Set([...window_class, ...test_class, ...wasm])].sort()) {
		console.log(`${m.padEnd(30)}${flag(window_class, m)} ${flag(test_class, m)} ${flag(wasm, m)}  ${callers(m, src).join(' ') || '-'}`);
	}
	console.log('\nR = GpuixRenderer, T = TestGpuixRenderer, W = the wasm GpuixRenderer (browser.mjs)\n');
}

for (const [name, methods, counts] of [
	['GpuixRenderer', window_class, (path: string) => path !== HARNESS],
	['TestGpuixRenderer', test_class, () => true]
] as const) {
	const unused = [...methods].sort().filter((m) => !callers(m, src).some(counts));
	console.log(`${name}: ${unused.length} of ${methods.size} methods are not called from src/`);
	for (const m of unused) console.log(`  ${m.padEnd(30)}${callers(m, elsewhere).join(' ')}`.trimEnd());
	console.log();
}

const functions = [...dts.matchAll(/^export declare function (\w+)/gm)].map((m) => m[1]);
const unreferenced = functions.filter((f) => !src.some((s) => new RegExp(String.raw`\b${f}\b`).test(s.text)));
console.log(`Functions not referenced from src/: ${unreferenced.join(', ') || 'none'}`);

const host_events = EVENT_PROPS.map(([, event]) => event as string);
const missing = host_events.filter((e) => !GPUI_EVENTS.includes(e));
const extra = GPUI_EVENTS.filter((e) => !host_events.includes(e));
console.log(
	missing.length + extra.length === 0
		? `Events: GPUI_EVENTS matches @gpuix/native/host's EVENT_PROPS (${host_events.length})`
		: `Events: EVENT_PROPS has ${missing.join(', ') || 'nothing'} GPUI_EVENTS lacks; GPUI_EVENTS has ${extra.join(', ') || 'nothing'} EVENT_PROPS lacks`
);
