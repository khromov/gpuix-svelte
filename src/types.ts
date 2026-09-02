/**
 * The shapes shared between the renderer, its helpers and the test harness, and
 * what consumers import from `gpuix-svelte` to type an `{@attach}` or an event.
 */

import type { EventPayload, GpuixRenderer, TestGpuixRenderer, WindowOptions } from '@gpuix/native';
import type { Component } from 'svelte';

/** Any component at all: a `Component<{ a: 1 }>` is not a `Component<{}>`, so a mixed set has no other common type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyComponent = Component<any, any, any>;

export type NodeKind = 'fragment' | 'element' | 'text' | 'comment';

/** Raw attribute values as Svelte set them; `style`/`hover`/`active` are CSS text. */
export type ShadowAttrs = Record<string, unknown>;

export type EventHandler = (this: ShadowNode, event: GpuixEvent) => void;

/** A node of the JS shadow tree the renderer projects onto GPUI. */
export interface ShadowNode {
	kind: NodeKind;
	/** The tag for elements, `''` otherwise. */
	name: string;
	/** Text or comment content. */
	data: string;
	attrs: ShadowAttrs;
	/** GPUI-spelled event → handlers; survives a native destroy so a re-materialise can re-emit. */
	listeners: Map<string, EventHandler[]>;
	/** Allocated lazily, when the node first becomes reachable from the root. */
	nativeId: number | null;
	/** Its style read a `var()`, so `set_css_vars` has to restyle it. */
	uses_vars: boolean;
	/** Reachable from the designated GPUI root. */
	live: boolean;
	/** Currently appended to its native parent. */
	attached: boolean;
	parent: ShadowNode | null;
	first: ShadowNode | null;
	last: ShadowNode | null;
	prev: ShadowNode | null;
	next: ShadowNode | null;
}

export type StyleValue = number | string;

/** What `setStyle` ships: camelCase keys, bare-number lengths, `hover`/`active` nested. */
export interface GpuiStyle {
	[key: string]: StyleValue | GpuiStyle | undefined;
	hover?: GpuiStyle;
	active?: GpuiStyle;
}

export type Pseudo = 'hover' | 'active' | null;

/**
 * One `<style>` rule's declarations. A block that reads a `var()` ships as CSS text
 * and is re-parsed per `set_css_vars()` generation; the rest is parsed at compile time.
 */
export type StyleRule = { pseudo: Pseudo } & (
	| { style: GpuiStyle; css?: undefined }
	| { css: string; style?: undefined; generation?: number; resolved?: GpuiStyle }
);

/** A `StyleRule` with the selector `compile.ts` accepted: classes and at most one tag. */
export type ClassRule = StyleRule & { classes: string[]; tag: string | null };

/** One entry of the batch `applyBatch` receives. */
export type Mutation =
	| ['createElement', number, string]
	| ['destroyElement', number]
	| ['appendChild', number, number]
	| ['insertBefore', number, number, number]
	| ['setStyle', number, GpuiStyle]
	| ['setText', number, string]
	| ['setEventListener', number, string, boolean]
	| ['setRoot', number]
	| ['setCustomProp', number, string, unknown];

/** What a handler receives: the native payload plus the DOM-shaped fields Svelte and app code read. */
export interface GpuixEvent extends EventPayload {
	type: string;
	target: ShadowNode;
	currentTarget: ShadowNode;
	/** A text field has focus and is getting the same key. */
	editing: boolean;
	defaultPrevented: boolean;
	cancelBubble: boolean;
	preventDefault(): void;
	stopPropagation(): void;
	stopImmediatePropagation(): void;
	composedPath(): never[];
}

export type WindowKeyType = 'keydown' | 'keyup';

/** The least the renderer needs from a native: `test/lifecycle.ts` hands in a stub this small. */
export interface NativeSink {
	applyBatch(json: string): number[];
	commitMutations?(): void;
	setWindowKeyEvents?(keyDown: boolean, keyUp: boolean, eventId: number): void;
}

export type Native = GpuixRenderer | TestGpuixRenderer;

/** The window-only calls `window.ts` makes, each optional because the test renderer lacks them. */
export type WindowNative = Partial<Pick<GpuixRenderer, 'setWindowTitle' | 'activateWindow' | 'blur' | 'focusElement'>>;

export interface RenderOptions extends WindowOptions {
	props?: Record<string, unknown>;
	rootStyle?: GpuiStyle;
	onEvent?: (event: EventPayload) => void;
	/** `on_window_key` handlers kept across remounts. */
	onKeyDown?: (event: GpuixEvent) => void;
	onKeyUp?: (event: GpuixEvent) => void;
}
