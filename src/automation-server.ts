/**
 * The live end of `gpuix-svelte/automation`: upstream's SSE protocol on stdin/stdout,
 * answered by the window's own `GpuixRenderer`. `render()` loads it only under
 * `GPUIX_AUTOMATION=1`, so neither the app path nor the web bundle carries it.
 */

import type { GpuixRenderer } from '@gpuix/native';
import {
	InProcessBackend,
	createSseDecoder,
	encodeSse,
	handleAutomationRequest,
	liveRendererAsTest,
	type AutomationBackend,
	type MethodName,
	type ParamsOf,
	type ResultOf
} from '@gpuix/native/automation';

const INPUTS = new Set<MethodName>([
	'click',
	'mouseDown',
	'mouseUp',
	'mouseMove',
	'scrollWheel',
	'keystrokes',
	'keyDown',
	'keyUp',
	'focus',
	'blur',
	'scrollTo',
	'clearSelection',
	'clockSet',
	'clockFastForward'
]);

export function serve_automation(native: GpuixRenderer, next_frame: () => Promise<void>) {
	// liveRendererAsTest ticks synchronously after every input; without `tick` the frame loop alone paints.
	const view = new Proxy(native, {
		get(target, key) {
			if (key === 'tick') return undefined;
			const value: unknown = Reflect.get(target, key);
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});
	const backend = frame_synced(new InProcessBackend(liveRendererAsTest(view)), native, next_frame);

	let pending: Promise<unknown> = Promise.resolve();
	const reply = (frame: Promise<string>) => {
		pending = Promise.allSettled([pending, frame.then((text) => process.stdout.write(text))]).then(() => {});
	};
	const decoder = createSseDecoder(
		(message) => {
			if ('method' in message) reply(handleAutomationRequest(message, backend));
		},
		// Upstream's serveAutomationStdio drops what it cannot parse, leaving a hand-written driver waiting forever.
		(raw, error) => {
			const id = id_in(raw);
			const message = error instanceof Error ? error.message : String(error);
			if (id !== null) reply(Promise.resolve(encodeSse({ id, error: { code: 'Protocol', message } })));
		}
	);
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', (chunk: string) => decoder.feed(chunk));
	// A piped script closes stdin as soon as it has written, so answer what is in flight first.
	process.stdin.on('end', () => void pending.then(() => process.stdout.write('', () => process.exit(0))));
}

function id_in(raw: string): number | null {
	try {
		const id: unknown = (JSON.parse(raw) as { id?: unknown } | null)?.id;
		return Number.isInteger(id) ? (id as number) : null;
	} catch {
		return null;
	}
}

/**
 * One request at a time, and an input replies only once its effect is laid out, so
 * a `getTree` sent after a `click`, pipelined or not, reads the clicked state.
 */
export function frame_synced(
	inner: AutomationBackend,
	native: Pick<GpuixRenderer, 'getWindowSize'>,
	next_frame: () => Promise<void>
): AutomationBackend {
	let queue: Promise<unknown> = Promise.resolve();

	return {
		call<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
			const run = async () => {
				const result = await inner.call(method, params);
				if (INPUTS.has(method)) {
					// The napi callback carrying the event lands on a later loop turn, before or after
					// the next tick depending on phase, so it has committed by the end of the second.
					await next_frame();
					await next_frame();
				}
				// Upstream reports a fixed 800×600 outside a browser.
				return (method === 'initialize' ? { ...result, window: native.getWindowSize() } : result) as ResultOf<M>;
			};
			const reply = queue.then(run);
			queue = reply.catch(() => {});
			return reply;
		},
		close: () => inner.close()
	};
}
