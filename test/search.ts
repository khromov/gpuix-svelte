/**
 * `TextSearch` over native `highlight`: the spec it builds, the match count native reports
 * back through `onhighlight`, and the active match moving, read off what GPUI painted.
 */

import { TextSearch, find_ranges, type GpuixEvent } from 'gpuix-svelte';
import { mount_headless, settle, drain, click_text, find, painted_highlights, check, finish } from 'gpuix-svelte/test';

// The emoji puts UTF-16 units, code points and UTF-8 bytes at different offsets; 'o' has three matches, so next and prev differ.
const TEXT = 'the quick 🦊 fox jumps over the lazy fox';

const search = new TextSearch({ color: '#f9e2af55', active_color: '#f9e2af' });
const Search = (await import('./Search.svelte')).default;
const { native, unmount } = mount_headless(Search, { props: { search, text: TEXT } });

const painted = () => painted_highlights().map((h) => [h.text.slice(h.start, h.end), h.active]);
const counter = () => find((n) => n.type === 'text' && /^\d+\/\d+$/.test(n.text ?? ''))?.text;

// The `highlight` event is queued while GPUI paints, so it is drained like a click's.
function sync() {
	settle();
	drain();
	settle();
}

check('nothing is highlighted before a query', [painted(), search.spec, counter()], [[], null, '0/0']);

search.query = 'fox';
settle();
const spec = search.spec;
drain();
settle();
check('the count native reports reaches total and the painted counter', [search.total, counter()], [2, '1/2']);
check('every match is painted and the first is active', painted(), [['fox', true], ['fox', false]]);
check('the count arriving leaves an unchanged spec the same object, so it is not re-sent', search.spec === spec, true);
const native_ranges = native.getPaintedHighlights().map((h) => [h.start, h.end]);

const flagged = new TextSearch({ case_sensitive: true, whole_word: true, radius: 3 });
flagged.query = 'x';
check(
	"the constructor's options reach the spec",
	[spec?.color, spec?.activeColor, flagged.spec?.caseSensitive, flagged.spec?.wholeWord, flagged.spec?.radius],
	['#f9e2af55', '#f9e2af', true, true, 3]
);

search.query = 'o';
sync();
click_text('next');
check('next moves the active match', [counter(), painted()], ['2/3', [['o', false], ['o', true], ['o', false]]]);

search.go_to(2);
sync();
click_text('next');
check('next wraps past the last match', [search.active, painted()[0]], [0, ['o', true]]);

click_text('prev');
check('prev wraps before the first match', [search.active, counter()], [2, '3/3']);

search.go_to(0);
sync();
const first = search.active;
search.go_to(1);
sync();
check('go_to inside them moves the active match', [first, painted()], [0, [['o', false], ['o', true], ['o', false]]]);

search.go_to(3);
search.go_to(-1);
sync();
check('go_to outside the matches is a no-op', search.active, 1);

search.query = 'THE';
sync();
search.case_sensitive = true;
sync();
const upper = [search.total, painted()];
search.query = 'the';
sync();
check('case_sensitive is reactive and reaches native', [upper, search.total], [[0, []], 2]);

search.query = 'THE';
sync();
search.case_sensitive = false;
sync();
check('turning it off again matches both', [search.total, painted().length], [2, 2]);

search.query = 'he';
sync();
search.whole_word = true;
sync();
const inside = [search.total, painted()];
search.query = 'the';
sync();
check('whole_word skips matches inside words', [inside, search.total], [[0, []], 2]);
search.whole_word = false;

search.query = '';
sync();
check('an empty query clears the spec, the count and the paint', [search.spec, search.total, painted(), counter()], [null, 0, [], '0/0']);

function unmounted() {
	const unrendered = new TextSearch();
	unrendered.on_highlight({ matchCount: 3 } as GpuixEvent);
	unrendered.query = 'x';
	return unrendered;
}
const [forward, back, jump] = [unmounted(), unmounted(), unmounted()];
forward.next();
back.prev();
jump.go_to(2);
check('next, prev and go_to count against a query set since the last read, with nothing rendering it', [forward.active, back.active, jump.active], [1, 2, 2]);

const capped = new TextSearch({ matches: { total: 4, index_offset: 0 } });
capped.on_highlight({ matchCount: 2 } as GpuixEvent);
capped.query = 'x';
const capped_total = capped.total;
const offsets = [capped.spec?.matchIndexOffset];
capped.matches = { total: 4, index_offset: 1 };
offsets.push(capped.spec?.matchIndexOffset);
capped.matches = null;
check(
	'the constructor takes matches, a new index_offset alone reaches the spec, and null hands the count back to native',
	[capped_total, offsets, capped.total],
	[4, [0, 1], 2]
);

const FOX = [
	[13, 16],
	[37, 40]
];
check('find_ranges matches like native, in UTF-16 offsets', [find_ranges(TEXT, 'FOX'), native_ranges], [FOX, FOX]);
check(
	'find_ranges takes the same flags',
	[
		[find_ranges(TEXT, 'FOX', { case_sensitive: true }), find_ranges(TEXT, 'fox', { case_sensitive: true })],
		[find_ranges(TEXT, 'he', { whole_word: true }), find_ranges(TEXT, 'the', { whole_word: true })]
	],
	[
		[[], FOX],
		[
			[],
			[
				[0, 3],
				[28, 31]
			]
		]
	]
);

// Three foxes a virtual list has not mounted come before the two native paints.
unmount();
const windowed = new TextSearch({ active_color: '#f9e2af' });
mount_headless(Search, { props: { search: windowed, text: TEXT, above: 'fox, fox and fox' } });
windowed.query = 'fox';
sync();
check('matches.total stands in for the count native reports, which covers only what is mounted', [windowed.total, counter(), painted()], [5, '1/5', [['fox', false], ['fox', false]]]);
windowed.go_to(3);
sync();
check('and index_offset puts the active match on the right painted one', [counter(), painted()], ['4/5', [['fox', true], ['fox', false]]]);
click_text('next');
const last = painted();
click_text('next');
check('next walks onto the last match and then wraps at matches.total', [last, windowed.active, counter()], [[['fox', false], ['fox', true]], 0, '1/5']);
windowed.query = 'o';
sync();
check('an effect deriving them from the query keeps up with it, and comes to rest', [windowed.matches, windowed.total, counter()], [{ total: 6, index_offset: 3 }, 6, '1/6']);
windowed.query = 'FOX';
windowed.case_sensitive = true;
sync();
check('find_ranges takes the search itself as its options, so the count keeps to its flags', [windowed.matches, windowed.total], [{ total: 0, index_offset: 0 }, 0]);

finish('search', 23);
