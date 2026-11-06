import type { GpuixTheme } from 'gpuix-svelte';

/** The docs site's palette, like the other examples; handed to every `<code>` and `<markdown>`. */
export const THEME: GpuixTheme = {
	appearance: 'dark',
	bg: '#111111',
	border: '#242424',
	text: '#d4d4d4',
	textMuted: '#a1a1a1',
	textFaint: '#8f8f8f',
	accent: '#ff8a5c',
	caret: '#ededed',
	codeText: '#ededed',
	codeWash: '#1c1c1c',
	syntax: {
		comment: '#8f8f8f',
		keyword: '#e9a5c7',
		string: '#abd09f',
		stringSpecial: '#e1c398',
		escape: '#e1c398',
		number: '#94bff0',
		boolean: '#94bff0',
		constant: '#94bff0',
		function: '#c1b1f1',
		functionBuiltin: '#c1b1f1',
		typeName: '#97cdd8',
		typeBuiltin: '#97cdd8',
		// Named, or the literal's inherited Object.prototype.constructor fails SyntaxTheme's `constructor?: string`.
		constructor: '#97cdd8',
		property: '#e1c398',
		variable: '#d4d4d4',
		parameter: '#e1c398',
		operator: '#a1a1a1',
		punctuation: '#a1a1a1',
		tag: '#97cdd8',
		attribute: '#e1c398'
	},
	metrics: {
		codeTextSize: 12,
		codeLineHeight: 18,
		mdTextSize: 13,
		mdLineHeight: 20,
		mdBlockGap: 10,
		mdHeadingSizes: [18, 15, 14, 13],
		mdHeadingLineHeights: [26, 22, 20, 20]
	}
};
