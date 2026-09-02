/**
 * The palette. Components carry the same hex values in their `<style>` blocks as
 * `.light` / `.dark` class variants — class rules are compiled and cannot read
 * these — so this file is the reference, and the source for the markdown theme.
 */

export const LIGHT = {
	appearance: 'light',
	bg: '#f5efe4',
	surface: '#fbf7ef',
	raised: '#ffffff',
	sunken: '#ece4d4',
	border: '#e2d8c4',
	borderStrong: '#cbbfa6',
	ink: '#2a251f',
	inkMuted: '#6b6154',
	inkFaint: '#9b9080',
	accent: '#5f7a4a',
	accentInk: '#f8f5ec',
	accentSoft: '#e2e9d6',
	accentHover: '#526a3f',
	ochre: '#b8822b',
	ochreSoft: '#f1e3c6',
	danger: '#a9483a',
	dangerSoft: '#f3dcd6',
	info: '#4f6b8a',
	plum: '#7a5878',
	teal: '#3f7a75',
	hover: 'rgba(42, 37, 31, 0.05)',
	active: 'rgba(42, 37, 31, 0.09)',
	selection: 'rgba(95, 122, 74, 0.28)',
	scrim: 'rgba(42, 37, 31, 0.42)',
	thumb: '#cbbfa6',
	thumbHover: '#b3a488'
};

export const DARK = {
	appearance: 'dark',
	bg: '#1b1815',
	surface: '#231f1b',
	raised: '#2b2621',
	sunken: '#151210',
	border: '#36302a',
	borderStrong: '#4a4237',
	ink: '#ece3d3',
	inkMuted: '#b2a791',
	inkFaint: '#7b7163',
	accent: '#8fae74',
	accentInk: '#1b1815',
	accentSoft: '#2e3927',
	accentHover: '#a3c088',
	ochre: '#d9a34a',
	ochreSoft: '#3a2e1b',
	danger: '#d46f5e',
	dangerSoft: '#3c2521',
	info: '#87a4c3',
	plum: '#b48ab0',
	teal: '#6fb3ad',
	hover: 'rgba(236, 227, 211, 0.06)',
	active: 'rgba(236, 227, 211, 0.10)',
	selection: 'rgba(143, 174, 116, 0.32)',
	scrim: 'rgba(0, 0, 0, 0.55)',
	thumb: '#4a4237',
	thumbHover: '#5d5447'
};

export const KIND_COLOR = {
	light: { text: LIGHT.ochre, link: LIGHT.info, image: LIGHT.plum, audio: LIGHT.teal },
	dark: { text: DARK.ochre, link: DARK.info, image: DARK.plum, audio: DARK.teal }
};

export const FONT = { sans: 'IBM Plex Sans', mono: 'Lilex' };

function md(t) {
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
