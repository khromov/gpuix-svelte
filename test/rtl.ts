/**
 * `RtlText`'s line breaking, which needs no window, so this runs on Linux too; `test:rtl-text` mounts the
 * component, whose words GPUI measures.
 */

import { rtl_line, rtl_lines, rtl_words } from 'gpuix-svelte';
import { check, finish } from 'gpuix-svelte/test';

const ZWNJ = String.fromCodePoint(0x200c);
const NBSP = String.fromCodePoint(0xa0);
const RLM = String.fromCodePoint(0x200f);

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

finish('rtl', 6);
