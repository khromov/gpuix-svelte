import type { Settings } from './settings.ts';

const state = $state({ on: true });

// A plain function rather than an exported $derived: a module cannot export one,
// and a function that reads $state is tracked wherever it is called.
export const include_feeds = () => state.on;

let persist: ((on: boolean) => void) | null = null;

export function bind_feeds(app: { settings: Pick<Settings, 'get' | 'set'> }) {
	state.on = app.settings.get('feeds.include') !== false;
	persist = (on) => app.settings.set('feeds.include', on);
}

export function set_include_feeds(on: boolean) {
	state.on = on;
	persist?.(on);
}
