import { forced, system_appearance, watch_appearance } from './appearance.js';
import { DARK, LIGHT, MD_THEME } from './theme.js';

/** @type {{ mode: 'system' | 'light' | 'dark', system: 'light' | 'dark' }} */
export const theme = $state({ mode: 'system', system: system_appearance() });

// Plain functions rather than exported $deriveds: a module cannot export a derived,
// and a function that reads $state is tracked wherever it is called.
export const resolved = () => (theme.mode === 'system' ? theme.system : theme.mode);
export const tokens = () => (resolved() === 'dark' ? DARK : LIGHT);
export const md_theme = () => MD_THEME[resolved()];

let persist = null;
let stop = null;

/** @param {{ settings: { get: (k: string) => any, set: (k: string, v: any) => void } }} app */
export function bind_theme(app) {
	theme.mode = forced() ?? app.settings.get('theme.mode') ?? 'system';
	persist = (mode) => app.settings.set('theme.mode', mode);
}

export function set_mode(mode) {
	theme.mode = mode;
	persist?.(mode);
}

/** Idempotent, so a hot remount does not start a second poll. */
export function start_system_poll() {
	if (!stop) {
		stop = watch_appearance((mode) => {
			theme.system = mode;
		});
	}
	return () => {};
}
