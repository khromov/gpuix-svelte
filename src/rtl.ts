/**
 * Line breaking for `RtlText`: GPUI shapes and orders one right-to-left line correctly but wraps
 * one as if it ran left to right, so the component breaks the lines and GPUI draws each unwrapped.
 */

const OPENS_RTL = /^(?=\p{L})[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;

/** The words a browser breaks between under `white-space: normal`, so a no-break space or a ZWNJ stays inside its word. */
export function rtl_words(text: string): string[] {
	return text.split(/[ \t\n\r\f]+/).filter((word) => word !== '');
}

/** `words` broken greedily into lines no wider than `width`; `line` is `rtl_line(words)`'s measured width, which gives a space's. */
export function rtl_lines(words: readonly string[], widths: readonly number[], line: number, width: number): string[] {
	const space = (line - widths.reduce((sum, w) => sum + w, 0)) / (words.length - 1);
	const lines: string[][] = [];
	let used = 0;
	words.forEach((word, at) => {
		const last = lines.at(-1);
		if (last && used + space + widths[at] <= width) {
			last.push(word);
			used += space + widths[at];
		} else {
			lines.push([word]);
			used = widths[at];
		}
	});
	return lines.map(rtl_line);
}

/**
 * `words` on one line, to measure or to draw. GPUI takes a line's direction from its first letter and, on Linux,
 * drops a number that opens a right-to-left line, so one that does not open with such a letter gets a right-to-left mark.
 */
export function rtl_line(words: readonly string[]): string {
	const line = words.join(' ');
	return OPENS_RTL.test(line) ? line : `\u200F${line}`;
}
