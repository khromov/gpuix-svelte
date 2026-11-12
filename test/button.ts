/**
 * `<button>` is a div the renderer gives what a browser's has for free: the Button role, a tab
 * stop, and Enter or Space doing what a click does. `disabled` takes all of that away.
 */

import { focused_element } from 'gpuix-svelte';
import { mount_headless, find_test_id, click_test_id, focus, press, a11y, text_content, check, finish } from 'gpuix-svelte/test';

const warnings: string[] = [];
const warn = console.warn;
console.warn = (...args: unknown[]) => void warnings.push(args.join(' '));

const Button = (await import('./Button.svelte')).default;
mount_headless(Button);
console.warn = warn;

const roles = () =>
	Object.values(a11y().nodes ?? {})
		.map((n) => n.aria?.role)
		.filter((role) => role === 'Button' || role === 'Tab');
const clicks = () => text_content(find_test_id('clicks')!);
const at = () => focused_element()?.attrs.testId;

check('a <button> is no unknown tag', warnings.filter((w) => w.includes('<button>')).length, 0);
check('it has the Button role unless it names its own', roles().sort(), ['Button', 'Button', 'Tab']);

focus(find_test_id('plain')!);
press('enter');
press('space');
check('Enter and Space click it', clicks(), '2');
press('enter', { held: true });
check('a held key does not click again', clicks(), '2');
press('x');
check('and no other key does', clicks(), '2');

click_test_id('swallow');
focus(find_test_id('plain')!);
press('enter');
press('space');
check('a key handler that prevents Enter keeps the click from it, and Space still clicks', clicks(), '3');
click_test_id('swallow');

click_test_id('plain');
check('a pointer click is a click as on any element', clicks(), '4');

focus(find_test_id('plain')!);
press('tab');
check('Tab reaches a button, and walks past a disabled one', at(), 'tab');
click_test_id('off');
check('a disabled button takes no click', clicks(), '4');

click_test_id('enable');
focus(find_test_id('plain')!);
press('tab');
const stop = at();
press('enter');
check('enabled again, it is a tab stop that Enter clicks', [stop, clicks()], ['off', '5']);

click_test_id('div');
focus(find_test_id('plain')!);
press('shift-tab');
check('a clickable div stays as it was: clicked by the pointer, never a tab stop', [clicks(), at()], ['6', 'tab']);

finish('button', 11);
