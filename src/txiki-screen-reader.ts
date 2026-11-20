const env = globalThis.process?.env ?? {};

export function voiceover_running(_now: number): boolean {
	void _now;
	const host = (globalThis as unknown as { gpuixHost?: { isVoiceOverRunning?: () => boolean; isScreenReaderRunning?: () => boolean } }).gpuixHost;
	if (typeof host?.isVoiceOverRunning === 'function') return host.isVoiceOverRunning();
	if (typeof host?.isScreenReaderRunning === 'function') return host.isScreenReaderRunning();
	if (Boolean((globalThis as unknown as { __gpuixVoiceOver?: boolean; __gpuixScreenReader?: boolean }).__gpuixVoiceOver ?? (globalThis as unknown as { __gpuixScreenReader?: boolean }).__gpuixScreenReader)) return true;
	return env.VOICEOVER === '1' || env.VOICEOVER === 'true' || env.ACCESSIBILITY_ENABLED === '1' || env.ACCESSIBILITY_ENABLED === 'true';
}
