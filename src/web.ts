/**
 * The `browser` condition's entry: everything `index.ts` has except `render_hot`,
 * whose `node:fs` watch cannot resolve in a browser bundle.
 */

export { render } from './render.ts';
export {
	default as renderer,
	set_native,
	get_native,
	create_root,
	commit,
	is_dirty,
	set_auto_commit,
	dispatch,
	set_css_vars,
	set_keyboard_focus_dim,
	on_window_key,
	on_selection_change
} from './renderer.ts';
export { parse_css_text, build_style } from './style.ts';
export { to_gpui_event, GPUI_EVENTS } from './events.ts';
export {
	set_window_title,
	activate_window,
	minimize_window,
	zoom_window,
	toggle_fullscreen,
	prompt_for_paths,
	blur,
	focus_element,
	focused_element,
	focus_next,
	focus_previous,
	focus_next_within,
	focus_previous_within,
	scroll_into_view,
	set_image,
	set_image_pixels,
	register_font,
	elements_at
} from './window.ts';
export { TextSearch, find_ranges, type TextSearchOptions } from './search.ts';
export type {
	ShadowNode,
	ShadowAttrs,
	NodeKind,
	EventHandler,
	GpuixEvent,
	GpuiStyle,
	StyleValue,
	StyleRule,
	ClassRule,
	Mutation,
	NativeSink,
	Native,
	RenderOptions,
	AppOptions,
	WindowKeyType,
	PixelFormat,
	AnyComponent
} from './types.ts';
export type { GpuixTheme, HighlightSpec, MotionProps } from '@gpuix/native/host';
export {
	set_debug_overlay,
	cycle_debug_overlay,
	debug_overlay,
	debug_overlay_stats,
	reset_debug_overlay_stats
} from './window.ts';
export type { DebugFrameOverlayMode, DebugFrameOverlayStats } from '@gpuix/native/host';
export { window_size, window_insets } from './window.ts';
export type { WindowSize, WindowInsets, EdgeInsets } from '@gpuix/native/host';
