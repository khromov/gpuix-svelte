/**
 * GNOME under Wayland gives a GPUI window no title bar, so `render`'s `titlebar` option draws
 * one above the app. `mount_headless` takes the same option, which is how this reaches it.
 */

import { set_window_title } from 'gpuix-svelte';
import { mount_headless, tree, find_text, bounds, click, settle, all_text, check, finish, type TreeNode } from 'gpuix-svelte/test';

interface A11yNode {
	aria?: { role?: string; label?: string };
}

const Titled = (await import('./Titled.svelte')).default;
const { native } = mount_headless(Titled, { titlebar: 'My app' });

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

const padded = mount_headless(Titled, { titlebar: 'Padded', rootStyle: { display: 'flex', flexDirection: 'row', paddingLeft: 40 } });
check(
	'rootStyle styles the box below the bar, not the bar',
	[bounds(bar())?.x, bounds(bar())?.width === native.getWindowSize().width, (bounds(find_text('app body')!)?.x ?? 0) >= 40],
	[0, true, true]
);
padded.unmount();

const plain = mount_headless(Titled);
check('without the option there is no bar', all_text().includes('Renamed') || buttons().length > 0, false);
plain.unmount();

finish('titlebar', 8);
