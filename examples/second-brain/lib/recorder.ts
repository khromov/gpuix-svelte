/**
 * GPUI has no microphone, so recording goes through AVFoundation in this process:
 * an Objective-C shim compiled on first run and loaded over bun:ffi, as
 * examples/liquid-glass-ffi does for AppKit. A compiled .app ships the dylib prebuilt.
 */

import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wav_duration } from './wav.ts';
import { on_exit } from './lifecycle.ts';
import { warn } from './log.ts';
import { resources_dir } from './paths.ts';

const DIR = fileURLToPath(new URL('../native/', import.meta.url));
const SRC = `${DIR}recorder-shim.m`;
const RESOURCES = resources_dir();
const DYLIB = RESOURCES ? join(RESOURCES, 'native', 'recorder-shim.dylib') : `${DIR}.recorder-shim.dylib`;

export const CLANG_ARGS = ['-dynamiclib', '-fobjc-arc', '-framework', 'AVFoundation', '-framework', 'AudioToolbox', '-framework', 'Foundation'];

export type AuthStatus = 'notDetermined' | 'authorized' | 'denied' | 'restricted';
export type PermissionResult = 'authorized' | 'denied' | 'restricted' | 'timeout';

const STATUS: AuthStatus[] = ['notDetermined', 'authorized', 'denied', 'restricted'];
const HINT = 'allow your terminal under System Settings → Privacy & Security → Microphone, then relaunch';

export interface Recorder {
	available: boolean;
	reason?: string;
	authStatus: () => AuthStatus;
	requestPermission: (opts?: { timeoutMs?: number }) => Promise<PermissionResult>;
	start: (path: string) => void;
	stop: () => Promise<number>;
	level: () => number;
	elapsed: () => number;
	isRecording: () => boolean;
}

const unavailable = (reason: string): Recorder => ({
	available: false,
	reason,
	authStatus: () => 'restricted',
	requestPermission: async () => 'restricted',
	start() {
		throw new Error(reason);
	},
	stop: async () => 0,
	level: () => 0,
	elapsed: () => 0,
	isRecording: () => false
});

let promise: Promise<Recorder> | null = null;
let result: Recorder | null = null;

/** Memoized; never rejects — failure is `{ available: false, reason }`. */
export function init_recorder(): Promise<Recorder> {
	return (promise ??= build().then((r) => (result = r)));
}

export function recorder_available(): { ok: boolean; reason?: string } {
	if (result) return result.available ? { ok: true } : { ok: false, reason: result.reason };
	return { ok: false, reason: promise ? 'microphone shim still loading' : 'microphone shim not initialised' };
}

async function build(): Promise<Recorder> {
	if (process.platform !== 'darwin') return unavailable(`recording needs macOS (AVFoundation); not available on ${process.platform}`);
	if (process.env.GPUIX_BRAIN_RECORDER === '0') return unavailable('microphone shim disabled by GPUIX_BRAIN_RECORDER=0');
	if (!process.versions.bun) return unavailable('recording needs Bun (bun:ffi)');

	try {
		if (RESOURCES) {
			if (!existsSync(DYLIB)) throw new Error('the app bundle has no recorder shim');
		} else if (!existsSync(DYLIB) || statSync(DYLIB).mtimeMs < statSync(SRC).mtimeMs) {
			const clang = Bun.spawnSync(['clang', ...CLANG_ARGS, '-o', DYLIB, SRC], { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' });
			if (clang.exitCode !== 0) {
				throw new Error(`clang failed (install the Xcode command line tools): ${clang.stderr.toString().trim().split('\n').pop()}`);
			}
		}

		const { dlopen } = await import('bun:ffi');
		const lib = dlopen(DYLIB, {
			substrate_rec_auth_status: { args: [], returns: 'i32' },
			substrate_rec_request_permission: { args: [], returns: 'i32' },
			substrate_rec_start: { args: ['cstring'], returns: 'i32' },
			substrate_rec_stop: { args: [], returns: 'f64' },
			substrate_rec_is_recording: { args: [], returns: 'i32' },
			substrate_rec_current_time: { args: [], returns: 'f64' },
			substrate_rec_level: { args: [], returns: 'f64' },
			substrate_rec_last_error: { args: [], returns: 'cstring' }
		});
		const s = lib.symbols;
		let current: string | null = null;

		on_exit(() => {
			if (s.substrate_rec_is_recording()) s.substrate_rec_stop();
		});

		return {
			available: true,
			authStatus: () => STATUS[s.substrate_rec_auth_status()] ?? 'restricted',

			// The prompt is drawn on the run loop the frame loop pumps, so polling is
			// the only way to wait for it.
			async requestPermission({ timeoutMs = 120_000 } = {}) {
				let status = s.substrate_rec_request_permission();
				const until = Date.now() + timeoutMs;
				while (status === 0 && Date.now() < until) {
					await new Promise((r) => setTimeout(r, 250));
					status = s.substrate_rec_auth_status();
				}
				return status === 0 ? 'timeout' : (STATUS[status] as PermissionResult);
			},

			start(path: string) {
				const status = STATUS[s.substrate_rec_auth_status()];
				if (status !== 'authorized') {
					throw new Error(status === 'notDetermined' ? 'microphone permission not granted yet' : `microphone access ${status} — ${HINT}`);
				}
				mkdirSync(dirname(path), { recursive: true });
				const code = s.substrate_rec_start(path);
				if (code !== 0) throw new Error(`${s.substrate_rec_last_error()} — ${HINT}`);
				current = path;
			},

			async stop() {
				const seconds = s.substrate_rec_stop();
				const path = current;
				current = null;
				// The header is finalised by stop(); give the file system a beat to agree.
				for (let i = 0; i < 10 && path; i++) {
					if ((await wav_duration(path)) > 0) break;
					await new Promise((r) => setTimeout(r, 50));
				}
				return seconds;
			},

			level: () => Math.max(0, Math.min(1, (s.substrate_rec_level() + 60) / 60)),
			elapsed: () => s.substrate_rec_current_time(),
			isRecording: () => s.substrate_rec_is_recording() === 1
		};
	} catch (err) {
		warn('recorder unavailable:', (err as Error).message);
		return unavailable((err as Error).message);
	}
}
