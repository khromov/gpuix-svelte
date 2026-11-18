/**
 * What both result frames share: they announce themselves, import the compiled module the page
 * posts and hand its component to `run`, and report console output and errors back.
 */

/** GPUI's default box plus a background and a text colour, since GPUI draws black text on an unpainted window. */
export const ROOT_STYLE = { display: 'flex', width: '100%', height: '100%', position: 'relative', backgroundColor: '#000000', color: '#ededed' };

export const post =(message: Record<string, unknown>) => parent.postMessage({ playground: true, ...message }, location.origin);

const text_of = (value: unknown): string => {
	if (value instanceof Error) return value.message;
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
};

/** `render()` logs each mount and GPUI its graphics setup, which is noise beside a component's own output. */
const LIFECYCLE = /^\[gpuix-svelte\] (created native window|mount complete|remount complete)$|^\[(INFO|DEBUG|TRACE)\] gpui/;

export function forward_console() {
	for (const level of ['log', 'info', 'warn', 'error'] as const) {
		const original = console[level].bind(console);
		console[level] = (...args: unknown[]) => {
			original(...args);
			const text = args.map(text_of).join(' ');
			if (!LIFECYCLE.test(text)) post({ type: 'console', level, text });
		};
	}
	window.addEventListener('error', (event) => post({ type: 'error', text: text_of(event.error ?? event.message) }));
	window.addEventListener('unhandledrejection', (event) => post({ type: 'error', text: text_of(event.reason) }));
}

/** `loading` is told when a module is about to be imported and when its run is over, mounted or not. */
export function connect(run: (component: unknown) => void, loading: (pending: boolean) => void = () => {}) {
	addEventListener('message', async (event) => {
		if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'run') return;
		const id: unknown = event.data.id;
		const url = URL.createObjectURL(new Blob([String(event.data.code)], { type: 'text/javascript' }));
		try {
			loading(true);
			const module = (await import(/* @vite-ignore */ url)) as { default: unknown };
			run(module.default);
			post({ type: 'mounted', id });
		} catch (error) {
			post({ type: 'error', id, text: text_of(error) });
		} finally {
			loading(false);
			URL.revokeObjectURL(url);
		}
	});
	post({ type: 'ready' });
}
