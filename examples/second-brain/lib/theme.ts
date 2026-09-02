/**
 * The palette. `App.svelte` hands the active one to `set_css_vars`, so a component's
 * `<style>` reads `var(--surface)` and a theme switch is one restyle; this is also
 * the source for the markdown theme.
 */

export const LIGHT = {
	appearance: 'light',
	bg: '#f5efe4',
	surface: '#fbf7ef',
	raised: '#ffffff',
	sunken: '#ece4d4',
	well: '#ece4d4',
	sidebar: '#f1ebdf',
	control: '#fbf7ef',
	controlHover: '#ffffff',
	field: '#ffffff',
	focusSurface: '#ffffff',
	border: '#e2d8c4',
	borderStrong: '#cbbfa6',
	borderHover: '#b3a488',
	divider: '#e2d8c4',
	ink: '#2a251f',
	inkMuted: '#6b6154',
	inkFaint: '#9b9080',
	accent: '#5f7a4a',
	accentInk: '#f8f5ec',
	accentSoft: '#e2e9d6',
	accentHover: '#526a3f',
	accentDeep: '#3f5a30',
	ochre: '#b8822b',
	ochreInk: '#9a6a1f',
	ochreSoft: '#f1e3c6',
	danger: '#a9483a',
	dangerInk: '#fbf7ef',
	dangerSoft: '#f3dcd6',
	dangerHover: '#8f3c30',
	dangerBorder: '#d9a196',
	dangerWash: 'rgba(169, 72, 58, 0.2)',
	info: '#4f6b8a',
	infoSoft: '#dce6ef',
	plum: '#7a5878',
	plumSoft: '#ede0ec',
	plumBorder: '#d9c4d8',
	teal: '#3f7a75',
	tealSoft: '#d9ebe9',
	hover: 'rgba(42, 37, 31, 0.05)',
	hoverStrong: 'rgba(42, 37, 31, 0.07)',
	active: 'rgba(42, 37, 31, 0.09)',
	selection: 'rgba(95, 122, 74, 0.28)',
	scrim: 'rgba(42, 37, 31, 0.42)',
	'scroller-thumb': '#cbbfa6',
	'scroller-thumb-hover': '#b3a488'
};

export type Palette = typeof LIGHT;

export const DARK: Palette = {
	appearance: 'dark',
	bg: '#1b1815',
	surface: '#231f1b',
	raised: '#2b2621',
	sunken: '#151210',
	well: '#36302a',
	sidebar: '#171411',
	control: '#2b2621',
	controlHover: '#36302a',
	field: '#151210',
	focusSurface: '#231f1b',
	border: '#36302a',
	borderStrong: '#4a4237',
	borderHover: '#5d5447',
	divider: '#2b2621',
	ink: '#ece3d3',
	inkMuted: '#b2a791',
	inkFaint: '#7b7163',
	accent: '#8fae74',
	accentInk: '#1b1815',
	accentSoft: '#2e3927',
	accentHover: '#a3c088',
	accentDeep: '#b7d19f',
	ochre: '#d9a34a',
	ochreInk: '#d9a34a',
	ochreSoft: '#3a2e1b',
	danger: '#d46f5e',
	dangerInk: '#1b1815',
	dangerSoft: '#3c2521',
	dangerHover: '#e08272',
	dangerBorder: '#7a4137',
	dangerWash: 'rgba(212, 111, 94, 0.2)',
	info: '#87a4c3',
	infoSoft: '#26313d',
	plum: '#b48ab0',
	plumSoft: '#352a36',
	plumBorder: '#5a4459',
	teal: '#6fb3ad',
	tealSoft: '#1f3634',
	hover: 'rgba(236, 227, 211, 0.06)',
	hoverStrong: 'rgba(236, 227, 211, 0.08)',
	active: 'rgba(236, 227, 211, 0.10)',
	selection: 'rgba(143, 174, 116, 0.32)',
	scrim: 'rgba(0, 0, 0, 0.55)',
	'scroller-thumb': '#4a4237',
	'scroller-thumb-hover': '#5d5447'
};

export const KIND_COLOR = {
	light: { text: LIGHT.ochre, link: LIGHT.info, image: LIGHT.plum, audio: LIGHT.teal },
	dark: { text: DARK.ochre, link: DARK.info, image: DARK.plum, audio: DARK.teal }
};

export const FONT = { sans: 'IBM Plex Sans', mono: 'Lilex' };

function md(t: Palette) {
	return {
		appearance: t.appearance,
		bg: t.surface,
		border: t.border,
		text: t.ink,
		textMuted: t.inkMuted,
		textFaint: t.inkFaint,
		textDim: t.inkFaint,
		accent: t.accent,
		caret: t.accent,
		codeText: t.ink,
		codeWash: t.sunken,
		diffAdd: t.accentSoft,
		diffDel: t.dangerSoft,
		diffHunkBg: t.sunken,
		fontSans: FONT.sans,
		fontMono: FONT.mono,
		syntax: {
			comment: t.inkFaint,
			keyword: t.plum,
			string: t.accent,
			stringSpecial: t.accent,
			escape: t.ochre,
			number: t.ochre,
			boolean: t.ochre,
			constant: t.ochre,
			typeName: t.info,
			typeBuiltin: t.info,
			constructor: t.info,
			function: t.info,
			functionBuiltin: t.info,
			macroName: t.plum,
			property: t.teal,
			variable: t.ink,
			variableSpecial: t.danger,
			parameter: t.ink,
			operator: t.inkMuted,
			punctuation: t.inkFaint,
			tag: t.info,
			attribute: t.ochre,
			label: t.plum,
			invalid: t.danger
		},
		metrics: {
			mdTextSize: 14,
			mdLineHeight: 22,
			mdBlockGap: 12,
			mdHeadingSizes: [22, 18, 16, 14],
			mdHeadingLineHeights: [30, 26, 22, 21],
			mdInlineCodeRadius: 4,
			mdCodeRadius: 6,
			codeTextSize: 12,
			codeLineHeight: 18
		}
	};
}

/** Built once per mode, so `<markdown>` sees a stable object identity. */
export const MD_THEME = { light: md(LIGHT), dark: md(DARK) };
