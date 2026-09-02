/**
 * The shim has to load into this process, the one that owns the NSWindow, which is
 * why AppKit is reached over FFI rather than through a change to @gpuix/native.
 */

import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const SRC = `${DIR}glass-shim.m`;
const DYLIB = `${DIR}.glass-shim.dylib`;

export async function init_glass() {
	if (process.platform !== 'darwin' || process.env.GPUIX_GLASS === '0') return null;

	try {
		if (!existsSync(DYLIB) || statSync(DYLIB).mtimeMs < statSync(SRC).mtimeMs) {
			execFileSync('clang', ['-dynamiclib', '-fobjc-arc', '-framework', 'AppKit', '-o', DYLIB, SRC]);
		}

		let available: () => number, attach: (radius: number) => number;
		if (process.versions.bun) {
			const { dlopen } = await import('bun:ffi');
			const lib = dlopen(DYLIB, {
				gpuix_glass_available: { args: [], returns: 'i32' },
				gpuix_glass_attach: { args: ['f64'], returns: 'i64' }
			});
			available = () => lib.symbols.gpuix_glass_available();
			attach = (radius: number) => Number(lib.symbols.gpuix_glass_attach(radius));
		} else {
			const { dlopen } = await import('node:ffi');
			const { functions } = dlopen(DYLIB, {
				gpuix_glass_available: { arguments: [], return: 'int32' },
				gpuix_glass_attach: { arguments: ['float64'], return: 'int64' }
			});
			available = () => functions.gpuix_glass_available();
			attach = (radius: number) => Number(functions.gpuix_glass_attach(radius));
		}

		if (!available()) return null;
		return { attach };
	} catch (err) {
		console.warn('[liquid-glass] real glass unavailable, using window blur:', (err as Error).message);
		return null;
	}
}
