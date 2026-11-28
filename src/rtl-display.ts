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
// Unicode gives these fewer forms than they join with in ArabicShaping.txt, so they count as having none.
FORMS.delete(0x677);
FORMS.delete(0x6ba);

/** Lam followed by each of these alefs is one ligature, isolated then final. */
const LAM_ALEF = new Map([
	[0x622, [0xfef5, 0xfef6]],
	[0x623, [0xfef7, 0xfef8]],
	[0x625, [0xfef9, 0xfefa]],
	[0x627, [0xfefb, 0xfefc]]
]);
const LAM = 0x644;
const ZWNJ = 0x200c;
/** The join-causing characters of ArabicShaping.txt: ZWJ, tatweel and its kin, which have no forms of their own. */
const JOINER = new Set([0x200d, 0x640, 0x7fa, 0x883, 0x884, 0x885]);
/** The format characters ArabicShaping.txt makes non-joining rather than transparent: the number signs, the end of ayah, the isolates. */
const NON_JOINING = /^[\u{600}-\u{605}\u{6DD}\u{890}\u{891}\u{8E2}\u{2066}-\u{2069}]$/u;
const MARK_OR_FORMAT = /^[\p{Mn}\p{Me}\p{Cf}]$/u;
/** A letter of a joining script that Unicode has no presentation forms for, so a word holding one is left for DirectWrite to join. */
const FORMLESS = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]/u;

const joins_next = (point: number) => JOINER.has(point) || (FORMS.get(point)?.[2] ?? 0) !== 0;
const joins_prev = (point: number) => JOINER.has(point) || (FORMS.get(point)?.[1] ?? 0) !== 0;
const transparent = (point: number) => {
	const char = String.fromCodePoint(point);
	return point !== ZWNJ && !JOINER.has(point) && !NON_JOINING.test(char) && MARK_OR_FORMAT.test(char);
};
const formless = (char: string) => /\p{L}/u.test(char) && FORMLESS.test(char) && !FORMS.has(char.codePointAt(0)!) && !JOINER.has(char.codePointAt(0)!);

/**
 * Each Arabic letter as the presentation form it takes where it stands, lam-alef as its ligature, and the ZWNJs that
 * shaping has applied dropped. A word with a letter that has no forms keeps its letters as typed, since shaping only
 * its neighbours would leave them unjoined; DirectWrite joins such a word itself once it is in display order.
 */
function shape(text: string): string {
	return text
		.split(/(\s+)/)
		.map((word) => (Array.from(word).some(formless) ? word : shape_word(word)))
		.join('');
}

function shape_word(text: string): string {
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
			const applied = point === ZWNJ && [beside(at, -1), beside(at, 1)].some((near) => FORMS.has(points[near]));
			if (!applied) shaped += String.fromCodePoint(point);
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
const LAM_BEFORE_ALEF = /([\u{FEDD}-\u{FEE0}])(?=[\u{FE82}\u{FE84}\u{FE88}\u{FE8E}])/gu;

/** A BMP character of each bidi class a character outside the BMP has, since bidi-js classes a surrogate on its own, as L. */
const STAND_IN: Record<string, string> = { L: 'a', R: '\u{5D0}', AL: '\u{627}', EN: '0', ES: '+', ET: '#', AN: '\u{660}', CS: ',', NSM: '\u{300}', BN: '\u{200B}', ON: '!' };

function classed(bidi: Bidi, text: string): string {
	return text.replace(/[\u{10000}-\u{10FFFF}]/gu, (char) => (STAND_IN[bidi.getBidiCharTypeName(char)] ?? 'a').repeat(2));
}

/** What GPUI should draw for one line of right-to-left text: the line itself, or on Windows its display order. */
export function rtl_display(line: string): string {
	if (globalThis.process?.platform !== 'win32') return line;
	bidi ??= bidi_factory();
	graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });

	const shaped = shape(line);
	const stand_in = classed(bidi, shaped);
	const levels = bidi.getEmbeddingLevels(stand_in, 'rtl');
	const chars = shaped.split('');
	for (const [at, mirror] of bidi.getMirroredCharactersMap(shaped, levels.levels)) chars[at] = mirror;

	// Clusters move whole, or a reversed run would put a letter's marks ahead of it and split a surrogate pair.
	const cluster_of: number[] = [];
	const clusters: string[] = [];
	for (const { index, segment } of graphemes.segment(shaped)) {
		for (let at = index; at < index + segment.length; at++) cluster_of[at] = clusters.length;
		let cluster = chars.slice(index, index + segment.length).join('');
		// A ZWNJ ends the cluster of the letter before it, which in a reversed run is the letter after it.
		if (levels.levels[index] & 1 && cluster.length > 1 && cluster.endsWith('\u{200C}')) cluster = `\u{200C}${cluster.slice(0, -1)}`;
		clusters.push(cluster);
	}
	const shown = new Set<number>();
	let display = '';
	for (const at of bidi.getReorderedIndices(stand_in, levels)) {
		if (shown.has(cluster_of[at])) continue;
		shown.add(cluster_of[at]);
		display += clusters[cluster_of[at]];
	}
	// The override keeps DirectWrite from reordering what is already in display order.
	return `\u{202D}${display.replace(LAM_BEFORE_ALEF, '$1\u{200C}')}\u{202C}`;
}
