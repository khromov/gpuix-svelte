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
	on_window_key
} from './renderer.ts';
export { parse_css_text, build_style } from './style.ts';
export { to_gpui_event, GPUI_EVENTS } from './events.ts';
export { set_window_title, activate_window, blur, focus_element } from './window.ts';
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
	WindowKeyType,
	AnyComponent
} from './types.ts';
