/**
 * GNOME under Wayland gives a GPUI window no title bar, so `render`'s `titlebar` option draws
 * one above the app. `mount_headless` takes the same option, which is how this reaches it.
 */

import { set_window_title } from 'gpuix-svelte';
import { mount_headless, tree, find_text, bounds, click, settle, all_text, check, finish, type TreeNode } from 'gpuix-svelte/test';
import { wants_titlebar } from '../src/titlebar.ts';

interface A11yNode {
	aria?: { role?: string; label?: string };
}

const Titled = (await import('./Titled.svelte')).default;
const { native, unmount: unmount_titled } = mount_headless(Titled, { titlebar: 'My app' });

const bar = () => tree().children?.[0] as TreeNode;
const buttons = () => bar().children?.filter((c) => c.events?.includes('click')) ?? [];
const labels = () =>
	Object.values((JSON.parse(native.getA11yTree()) as { nodes?: Record<string, A11yNode> }).nodes ?? {})
		.map((n) => n.aria?.label)
		.filter((label) => label?.endsWith('window'));

check('the bar shows the title', all_text().includes('My app'), true);
check('with minimise, maximise and close buttons', labels(), ['Minimize window', 'Maximize window', 'Close window']);
check('and the app lays out below it', (bounds(find_text('app body')!)?.y ?? 0) >= 34, true);

set_window_title('Renamed');
settle();
check('set_window_title updates the bar', all_text().includes('Renamed') && !all_text().includes('My app'), true);

const [minimize, maximize, close] = buttons();
click(minimize);
click(maximize);
check('minimise and maximise are no-ops headlessly', all_text().includes('app body'), true);

click(close);
check('close unmounts the app (render exits the process instead)', all_text().includes('app body'), false);

const warn = console.warn;
const warnings: string[] = [];
console.warn = (message) => warnings.push(String(message));
click(close);
await unmount_titled();
console.warn = warn;
check('a second close, or unmount() after one, unmounts nothing twice', warnings, []);

const padded = mount_headless(Titled, { titlebar: 'Padded', rootStyle: { display: 'flex', flexDirection: 'row', paddingLeft: 40 } });
check(
	'rootStyle styles the box below the bar, not the bar',
	[bounds(bar())?.x, bounds(bar())?.width === native.getWindowSize().width, (bounds(find_text('app body')!)?.x ?? 0) >= 40],
	[0, true, true]
);
padded.unmount();

const TitledTall = (await import('./TitledTall.svelte')).default;
const tall = mount_headless(TitledTall, { titlebar: 'Tall' });
check('content taller than the window leaves the bar its height', bounds(bar())?.height, 34);
tall.unmount();

const plain = mount_headless(Titled);
check('without the option there is no bar', all_text().includes('Renamed') || buttons().length > 0, false);
plain.unmount();

const desktop = (vars: Record<string, string>) => (name: string) => vars[name];
const gnome = desktop({ WAYLAND_DISPLAY: 'wayland-0', XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' });
check('by default render() draws it on GNOME under Wayland', wants_titlebar(undefined, gnome, 'linux'), true);
check(
	'and nowhere else: KDE, GNOME under X11, macOS',
	[
		wants_titlebar(undefined, desktop({ WAYLAND_DISPLAY: 'wayland-0', XDG_CURRENT_DESKTOP: 'KDE' }), 'linux'),
		wants_titlebar(undefined, desktop({ XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' }), 'linux'),
		wants_titlebar('auto', gnome, 'darwin')
	],
	[false, false, false]
);
check('false and true overrule it', [wants_titlebar(false, gnome, 'linux'), wants_titlebar(true, desktop({}), 'win32')], [false, true]);

finish('titlebar', 13);
