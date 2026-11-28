/**
 * `RtlText`'s line breaking, which needs no window, so this runs on Linux too; `test:rtl-text` mounts the
 * component, whose words GPUI measures.
 */

import { rtl_display, rtl_line, rtl_lines, rtl_words } from 'gpuix-svelte';
import { check, finish } from 'gpuix-svelte/test';

const ZWNJ = String.fromCodePoint(0x200c);
const NBSP = String.fromCodePoint(0xa0);
const RLM = String.fromCodePoint(0x200f);
const LRO = String.fromCodePoint(0x202d);
const PDF = String.fromCodePoint(0x202c);
const u = (...points: number[]) => String.fromCodePoint(...points);

check(
	'words split at spaces, tabs and line breaks, as under white-space: normal, and a ZWNJ or a no-break space stays inside its word',
	rtl_words(`  می${ZWNJ}خواهم\tبروم\n\n10${NBSP}%  `),
	[`می${ZWNJ}خواهم`, 'بروم', `10${NBSP}%`]
);

const four = ['یک', 'دو', 'سه', 'چهار'];
check('a line takes words while they fit, up to the width exactly', rtl_lines(four, [10, 10, 10, 10], 55, 25), ['یک دو', 'سه چهار']);
check('the measured line gives the width of a space', rtl_lines(four, [10, 10, 10, 10], 64, 25), ['یک', 'دو', 'سه', 'چهار']);
check('a word wider than the line gets a line to itself, and the next word starts another', rtl_lines(['یک', 'دو', 'سه'], [10, 40, 10], 70, 25), ['یک', 'دو', 'سه']);

check(
	'a line that opens with a Latin word, a number of either kind or punctuation gets a right-to-left mark, and one that opens with an Arabic or Hebrew letter does not',
	[rtl_line(['gpuix', 'است']), rtl_line(['2.5', 'نسخه']), rtl_line(['۲٫۵', 'نسخه']), rtl_line(['(با', 'npm)']), rtl_line(['نسخه', '2.5']), rtl_line(['שלום'])],
	[`${RLM}gpuix است`, `${RLM}2.5 نسخه`, `${RLM}۲٫۵ نسخه`, `${RLM}(با npm)`, 'نسخه 2.5', 'שלום']
);
check('each line is marked on its own', rtl_lines(['سلام', 'gpuix', 'svelte'], [30, 40, 40], 120, 75), ['سلام gpuix', `${RLM}svelte`]);

const platform = process.platform;
const pretend = (name: string) => Object.defineProperty(process, 'platform', { value: name, configurable: true });

pretend('darwin');
check('off Windows a line is drawn as written', rtl_display('سلام دنیا'), 'سلام دنیا');

pretend('win32');
check(
	'on Windows a line is drawn in display order, each letter in the joined form it takes, inside a left-to-right override',
	rtl_display('سلام دنیا'),
	`${LRO}${u(0xfe8e, 0xfbff, 0xfee7, 0xfea9, 0x20, 0xfee1, 0xfefc, 0xfeb3)}${PDF}`
);
check(
	'a number and a Latin word keep their own order, and brackets are mirrored',
	[rtl_display('نسخه 2.5'), rtl_display('(با npm)')],
	[`${LRO}2.5 ${u(0xfeea, 0xfea8, 0xfeb4, 0xfee7)}${PDF}`, `${LRO}(npm ${u(0xfe8e, 0xfe91)})${PDF}`]
);
check(
	"a letter's vowel mark stays after it, and an emoji stays whole",
	[rtl_display('بِل'), rtl_display('سلام 👋')],
	[`${LRO}${u(0xfede, 0xfe91, 0x650)}${PDF}`, `${LRO}👋 ${u(0xfee1, 0xfefc, 0xfeb3)}${PDF}`]
);
check(
	'a lam the reversal puts before a joined alef is kept from ligating with it, and a real lam-alef stays one ligature',
	[rtl_display('بال'), rtl_display('لا')],
	[`${LRO}${u(0xfedd, 0x200c, 0xfe8e, 0xfe91)}${PDF}`, `${LRO}${u(0xfefb)}${PDF}`]
);
check('a lam-alef with a mark between them is the ligature, the mark after it', rtl_display('بلَا'), `${LRO}${u(0xfefc, 0x64e, 0xfe91)}${PDF}`);
check(
	'a ZWNJ keeps Arabic letters either side apart and is then dropped, and stays in other text',
	[rtl_display(`ب${ZWNJ}ب`), rtl_display(`a${ZWNJ}b`)],
	[`${LRO}${u(0xfe8f, 0xfe8f)}${PDF}`, `${LRO}a${ZWNJ}b${PDF}`]
);
check(
	'a character outside the BMP takes its own bidi class: two emoji swap with the line, and Adlam runs right to left',
	[rtl_display('سلام 😀😃'), rtl_display('𞤀𞤁 𞤂')],
	[`${LRO}😃😀 ${u(0xfee1, 0xfefc, 0xfeb3)}${PDF}`, `${LRO}${u(0x1e902, 0x20, 0x1e901, 0x1e900)}${PDF}`]
);
check(
	'a word with a letter Unicode has no forms for keeps its letters as typed, its ZWNJ on the far side of its letter, while the next word is shaped',
	[rtl_display('پښتو سلام'), rtl_display(`ښ${ZWNJ}ب`)],
	[`${LRO}${u(0xfee1, 0xfefc, 0xfeb3, 0x20, 0x648, 0x62a, 0x69a, 0x67e)}${PDF}`, `${LRO}${u(0x628, 0x200c, 0x69a)}${PDF}`]
);
check('the end of ayah keeps the letters either side from joining across it', rtl_display('ب\u{6DD}ب'), `${LRO}${u(0x6dd, 0xfe8f, 0xfe8f)}${PDF}`);
pretend(platform);

finish('rtl', 16);
