/**
 * `TextSearch` over native `highlight`: the spec it builds, the match count native reports
 * back through `onhighlight`, and the active match moving, read off what GPUI painted.
 */

import { TextSearch, find_ranges, type GpuixEvent } from 'gpuix-svelte';
import { mount_headless, settle, drain, click_text, find, check, finish } from 'gpuix-svelte/test';

const TEXT = 'the quick fox jumps over the lazy fox';

const search = new TextSearch({ color: '#f9e2af55', active_color: '#f9e2af' });
const Search = (await import('./Search.svelte')).default;
const { native } = mount_headless(Search, { props: { search } });

const painted = () => native.getPaintedHighlights().map((h) => [h.text.slice(h.start, h.end), h.active]);
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

click_text('next');
check('next moves the active match', [counter(), painted()], ['2/2', [['fox', false], ['fox', true]]]);

click_text('next');
check('next wraps past the last match', [search.active, painted()[0]], [0, ['fox', true]]);

click_text('prev');
check('prev wraps before the first match', [search.active, counter()], [1, '2/2']);

search.go_to(5);
sync();
check('go_to outside the matches is a no-op', search.active, 1);

search.go_to(0);
sync();
check('go_to inside them moves the active match', painted(), [['fox', true], ['fox', false]]);

search.query = 'THE';
search.case_sensitive = true;
sync();
check('case_sensitive is reactive and reaches native', [search.total, painted()], [0, []]);

search.case_sensitive = false;
sync();
check('turning it off again matches both', [search.total, painted().length], [2, 2]);

search.query = 'he';
search.whole_word = true;
sync();
check('whole_word skips matches inside words', [search.total, painted()], [0, []]);
search.whole_word = false;

search.query = '';
sync();
check('an empty query clears the spec, the count and the paint', [search.spec, search.total, painted(), counter()], [null, 0, [], '0/0']);

const unmounted = new TextSearch();
unmounted.on_highlight({ matchCount: 3 } as GpuixEvent);
unmounted.query = 'x';
unmounted.next();
check('next counts against a query set since the last read, with nothing rendering it', unmounted.active, 1);

check('find_ranges matches like native, in UTF-16 offsets', find_ranges(TEXT, 'FOX'), [
	[10, 13],
	[34, 37]
]);
check(
	'find_ranges takes the same flags',
	[find_ranges(TEXT, 'FOX', { case_sensitive: true }), find_ranges(TEXT, 'he', { whole_word: true })],
	[[], []]
);

finish('search', 16);
