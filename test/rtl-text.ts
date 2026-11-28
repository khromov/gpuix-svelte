/**
 * `RtlText` mounted: the words it measures come back as lines that fit the box, end at its right edge and keep
 * reading order, a narrower box breaks them again, and a screen reader hears the lines rather than the measured words.
 * On Windows each line draws its display order and tells a screen reader the line as written.
 */

import { rtl_display, rtl_line, rtl_words } from 'gpuix-svelte';
import { a11y, all_text, bounds, check, find_test_id, finish, mount_headless, text_content, wait_for } from 'gpuix-svelte/test';
import Fixture from './RtlText.svelte';

const ZWNJ = String.fromCodePoint(0x200c);
const RLM = String.fromCodePoint(0x200f);
const TEXT = `نسخه${ZWNJ}ی 2.5 از gpuix svelte را نصب کنید (با npm یا bun)، سپس برنامه را اجرا کنید؛ آیا کار می${ZWNJ}کند؟`;

const { component } = mount_headless(Fixture, { props: { text: TEXT }, width: 400, height: 300 });
const fixture = component as { resize(width: number): void };

const windows = process.platform === 'win32';
const area = () => find_test_id('box')!.children![0].children![0];
const lines = () => area().children ?? [];
// Only the lines are labels: the measured words carry role="none".
const spoken = () => Object.values(a11y().nodes ?? {}).filter((node) => node.aria?.role === 'Label').map((node) => node.aria!);
const said = () => (windows ? spoken().map((aria) => aria.label ?? '') : lines().map((line) => text_content(line)));
const read = () => said().map((line) => line.replaceAll(RLM, '')).join(' ');
const boxes = () => lines().map((line) => bounds(line)!);
const fit = () => boxes().every((line) => line.width <= bounds(area())!.width + 0.5);
const flush_right = () => {
	const edge = bounds(area())!;
	return boxes().every((line) => Math.abs(line.x + line.width - (edge.x + edge.width)) < 0.5);
};

await wait_for(() => lines().length > 1, { label: 'the lines' });
check('the words come back in reading order, each once', read(), rtl_words(TEXT).join(' '));
check(
	'each line draws what it says, in display order on Windows, the one platform where it carries a label',
	[lines().map((line) => text_content(line)), spoken().every((aria) => (aria.label !== undefined) === windows)],
	[said().map(rtl_display), true]
);
check('on lines no wider than the box, of several words each', [fit(), lines().length * 2 <= rtl_words(TEXT).length], [true, true]);
check('that end at its right edge', flush_right(), true);
check(
	'each under the one before',
	boxes().every((line, at, all) => at === 0 || line.y >= all[at - 1].y + all[at - 1].height - 0.5),
	true
);

const labels = spoken().map((aria) => aria.value);
const measured = rtl_display(rtl_line([Array(8).fill('gpuix').join(ZWNJ)]));
check(
	'a screen reader hears the lines, and none of the words measured for them',
	[labels.includes(text_content(lines()[0])), labels.includes(rtl_display(rtl_line(rtl_words(TEXT)))), labels.includes(measured), all_text().includes(measured)],
	[true, false, false, true]
);

const before = lines().length;
fixture.resize(150);
await wait_for(() => lines().length > before, { label: 'more lines' });
check('a narrower box breaks the text again, into lines that still fit and end at its edge', [read(), fit(), flush_right()], [rtl_words(TEXT).join(' '), true, true]);

finish('rtl-text', 7);
