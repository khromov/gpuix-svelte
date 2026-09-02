import { forced, system_appearance, watch_appearance } from './appearance.ts';
import type { Appearance } from './appearance.ts';
import type { Settings } from './settings.ts';
import { DARK, LIGHT, MD_THEME } from './theme.ts';

export type ThemeMode = 'system' | 'light' | 'dark';

export const theme = $state<{ mode: ThemeMode; system: Appearance }>({ mode: 'system', system: system_appearance() });

// Plain functions rather than exported $deriveds: a module cannot export a derived,
// and a function that reads $state is tracked wherever it is called.
export const resolved = (): Appearance => (theme.mode === 'system' ? theme.system : theme.mode);
export const tokens = () => (resolved() === 'dark' ? DARK : LIGHT);
export const md_theme = () => MD_THEME[resolved()];

let persist: ((mode: ThemeMode) => void) | null = null;
let stop: (() => void) | null = null;

export function bind_theme(app: { settings: Pick<Settings, 'get' | 'set'> }) {
	theme.mode = forced() ?? app.settings.get('theme.mode') ?? 'system';
	persist = (mode) => app.settings.set('theme.mode', mode);
}

export function set_mode(mode: ThemeMode) {
	theme.mode = mode;
	persist?.(mode);
}

/** Idempotent, so a hot remount does not start a second poll. */
export function start_system_poll(): () => void {
	if (!stop) {
		stop = watch_appearance((mode) => {
			theme.system = mode;
		});
	}
	return () => {};
}
