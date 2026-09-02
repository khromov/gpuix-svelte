/**
 * ⌘K-style shortcuts used to need a focused root `div` and a refocus after every
 * input stole it. `on_window_key` rides GPUI's window key events instead, and
 * flags the keys a text field is receiving at the same time.
 */

import { on_window_key, set_window_title, activate_window, blur } from 'gpuix-svelte';
import { mount_headless, find_test_id, focus, press, drain, settle, all_text, check, finish } from 'gpuix-svelte/test';

const Keys = (await import('./WindowKeys.svelte')).default;
const { native, unmount } = mount_headless(Keys);

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
check('a second handler subscribes alongside', hits, 1);
off();
press('b');
check('and its unsubscribe stops it', hits, 1);

let ups = 0;
const off_up = on_window_key('keyup', () => ups++);
native.simulateKeyUp('b');
drain();
settle();
check('keyup has its own channel', ups, 1);
off_up();

// A handler registered outside the tree (render's onKeyDown) has to survive set_native.
let outer = 0;
const off_outer = on_window_key('keydown', () => outer++);
unmount();
mount_headless(Keys);
press('c');
check('a handler registered outside the tree survives a remount', outer, 1);
check('and the remounted component hears it too', seen(), 'c|0');
off_outer();

set_window_title('x');
activate_window();
blur();
check('the window helpers are no-ops on the test renderer', true, true);

finish('window-keys');
