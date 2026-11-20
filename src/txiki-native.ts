import type { EventPayload, PathPromptOptions } from '@gpuix/native';
import { handle_back } from './back.ts';

declare global {
	var __gpuixCall: (request: string) => string;
}

function call<T = unknown>(method: string, ...args: unknown[]): T {
	const reply = JSON.parse(globalThis.__gpuixCall(JSON.stringify({ method, args })));
	if (reply.closed && method === 'tick') return { running: false, events: [] } as T;
	if (reply.closed || reply.error) throw new Error(reply.error ?? 'GPUI session closed');
	return reply.value;
}

Object.assign(globalThis, {
	gpuixHost: {
		...(globalThis as unknown as { gpuixHost?: object }).gpuixHost,
		openUrl: (url: string) => call('openUrl', url),
		readClipboardText: () => call<string | null>('readClipboardText'),
		writeClipboardText: (text: string) => call('writeClipboardText', text)
	}
});

export const isTerminal = () => false;
export const hasTestGpuixRenderer = () => false;

let next_prompt = 0;
let next_upload = 0;

const MAX_UPLOAD = 32 * 1024 * 1024;
function upload<T = void>(bytes: Uint8Array, kind: string, ...args: unknown[]): T {
	if (bytes.byteLength > MAX_UPLOAD) throw new RangeError('Mobile upload exceeds 32 MiB');
	const id = ++next_upload;
	call('beginUpload', id, bytes.byteLength);
	try {
		for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
			call('uploadChunk', id, Array.from(bytes.subarray(offset, offset + 64 * 1024)));
		}
		return call<T>('finishUpload', id, kind, ...args);
	} catch (error) {
		try { call('cancelUpload', id); } catch { /* Keep the original upload error if the session closed. */ }
		throw error;
	}
}

export class GpuixRenderer {
	private callback: (error: null, event: EventPayload) => void;
	constructor(callback: (error: null, event: EventPayload) => void) { this.callback = callback; }
	init(options?: { autoInsets?: boolean }) {
		call('setAutoInsets', options?.autoInsets !== false);
		call('init', options ?? null);
	}
	isInitialized(): boolean { return call('isInitialized'); }
	applyBatch(json: string): number[] {
		const request = JSON.stringify({ method: 'applyBatch', args: [json] });
		if (request.length < 2 * 1024 * 1024) return call<number[]>('applyBatch', json);
		if (json.length > MAX_UPLOAD) throw new Error('Failed to parse batch: mobile batch exceeds 32 MiB');
		const bytes = new TextEncoder().encode(json);
		if (bytes.byteLength > MAX_UPLOAD) throw new Error('Failed to parse batch: mobile batch exceeds 32 MiB');
		return upload<number[]>(bytes, 'batch');
	}
	requiresTick() { return true; }
	setFrameWakeCallback() { return false; }
	tick(): boolean {
		const { running, events, back } = call<{ running: boolean; events: EventPayload[]; back?: boolean }>('tick');
		for (const event of events) this.callback(null, event);
		if (back && !handle_back()) call('finishBack');
		return running;
	}
	getWindowSize() { return call('getWindowSize'); }
	getWindowInsets() { return call('getWindowInsets'); }
	setWindowKeyEvents(down: boolean, up: boolean, id: number) { call('setWindowKeyEvents', down, up, id); }
	setWindowSelectionChange(enabled: boolean, id: number) { call('setWindowSelectionChange', enabled, id); }
	getFocusedElementId() { return call('getFocusedElementId'); }
	focusElement(id: number) { call('focusElement', id); }
	focusNext() { call('focusNext'); }
	focusPrevious() { call('focusPrevious'); }
	focusNextWithin(id: number) { call('focusNextWithin', id); }
	focusPreviousWithin(id: number) { call('focusPreviousWithin', id); }
	blur() { call('blur'); }
	getElementBounds(id: number) { return call('getElementBounds', id); }
	getElementsAt(x: number, y: number) { return call('getElementsAt', x, y); }
	getAutomationTree() { return call('getAutomationTree'); }
	getSelectedText() { return call('getSelectedText'); }
	clearSelection() { call('clearSelection'); }
	scrollTo(id: number, x: number, y: number) { call('scrollTo', id, x, y); }
	getScrollOffset(id: number) { return call('getScrollOffset', id); }
	scrollIntoView(id: number) { call('scrollIntoView', id); }
	scrollToItem(id: number, index: number, offset?: number) { call('scrollToItem', id, index, offset ?? null); }
	getListScrollTop(id: number) { return call('getListScrollTop', id); }
	async promptForPaths(options?: PathPromptOptions | null): Promise<string[] | null> {
		const id = ++next_prompt;
		call('beginPrompt', id, options ?? null);
		for (;;) {
			const result = call<{ done: boolean; value?: string[] | null }>('pollPrompt', id);
			if (result.done) return result.value ?? null;
			await new Promise(resolve => setTimeout(resolve, 50));
		}
	}
	setImage(id: number, bytes: Uint8Array) { upload(bytes, 'image', id); }
	setImagePixels(id: number, width: number, height: number, pixels: Uint8Array, format?: string | null) { upload(pixels, 'pixels', id, width, height, format ?? null); }
	registerFont(bytes: Uint8Array) { upload(bytes, 'font'); }
	setWindowTitle(title: string) { call('setWindowTitle', title); }
	activateWindow() { call('activateWindow'); }
	setDebugFrameOverlay(mode: string) { return call('setDebugFrameOverlay', mode); }
	cycleDebugFrameOverlay() { return call('cycleDebugFrameOverlay'); }
	getDebugFrameOverlay() { return call('getDebugFrameOverlay'); }
	resetDebugFrameOverlayStats() { call('resetDebugFrameOverlayStats'); }
	getDebugFrameOverlayStats() { return call('getDebugFrameOverlayStats'); }
}
