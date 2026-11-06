// rustyscript puts the host's registered closures on a global; this is the typed door to them.
interface Rustyscript {
	functions: {
		rust_handle(msg: string): string;
		rust_poll(): string[];
	};
}

export const rust = (globalThis as unknown as { rustyscript: Rustyscript }).rustyscript;
