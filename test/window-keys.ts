/**
 * ⌘K-style shortcuts used to need a focused root `div` and a refocus after every
 * input stole it. `on_window_key` rides GPUI's window key events instead, and
 * flags the keys a text field is receiving at the same time.
 */

import { on_window_key, set_window_title, activate_window, blur } from 'gpuix-svelte';
import { mount_headless, find_test_id, focus, press, key_up, all_text, check, finish } from 'gpuix-svelte/test';

const Keys = (await import('./WindowKeys.svelte')).default;
const { unmount } = mount_headless(Keys);

const seen = () => all_text().find((t) => t.includes('|'));

press('cmd-k');
check('a window key reaches the handler with nothing focused', seen(), 'cmd-k|0');

focus(find_test_id('field')!);
press('escape');
check('it still fires while an input has focus, flagged editing, and the input gets its own keyDown', seen(), 'cmd-k escape*|1');

focus(find_test_id('other')!);
press('a');
check('focus moving to a plain focusable clears the flag', seen(), 'cmd-k escape* a|1');

let hits = 0;
const off = on_window_key('keydown', () => hits++);
press('b');
check('a second handler subscribes alongside', [hits, seen()], [1, 'cmd-k escape* a b|1']);
off();
press('b');
check('and its unsubscribe stops it, not the other', [hits, seen()], [1, 'cmd-k escape* a b b|1']);

let ups = 0;
const off_up = on_window_key('keyup', () => ups++);
key_up('b');
const after_up = [ups, seen()];
press('d');
check('keyup has its own channel', [after_up, ups], [[1, 'cmd-k escape* a b b|1'], 1]);
off_up();

// A handler registered outside the tree (render's onKeyDown) has to survive set_native,
// which is all that can tell the new renderer about it while nothing in the new tree subscribes.
let outer = 0;
const off_outer = on_window_key('keydown', () => outer++);
unmount();
const bare = mount_headless(Keys, { props: { listen: false } });
press('c');
check('a handler registered outside the tree survives a remount', outer, 1);
bare.unmount();
mount_headless(Keys);
press('e');
check('and the remounted component hears it too', [outer, seen()], [2, 'e|0']);
off_outer();

// The test renderer has none of these methods, so app code calling them unguarded
// must still be safe; a throw here would otherwise kill the run without a verdict.
let helpers: string;
try {
	set_window_title('x');
	activate_window();
	blur();
	helpers = 'no throw';
} catch (err) {
	helpers = `threw ${(err as Error).message}`;
}
check('the window helpers are no-ops on the test renderer', helpers, 'no throw');

finish('window-keys', 9);
