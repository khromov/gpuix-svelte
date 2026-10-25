/**
 * Native 0.11 stops Tab from typing into text fields and leaves moving focus to the JS
 * host, so the renderer does what `@gpuix/react` and `@gpuix/solid` do: Tab and Shift+Tab
 * walk the tab stops once every key handler of that keystroke has had the chance to
 * `preventDefault()`, and `stopPropagation()` keeps a key from the handlers after it.
 */

import { focused_element } from 'gpuix-svelte';
import { mount_headless, find_test_id, element_of, all_text, focus, press, check, finish } from 'gpuix-svelte/test';

const Tab = (await import('./Tab.svelte')).default;
const { unmount } = mount_headless(Tab);

const at = () => focused_element()?.nativeId;
const id = (testid: string) => find_test_id(testid)!.id;

let seen = 0;
/** The log entries since the last call. */
function fresh() {
	const text = find_test_id('log')!.children?.[0]?.text ?? '';
	const all = text ? text.split(' ') : [];
	const out = all.slice(seen).join(' ');
	seen = all.length;
	return out;
}

focus(find_test_id('field')!);
press('tab');
check('Tab moves focus to the next stop, out of a text field', [at(), fresh()], [id('trap'), 'window:tab']);

press('tab');
check('preventDefault in an element handler keeps focus where it is', at(), id('trap'));
check('and the window handler after it sees defaultPrevented', fresh(), 'trap:tab window:tab!');

focus(find_test_id('parent')!);
fresh();
press('shift-tab');
check('Shift+Tab moves focus back', at(), id('trap'));

focus(find_test_id('child')!);
fresh();
press('x');
check('stopPropagation skips the focusable ancestor and the window handler', fresh(), 'child:x');
press('y');
check('without it a key reaches the ancestor and then the window', fresh(), 'child:y parent:y window:y');

press('ctrl-tab');
check('a modified Tab is left alone', at(), id('child'));

unmount();
const untabbed = mount_headless(Tab, { tabNavigation: false });
focus(find_test_id('field')!);
press('tab');
check('tabNavigation: false leaves Tab to the app', at(), id('field'));

// The native-0.11 demo can't be driven from a window in CI, so walk its first stops here.
untabbed.unmount();
const WhatsNew = (await import('../examples/native-0.11/WhatsNew.svelte')).default;
mount_headless(WhatsNew, { width: 1180, height: 500 });
press('tab');
check('the native-0.11 demo: Tab lands on its first button', all_text().includes('focused: One'), true);
press('tab');
check('and its :focus-visible rule reaches GPUI', [all_text().includes('focused: Two'), element_of('Two')!.style!.focusVisible?.outlineWidth], [true, 2]);

finish('tab', 10);
