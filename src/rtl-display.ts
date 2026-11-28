/**
 * GPUI's DirectWrite path draws a right-to-left run's glyphs from left to right in the order they were typed, so on
 * Windows `RtlText` hands it each line already in display order, each Arabic letter already in its joined form.
 */

import bidi_js, { type Bidi } from 'bidi-js';

// Node hands over bidi-js's CommonJS main, whose export is the factory itself; its types describe the ES build's default export.
const bidi_factory = bidi_js as unknown as () => Bidi;

/**
 * Each letter as `base:first form:count`, from UnicodeData.txt's <isolated>, <final>, <initial> and <medial> mappings,
 * whose forms run in that order from the first. Unicode adds no presentation forms any more.
 */
const TABLE = `
	621:fe80:1 622:fe81:2 623:fe83:2 624:fe85:2 625:fe87:2 626:fe89:4 627:fe8d:2 628:fe8f:4 629:fe93:2 62a:fe95:4
	62b:fe99:4 62c:fe9d:4 62d:fea1:4 62e:fea5:4 62f:fea9:2 630:feab:2 631:fead:2 632:feaf:2 633:feb1:4 634:feb5:4
	635:feb9:4 636:febd:4 637:fec1:4 638:fec5:4 639:fec9:4 63a:fecd:4 641:fed1:4 642:fed5:4 643:fed9:4 644:fedd:4
	645:fee1:4 646:fee5:4 647:fee9:4 648:feed:2 64a:fef1:4 671:fb50:2 677:fbdd:1 679:fb66:4 67a:fb5e:4 67b:fb52:4
	67e:fb56:4 67f:fb62:4 680:fb5a:4 683:fb76:4 684:fb72:4 686:fb7a:4 687:fb7e:4 688:fb88:2 68c:fb84:2 68d:fb82:2
	68e:fb86:2 691:fb8c:2 698:fb8a:2 6a4:fb6a:4 6a6:fb6e:4 6a9:fb8e:4 6ad:fbd3:4 6af:fb92:4 6b1:fb9a:4 6b3:fb96:4
	6ba:fb9e:2 6bb:fba0:4 6be:fbaa:4 6c0:fba4:2 6c1:fba6:4 6c5:fbe0:2 6c6:fbd9:2 6c7:fbd7:2 6c8:fbdb:2 6c9:fbe2:2
	6cb:fbde:2 6cc:fbfc:4 6d0:fbe4:4 6d2:fbae:2 6d3:fbb0:2
`;

const FORMS = new Map<number, readonly number[]>(
	TABLE.trim()
		.split(/\s+/)
		.map((entry) => {
			const [base, first, count] = entry.split(':').map((hex) => parseInt(hex, 16));
			return [base, [0, 1, 2, 3].map((at) => (at < count ? first + at : 0))];
		})
);
// Alef maksura's initial and medial forms are in the other block.
FORMS.set(0x649, [0xfeef, 0xfef0, 0xfbe8, 0xfbe9]);

/** Lam followed by each of these alefs is one ligature, isolated then final. */
const LAM_ALEF = new Map([
	[0x622, [0xfef5, 0xfef6]],
	[0x623, [0xfef7, 0xfef8]],
	[0x625, [0xfef9, 0xfefa]],
	[0x627, [0xfefb, 0xfefc]]
]);
const LAM = 0x644;
const ZWNJ = 0x200c;
/** ZWJ and tatweel join on both sides and have no forms of their own. */
const JOINER = new Set([0x200d, 0x640]);
const MARK_OR_FORMAT = /^[\p{Mn}\p{Me}\p{Cf}]$/u;

const joins_next = (point: number) => JOINER.has(point) || (FORMS.get(point)?.[2] ?? 0) !== 0;
const joins_prev = (point: number) => JOINER.has(point) || (FORMS.get(point)?.[1] ?? 0) !== 0;
const transparent = (point: number) => point !== ZWNJ && !JOINER.has(point) && MARK_OR_FORMAT.test(String.fromCodePoint(point));

/** Each Arabic letter as the presentation form it takes where it stands, and lam-alef as its ligature. */
function shape(text: string): string {
	const points = Array.from(text, (char) => char.codePointAt(0)!);
	const beside = (from: number, step: number) => {
		let at = from + step;
		while (at >= 0 && at < points.length && transparent(points[at])) at += step;
		return at;
	};
	let shaped = '';
	for (let at = 0; at < points.length; at++) {
		const point = points[at];
		const forms = FORMS.get(point);
		if (!forms) {
			shaped += String.fromCodePoint(point);
			continue;
		}
		const before = beside(at, -1);
		const after = beside(at, 1);
		const prev = before >= 0 && joins_next(points[before]) && joins_prev(point);
		const ligature = point === LAM && after < points.length ? LAM_ALEF.get(points[after]) : undefined;
		if (ligature) {
			// The lam's marks follow the ligature, and the alef is spent.
			shaped += String.fromCodePoint(ligature[prev ? 1 : 0], ...points.slice(at + 1, after));
			at = after;
			continue;
		}
		const next = after < points.length && joins_prev(points[after]) && joins_next(point);
		shaped += String.fromCodePoint(forms[prev && next ? 3 : prev ? 1 : next ? 2 : 0]);
	}
	return shaped;
}

let bidi: Bidi | null = null;
let graphemes: Intl.Segmenter | null = null;

/** DirectWrite still ligates a lam that the reversal put right before a joined alef; a ZWNJ between them stops it. */
const LAM_BEFORE_ALEF = /([ﻝ-ﻠ])(?=[ﺂﺄﺈﺎ])/g;

/** What GPUI should draw for one line of right-to-left text: the line itself, or on Windows its display order. */
export function rtl_display(line: string): string {
	if (globalThis.process?.platform !== 'win32') return line;
	bidi ??= bidi_factory();
	graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });

	const shaped = shape(line);
	const levels = bidi.getEmbeddingLevels(shaped, 'rtl');
	const chars = shaped.split('');
	for (const [at, mirror] of bidi.getMirroredCharactersMap(shaped, levels.levels)) chars[at] = mirror;

	// Clusters move whole, or a reversed run would put a letter's marks ahead of it and split a surrogate pair.
	const cluster_of: number[] = [];
	const clusters: string[] = [];
	for (const { index, segment } of graphemes.segment(shaped)) {
		for (let at = index; at < index + segment.length; at++) cluster_of[at] = clusters.length;
		clusters.push(chars.slice(index, index + segment.length).join(''));
	}
	const shown = new Set<number>();
	let display = '';
	for (const at of bidi.getReorderedIndices(shaped, levels)) {
		if (shown.has(cluster_of[at])) continue;
		shown.add(cluster_of[at]);
		display += clusters[cluster_of[at]];
	}
	// Shaping has applied every ZWNJ, which its cluster carried to the wrong side; the override keeps DirectWrite from reordering.
	return `‭${display.replaceAll('‌', '').replace(LAM_BEFORE_ALEF, '$1‌')}‬`;
}
