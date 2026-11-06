/**
 * The UI toolkit's showcase on the DOM: bundled by Vite as a consumer's would be (scripts/ui-bundle.ts),
 * mounted under happy-dom and clicked through by the same ids as test/ui.ts on GPUI. The toast queue and
 * the theme tokens are exercised directly too, since only time dismisses a toast and only a page needs
 * the `:root` rule.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = join(root, 'test/.ui-tmp');

// Vite runs on Node, as it does for demo:ui-dom, whichever runtime runs this test.
const node = process.versions.bun ? 'node' : process.execPath;
if (spawnSync(node, [join(root, 'scripts/ui-bundle.ts'), tmp], { cwd: root, stdio: 'inherit' }).status !== 0) {
	console.error('[ui-dom test] the showcase bundle failed');
	process.exit(1);
}

GlobalRegistrator.register({ width: 1024, height: 768 });

// After the registration, or Svelte's client runtime would be evaluated with no `document`.
const { check, finish } = await import('gpuix-svelte/test');
const { Showcase, mount, flushSync } = (await import(pathToFileURL(join(tmp, 'dist/showcase.js')).href)) as {
	Showcase: never;
	mount(component: never, options: { target: Element }): unknown;
	flushSync(): void;
};
const { toast, dismiss_toast, clear_toasts, toasts } = await import('../packages/ui/src/toast.ts');
const { theme_rule, theme_vars, DARK, LIGHT } = await import('../packages/ui/src/theme.ts');

const by_id = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (id: string) => by_id(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const css_var = (name: string) => document.documentElement.style.getPropertyValue(`--${name}`);
const has = (content: string) => [...document.querySelectorAll<HTMLElement>('div')].some((el) => el.children.length === 0 && el.textContent?.trim() === content);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const closes = () => [...document.querySelectorAll<HTMLElement>('[data-testid^="toaster-"][data-testid$="-close"]')];

function click(target: HTMLElement | null | undefined) {
	if (!target) throw new Error('nothing to click');
	target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	flushSync();
}

function key(target: HTMLElement | Window | null | undefined, name: string, init: KeyboardEventInit = {}) {
	if (!target) throw new Error(`nothing to press ${name} on`);
	target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }));
	flushSync();
}

function type_into(target: HTMLElement | null | undefined, value: string) {
	if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');
	target.value = value;
	target.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

function viewport(width: number, height: number) {
	(window as unknown as { happyDOM: { setViewport(viewport: { width: number; height: number }): void } }).happyDOM.setViewport({ width, height });
	window.dispatchEvent(new Event('resize'));
	flushSync();
}

// --- the theme and toast modules -------------------------------------------------
check('theme_vars prefixes every token and adds the component tokens', [theme_vars(DARK)['ui-bg'], theme_vars(LIGHT)['ui-ink'], theme_vars(DARK)['popover-surface'], 'ui-appearance' in theme_vars(DARK)], ['#000000', '#171717', '#111111', false]);
check('theme_rule is a :root rule a page can carry', theme_rule(DARK).startsWith(':root{--ui-bg:#000000;--ui-panel:#111111;'), true);

const quick = toast({ title: 'quick', duration: 20 });
const sticky = toast({ title: 'sticky', duration: null });
check('toast() queues, newest last, with a tone by default', toasts.current.map((t) => [t.title, t.tone]), [['quick', 'neutral'], ['sticky', 'neutral']]);
await sleep(60);
check('a toast with a duration dismisses itself, a sticky one stays', toasts.current.map((t) => t.id), [sticky]);
dismiss_toast(quick);
dismiss_toast(sticky);
check('dismiss_toast removes it, and tolerates a repeat', toasts.current.length, 0);
toast('one');
toast('two');
clear_toasts();
check('clear_toasts empties the queue', toasts.current.length, 0);

// --- the showcase ---------------------------------------------------------------
mount(Showcase, { target: document.body });
flushSync();

check('the badge says DOM', text('target'), 'DOM');
check('the size chip shows the viewport', text('size'), '1024 × 768');
check('media_query says wide', text('layout'), 'wide');
check('apply_theme wrote the --ui-* tokens on :root', [css_var('ui-bg'), css_var('popover-surface')], ['#000000', '#111111']);

click(by_id('theme'));
check('the theme button switches to the light palette', css_var('ui-bg'), '#fafafa');
key(window, 't');
check('and so does the T shortcut', css_var('ui-bg'), '#000000');
click(by_id('dark'));
check('the Toggle drives the same state', [css_var('ui-bg'), by_id('dark')?.getAttribute('aria-checked')], ['#fafafa', 'false']);
click(by_id('dark'));
check('and back', css_var('ui-bg'), '#000000');

click(by_id('plus'));
click(by_id('plus'));
click(by_id('minus'));
check('small Buttons reach the counter', text('count'), '1');
check('a Button is a focusable button', [by_id('plus')?.getAttribute('role'), by_id('plus')?.tabIndex], ['button', 0]);

click(by_id('menu-button'));
check('the Menu opens its items off <body>', [by_id('menu-panel')?.closest('body > *') !== null, has('⌘R'), has('Archive')], [true, true, true]);
click(by_id('menu-rename'));
check('an item runs and closes it', [text('last'), by_id('menu-panel')], ['Last action: Rename', null]);
click(by_id('menu-button'));
key(window, 'Escape');
check('Escape closes it', by_id('menu-panel'), null);

click(by_id('notifications'));
check('a Toggle reports its new state', text('choices-echo')?.startsWith('Notifications are off.'), true);
click(by_id('terms'));
check('a Checkbox too, with its ARIA state', [text('choices-echo')?.endsWith('Terms accepted.'), by_id('terms')?.getAttribute('aria-checked')], [true, 'true']);
click(by_id('plan-free'));
check('a radio click selects it', text('choices-echo')?.includes('Plan: free.'), true);
key(by_id('plan-free'), 'ArrowDown');
check('an arrow key moves the selection', text('choices-echo')?.includes('Plan: pro.'), true);
key(by_id('plan-pro'), 'ArrowDown');
check('and skips a disabled option, wrapping around', text('choices-echo')?.includes('Plan: free.'), true);

type_into(by_id('name-input'), 'Ada');
check('typing into a TextField reports every edit', text('name-echo'), 'You typed: Ada');
key(by_id('name-input'), 'Enter');
check('Enter submits', has('Hello, Ada'));
check('the TextArea is a real field', by_id('notes-input') instanceof HTMLTextAreaElement, true);

click(by_id('fruit-trigger'));
check('the Select opens its list', by_id('fruit-list-panel') !== null);
click(by_id('fruit-banana'));
check('an option click picks it and closes the list', [text('fruit-echo'), by_id('fruit-list-panel')], ['Picked: banana', null]);
key(by_id('fruit-trigger'), 'ArrowDown');
check('an arrow key on the trigger opens the list', by_id('fruit-list-panel') !== null);
key(by_id('fruit-trigger'), 'ArrowDown');
key(by_id('fruit-trigger'), 'Enter');
check('and the arrows skip a disabled option before Enter picks', [text('fruit-echo'), by_id('fruit-list-panel')], ['Picked: durian', null]);

key(by_id('volume-track'), 'ArrowRight');
check('an arrow key steps the Slider', text('volume-echo'), 'Volume: 41');
key(by_id('volume-track'), 'End');
check('End goes to the maximum, and the Progress follows', [text('volume-echo'), has('100%')], ['Volume: 100', true]);
key(by_id('volume-track'), 'Home');
check('Home to the minimum', text('volume-echo'), 'Volume: 0');

click(by_id('tabs-activity'));
check('a Tab click switches the panel', text('tab-echo'), 'Nothing has happened yet.');
key(by_id('tabs-activity'), 'ArrowRight');
check('an arrow key moves to the next tab', text('tab-echo'), 'Settings would go here.');
key(by_id('tabs-settings'), 'ArrowRight');
check('and skips the disabled one, wrapping around', text('tab-echo')?.startsWith('An overview.'), true);
check('only the selected tab is a tab stop', [by_id('tabs-overview')?.tabIndex, by_id('tabs-settings')?.tabIndex, by_id('tabs-billing')?.tabIndex], [0, -1, -1]);

click(by_id('toast-plain'));
check('a toast shows in the Toaster, off <body>', [has('Saved'), by_id('toaster')?.closest('body > *') !== null], [true, true]);
check('every toast has a dismiss button', closes().length, 2);
click(closes()[1]);
check('dismissing one leaves the other', [has('Saved'), has('Hello, Ada')], [false, true]);
click(by_id('toast-rich'));
check('a rich toast shows its description', [has('Export finished'), has('12 files written to ~/Desktop.')], [true, true]);
click([...document.querySelectorAll<HTMLElement>('[role="button"]')].find((el) => el.textContent?.trim() === 'Open'));
check('its action runs and dismisses it', [text('last'), has('Export finished')], ['Last action: Open', false]);

click(by_id('open-dialog'));
check('the Dialog opens in a Portal off <body>', [by_id('dialog')?.closest('body > *') !== null, has('Delete this project?')], [true, true]);
key(window, 'Escape');
check('Escape closes it', by_id('dialog'), null);
click(by_id('open-dialog'));
click(by_id('dialog-close'));
check('so does the close button', by_id('dialog'), null);
click(by_id('open-dialog'));
click(by_id('cancel'));
check('and an action that closes it', by_id('dialog'), null);
click(by_id('open-dialog'));
click(by_id('dialog-scrim'));
check('and a click on the scrim', by_id('dialog'), null);
click(by_id('open-dialog'));
click(by_id('dialog'));
check('while a click inside stays inside', by_id('dialog') !== null, true);
click(by_id('confirm'));
check('the confirming action runs, closes it and toasts', [by_id('dialog'), text('last'), has('Project deleted')], [null, 'Last action: Deleted', true]);

viewport(600, 500);
check('media_query follows the viewport', text('layout'), 'narrow');
viewport(1024, 768);
check('and back', text('layout'), 'wide');

finish('ui-dom', 52);
