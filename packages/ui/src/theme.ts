/**
 * The palette behind every component, as `--ui-*` tokens. One `apply_theme()` call puts a palette in
 * force on either renderer: GPUI resolves the tokens when it styles, the browser as custom properties
 * on `:root`. The same call also sets the tokens gpuix-svelte's own Tooltip, Popover and Scroller read.
 */

import { set_css_vars } from 'gpuix-svelte';
import { createSubscriber } from 'svelte/reactivity';
import { MONO } from './shared.ts';

export interface Palette {
	appearance: 'dark' | 'light';
	/** The window or page. */
	bg: string;
	/** Cards, dialogs, fields. */
	panel: string;
	/** Badges, hovered rows, pressed surfaces. */
	raised: string;
	'raised-hover': string;
	border: string;
	'border-strong': string;
	/** Text. */
	ink: string;
	muted: string;
	accent: string;
	/** Accent-coloured text, legible on `bg`. */
	'accent-ink': string;
	/** A translucent accent, for selections and badges. */
	'accent-wash': string;
	'on-accent': string;
	success: string;
	'success-wash': string;
	warning: string;
	'warning-wash': string;
	danger: string;
	'danger-wash': string;
}

export const DARK: Palette = {
	appearance: 'dark',
	bg: '#000000',
	panel: '#111111',
	raised: '#1c1c1c',
	'raised-hover': '#262626',
	border: '#242424',
	'border-strong': '#404040',
	ink: '#ededed',
	muted: '#a1a1a1',
	accent: '#ff3e00',
	'accent-ink': '#ff8a5c',
	'accent-wash': '#ff3e0029',
	'on-accent': '#ffffff',
	success: '#4cc38a',
	'success-wash': '#4cc38a26',
	warning: '#f5a524',
	'warning-wash': '#f5a52426',
	danger: '#ff6166',
	'danger-wash': '#ff616626'
};

export const LIGHT: Palette = {
	appearance: 'light',
	bg: '#fafafa',
	panel: '#ffffff',
	raised: '#f0f0f0',
	'raised-hover': '#e4e4e4',
	border: '#e5e5e5',
	'border-strong': '#bdbdbd',
	ink: '#171717',
	muted: '#6b6b6b',
	accent: '#ff3e00',
	'accent-ink': '#c93400',
	'accent-wash': '#ff3e001f',
	'on-accent': '#ffffff',
	success: '#1f8a4c',
	'success-wash': '#1f8a4c1f',
	warning: '#b26a00',
	'warning-wash': '#f5a52433',
	danger: '#d92d2d',
	'danger-wash': '#d92d2d1f'
};

let active: Palette = DARK;
let notify = () => {};
const subscribe = createSubscriber((update) => {
	notify = update;
	return () => {
		notify = () => {};
	};
});

/** The palette in force, reactive: `TextField` reads it for the theme object GPUI's input takes instead of CSS. */
export const theme = {
	get palette(): Palette {
		subscribe();
		return active;
	},
	get dark(): boolean {
		subscribe();
		return active.appearance === 'dark';
	}
};

/** Every `--ui-*` token of a palette, plus the tokens gpuix-svelte's own components read. */
export function theme_vars(palette: Palette): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const [name, value] of Object.entries(palette)) {
		if (name !== 'appearance') vars[`ui-${name}`] = value;
	}
	vars['ui-mono'] = MONO;
	vars['tooltip-surface'] = palette.ink;
	vars['tooltip-ink'] = palette.bg;
	vars['popover-surface'] = palette.panel;
	vars['popover-border'] = palette['border-strong'];
	vars['popover-ink'] = palette.ink;
	vars['scroller-thumb'] = palette['border-strong'];
	vars['scroller-thumb-hover'] = palette.muted;
	return vars;
}

/** Puts a palette in force on both renderers; call it from an `$effect` at the root so a theme switch is one call. */
export function apply_theme(palette: Palette | 'dark' | 'light' = 'dark') {
	active = typeof palette === 'string' ? (palette === 'dark' ? DARK : LIGHT) : palette;
	set_css_vars(theme_vars(active));
	notify();
}

/** The same tokens as a `:root` rule, for a prerendered page to carry before any effect has run. */
export const theme_rule = (palette: Palette): string =>
	`:root{${Object.entries(theme_vars(palette))
		.map(([name, value]) => `--${name}:${value}`)
		.join(';')}}`;
