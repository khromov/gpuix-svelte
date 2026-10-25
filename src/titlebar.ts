/**
 * GNOME's Wayland compositor draws no title bar for a window that asks it to, and native has
 * no window move or resize to build a full one with, so `render`'s `titlebar` option draws
 * this static bar instead: the title, minimise, maximise and close.
 */

import renderer, { create_root, define_styles, get_native } from './renderer.ts';
import type { GpuiStyle, GpuixEvent, ShadowNode, WindowNative } from './types.ts';

const COLUMN: GpuiStyle = { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' };
const CONTENT: GpuiStyle = { display: 'flex', flexGrow: 1, minHeight: 0, width: '100%', position: 'relative' };
const CONTENT_CLASS = 'gpuix-titlebar-content';
const BAR =
	'display: flex; flex-direction: row; align-items: center; gap: 2px; height: 34px; padding-left: 14px; padding-right: 4px; ' +
	'background-color: var(--titlebar-bg, #181825); color: var(--titlebar-fg, #cdd6f4); user-select: none';
const TITLE = 'flex-grow: 1; min-width: 0; font-size: 13px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden';
const BUTTON = 'display: flex; align-items: center; justify-content: center; width: 34px; height: 26px; border-radius: 6px; cursor: pointer';
const ICON = 'width: 14px; height: 14px; color: var(--titlebar-fg, #cdd6f4)';

const MINIMIZE = '<svg viewBox="0 0 16 16"><rect x="3" y="7.4" width="10" height="1.3"/></svg>';
const MAXIMIZE = '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" fill="none" stroke="black" stroke-width="1.3"/></svg>';
const CLOSE = '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="black" stroke-width="1.4"/></svg>';

export interface TitlebarSpec {
	title: string;
	on_close(): void;
}

let title_text: ShadowNode | null = null;

const native = () => get_native() as WindowNative | null;

function element(name: string, style: string, parent: ShadowNode): ShadowNode {
	const n = renderer.createElement(name);
	renderer.setAttribute(n, 'style', style);
	renderer.insert(parent, n, null);
	return n;
}

function button(bar: ShadowNode, label: string, icon: string, hover: string, action: () => void) {
	const b = element('div', BUTTON, bar);
	renderer.setAttribute(b, 'role', 'button');
	renderer.setAttribute(b, 'aria-label', label);
	renderer.setAttribute(b, 'hover', `background-color: ${hover}`);
	renderer.addEventListener(b, 'click', action);
	renderer.setAttribute(element('svg', ICON, b), 'source', icon);
}

/** Keeps the bar in step with `set_window_title`. */
export function set_titlebar_title(title: string) {
	if (title_text) renderer.setText(title_text, title);
}

/** The window's root, and the node the app mounts into: the root itself, or the box under the bar. */
export function create_window_root(
	root_style: GpuiStyle | undefined,
	keyboard_focus_dim: boolean | undefined,
	titlebar: TitlebarSpec | null
): { root: ShadowNode; target: ShadowNode } {
	if (!titlebar) {
		title_text = null;
		const root = create_root(root_style, keyboard_focus_dim);
		return { root, target: root };
	}

	const root = create_root(COLUMN, keyboard_focus_dim);
	const bar = element('div', BAR, root);
	renderer.setAttribute(bar, 'hitbox', 'self');
	renderer.addEventListener(bar, 'click', (e: GpuixEvent) => {
		if (e.clickCount === 2) native()?.zoomWindow?.();
	});

	title_text = renderer.createTextNode(titlebar.title);
	renderer.insert(element('text', TITLE, bar), title_text, null);

	button(bar, 'Minimize window', MINIMIZE, 'var(--titlebar-hover, #313244)', () => native()?.minimizeWindow?.());
	button(bar, 'Maximize window', MAXIMIZE, 'var(--titlebar-hover, #313244)', () => native()?.zoomWindow?.());
	button(bar, 'Close window', CLOSE, 'var(--titlebar-close, #e64553)', titlebar.on_close);

	// `rootStyle` styles the box the app mounts into, so its padding or row direction never reaches the bar.
	define_styles(CONTENT_CLASS, [{ classes: [CONTENT_CLASS], tag: null, pseudo: null, style: { ...CONTENT, ...root_style } }]);
	const target = renderer.createElement('div');
	renderer.setAttribute(target, 'class', CONTENT_CLASS);
	renderer.insert(root, target, null);
	return { root, target };
}

/** `'auto'` draws the bar only where nothing else would: GNOME, which GPUI reaches over Wayland. */
export function wants_titlebar(option: boolean | 'auto', env: (name: string) => string | undefined): boolean {
	if (option !== 'auto') return option === true;
	return globalThis.process?.platform === 'linux' && !!env('WAYLAND_DISPLAY') && /gnome/i.test(env('XDG_CURRENT_DESKTOP') ?? '');
}
