/**
 * Windows has no AVFoundation, and no C compiler is guaranteed either — so capture goes
 * straight to winmm over bun:ffi. WAVE_MAPPER converts for us, which means the file lands
 * as the 16 kHz mono PCM `wav_info().ok` wants and ingest needs no sidecar.
 */

import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FileSink } from 'bun';
import { on_exit } from './lifecycle.ts';
import { warn } from './log.ts';
import type { AuthStatus, PermissionResult, Recorder } from './recorder.ts';
import { build_wav_header, WAV_HEADER_SIZE } from './wav.ts';
import { CALLBACK_NULL, MMSYSERR_NOERROR, open_handle, WAVE_MAPPER, WAVEHDR_SIZE, WaveHeaders, wave_format, mm_error, winmm } from './winmm.ts';

const RATE = 16000;
const CHANNELS = 1;
const BYTES_PER_SECOND = RATE * CHANNELS * 2;

/**
 * 1.6 s of ring against a 100 ms drain. The drain shares one thread with GPUI's frame loop
 * and with whole-file wasm work that runs while a recording is live (encode_mp3 compacting
 * the previous memo, prepare_pcm's per-sample loops, blobs.file()'s synchronous write), so
 * a few hundred milliseconds of headroom would not survive them.
 */
const BUFFERS = 8;
const BUFFER_BYTES = BYTES_PER_SECOND / 5;
const DRAIN_MS = 100;

const CONSENT = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';

/**
 * The three keys that gate a desktop app, most restrictive first to last: the master
 * toggle, "let desktop apps access your microphone", and the per-executable entry. Reading
 * only the first is a silent-failure path — waveInOpen still succeeds and records silence.
 */
const consent_keys = () => [CONSENT, `${CONSENT}\\NonPackaged`, `${CONSENT}\\NonPackaged\\${process.execPath.replace(/\\/g, '#')}`];

/**
 * `reg query … /v Value` output, one per key. An absent key means inherit, so the default
 * — and anything unparsed — is `authorized`: `notDetermined` would make `start()` refuse on
 * a machine that never had a reason to write these keys at all.
 */
export function parse_mic_consent(...outputs: string[]): AuthStatus {
	return outputs.some((out) => /Value\s+REG_SZ\s+Deny/i.test(out ?? '')) ? 'denied' : 'authorized';
}

function read_consent_sync(): AuthStatus {
	return parse_mic_consent(
		...consent_keys().map((key) => {
			try {
				return Bun.spawnSync(['reg', 'query', key, '/v', 'Value'], { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' }).stdout.toString();
			} catch {
				return '';
			}
		})
	);
}

async function read_consent(): Promise<AuthStatus> {
	const outputs = await Promise.all(
		consent_keys().map(async (key) => {
			try {
				const proc = Bun.spawn(['reg', 'query', key, '/v', 'Value'], { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' });
				const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
				return stdout;
			} catch {
				return '';
			}
		})
	);
	return parse_mic_consent(...outputs);
}

/** Rewrites the placeholder header now that the total is known. */
function finalise(file: string, dataLength: number) {
	try {
		const fd = openSync(file, 'r+');
		try {
			writeSync(fd, build_wav_header(dataLength, RATE, CHANNELS), 0, WAV_HEADER_SIZE, 0);
		} finally {
			closeSync(fd);
		}
	} catch (err) {
		// wav_header repairs a zero-length data chunk from the file size, so this is cosmetic.
		warn('could not finalise the WAV header:', (err as Error).message);
	}
}

export function build_windows_recorder(hint: string): Recorder {
	const s = winmm().symbols;
	if (s.waveInGetNumDevs() === 0) {
		throw new Error('no microphone found — check Settings → Privacy & security → Microphone, or turn on audio recording if this is a Remote Desktop session');
	}

	const format = wave_format(RATE, CHANNELS);
	const headers = new WaveHeaders(BUFFERS, BUFFER_BYTES);

	let status = read_consent_sync();
	let handle: bigint | null = null;
	let sink: FileSink | null = null;
	let file: string | null = null;
	let recorded = 0;
	let started = 0;
	let level = 0;
	let peak = 0;
	let timer: ReturnType<typeof setInterval> | null = null;

	// The same dBFS window AVAudioRecorder's averagePower feeds, so the meter matches macOS.
	function measure(chunk: Uint8Array) {
		const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
		const frames = chunk.byteLength >> 1;
		let square = 0;
		for (let i = 0; i < frames; i++) {
			const sample = view.getInt16(i * 2, true);
			square += sample * sample;
			if (Math.abs(sample) > peak) peak = Math.abs(sample);
		}
		const rms = frames > 0 ? Math.sqrt(square / frames) / 32768 : 0;
		level = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(rms, 1e-8)) + 60) / 60));
	}

	function drain(last = false) {
		if (handle === null) return;
		let filled = 0;
		for (let i = 0; i < BUFFERS; i++) {
			if (!headers.done(i)) continue;
			filled++;
			if (headers.recorded(i) > 0) {
				const chunk = headers.chunk(i);
				recorded += chunk.byteLength;
				sink?.write(chunk.slice());
				measure(chunk);
			}
			// On the last pass release() unprepares everything, so only the requeue path does.
			if (last) continue;
			s.waveInUnprepareHeader(handle, headers.ptr(i), WAVEHDR_SIZE);
			headers.clear(i);
			s.waveInPrepareHeader(handle, headers.ptr(i), WAVEHDR_SIZE);
			s.waveInAddBuffer(handle, headers.ptr(i), WAVEHDR_SIZE);
		}
		// Nowhere left for the driver to write means the drain was starved and audio was lost.
		if (!last && filled === BUFFERS) warn(`recording dropped audio: all ${BUFFERS} buffers came back at once`);
	}

	// waveInClose refuses a device that still holds a prepared header, so every one goes back
	// unconditionally rather than only the ones the last drain happened to see.
	function release() {
		if (handle === null) return;
		s.waveInStop(handle);
		s.waveInReset(handle);
		for (let i = 0; i < BUFFERS; i++) s.waveInUnprepareHeader(handle, headers.ptr(i), WAVEHDR_SIZE);
		s.waveInClose(handle);
		handle = null;
	}

	// The driver writes into JS-owned pages from its own thread, so it must be told to stop
	// before this process goes away.
	on_exit(() => {
		if (timer) clearInterval(timer);
		if (handle === null) return;
		release();
		try {
			sink?.flush();
		} catch {
			// A truncated tail still decodes; wav_header repairs the length from the file size.
		}
	});

	return {
		available: true,
		authStatus: () => status,

		// Windows shows no runtime prompt for a desktop app, so this only refreshes what the
		// consent store says.
		async requestPermission() {
			status = await read_consent();
			return status as PermissionResult;
		},

		start(path: string) {
			if (handle !== null) throw new Error('already recording');
			if (status !== 'authorized') throw new Error(`microphone access ${status} — ${hint}`);
			mkdirSync(dirname(path), { recursive: true });

			const opened = open_handle((out) => s.waveInOpen(out, WAVE_MAPPER, format, 0n, 0n, CALLBACK_NULL));
			if (opened.rc !== MMSYSERR_NOERROR) throw new Error(`could not open the microphone: ${mm_error(opened.rc)} — ${hint}`);
			handle = opened.handle;

			try {
				for (let i = 0; i < BUFFERS; i++) {
					headers.clear(i);
					const rc = s.waveInPrepareHeader(handle, headers.ptr(i), WAVEHDR_SIZE) || s.waveInAddBuffer(handle, headers.ptr(i), WAVEHDR_SIZE);
					if (rc !== MMSYSERR_NOERROR) throw new Error(`could not queue a capture buffer: ${mm_error(rc)}`);
				}
				const rc = s.waveInStart(handle);
				if (rc !== MMSYSERR_NOERROR) throw new Error(`could not start recording: ${mm_error(rc)}`);
			} catch (err) {
				release();
				throw err;
			}

			sink = Bun.file(path).writer();
			sink.write(build_wav_header(0, RATE, CHANNELS));
			file = path;
			recorded = 0;
			peak = 0;
			level = 0;
			started = Date.now();
			timer = setInterval(drain, DRAIN_MS);
		},

		async stop() {
			if (timer) clearInterval(timer);
			timer = null;
			if (handle === null) return 0;

			s.waveInStop(handle);
			// reset() hands back every queued buffer with its partial dwBytesRecorded, which is
			// how the tail since the last drain is kept.
			s.waveInReset(handle);
			drain(true);
			release();

			const path = file;
			file = null;
			level = 0;
			await sink?.end();
			sink = null;
			if (path) finalise(path, recorded);
			return recorded / BYTES_PER_SECOND;
		},

		level: () => level,
		elapsed: () => (handle === null ? 0 : (Date.now() - started) / 1000),
		isRecording: () => handle !== null,
		peak: () => peak / 32768
	};
}
