/**
 * The shapes shared between the renderer, its helpers and the test harness, and
 * what consumers import from `gpuix-svelte` to type an `{@attach}` or an event.
 */

import type { EventPayload, GpuixRenderer, TestGpuixRenderer, WindowOptions } from '@gpuix/native';
import type { DebugFrameOverlayMode } from '@gpuix/native/host';
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

export type StyleValue = number | string | boolean;

/** `bgra` is GPUI's own order, so it skips the per-pixel swizzle `rgba` needs. */
export type PixelFormat = 'rgba' | 'bgra';

/** What `setStyle` ships: camelCase keys, bare-number lengths, `hover`/`active`/`focusVisible` nested. */
export interface GpuiStyle {
	[key: string]: StyleValue | GpuiStyle | undefined;
	hover?: GpuiStyle;
	active?: GpuiStyle;
	focusVisible?: GpuiStyle;
}

export type Pseudo = 'hover' | 'active' | 'focusVisible' | null;

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
	| ['setKeyboardFocusDim', boolean]
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
	setWindowSelectionChange?(enabled: boolean, eventId: number): void;
}

export type Native = GpuixRenderer | TestGpuixRenderer;

/** The calls `window.ts` makes, each optional because the test renderer or the wasm build lacks some. */
export type WindowNative = Partial<
	Pick<
		GpuixRenderer,
		| 'setWindowTitle'
		| 'activateWindow'
		| 'blur'
		| 'focusElement'
		| 'minimizeWindow'
		| 'zoomWindow'
		| 'toggleFullscreen'
		| 'promptForPaths'
		| 'scrollIntoView'
		| 'getFocusedElementId'
		| 'focusNext'
		| 'focusPrevious'
		| 'focusNextWithin'
		| 'focusPreviousWithin'
		| 'getElementsAt'
	>
> & {
	// napi's `Buffer` parameters take any Uint8Array, and the wasm build declares Uint8Array.
	setImage?(elementId: number, bytes: Uint8Array): void;
	setImagePixels?(elementId: number, width: number, height: number, pixels: Uint8Array, format?: PixelFormat): void;
	registerFont?(data: Uint8Array): void;
} & Partial<
	Pick<
		GpuixRenderer,
		| 'setDebugFrameOverlay'
		| 'cycleDebugFrameOverlay'
		| 'getDebugFrameOverlay'
		| 'resetDebugFrameOverlayStats'
		| 'getDebugFrameOverlayStats'
		| 'getWindowSize'
		| 'getWindowInsets'
	>
>;

/**
 * What `gpuix-svelte/build` packages the executable with: the `.app` bundle on macOS, the
 * version info on Windows. At runtime `name` is the window title's fallback and `identifier` the
 * app id Linux desktops see; nothing else is read.
 */
export interface AppOptions {
	/** The Dock, menu bar and bundle name; defaults to the window `title`. */
	name?: string;
	/** Reverse-DNS identifier (`com.example.app`): what signing and macOS's per-app state key on, and on Linux the window's `appId` unless one is given. */
	identifier?: string;
	/** Defaults to the version of the nearest package.json above the entry. */
	version?: string;
	/** A square PNG, 1024 px for macOS; a relative path is read from the entry file's directory. Defaults to the gpuix-svelte icon. */
	icon?: string | URL;
	copyright?: string;
	/** Windows file properties only. */
	publisher?: string;
	description?: string;
	/** Where `gpuix-svelte/update` looks for a newer version; the build bakes it into the executable. */
	update?: AppUpdateOptions;
}

export interface AppUpdateOptions {
	/** URL of the update manifest, `https://github.com/<owner>/<repo>/releases/latest/download/update.json` on GitHub. */
	manifest: string;
	/** Base64 ed25519 public key from `gpuix-svelte update keygen`; set, every manifest has to carry a valid signature. */
	publicKey?: string;
}

export interface RenderOptions extends WindowOptions {
	props?: Record<string, unknown>;
	/** Read by `gpuix-svelte/build`; the window takes only its title fallback and app id from it. See `AppOptions`. */
	app?: AppOptions;
	rootStyle?: GpuiStyle;
	onEvent?: (event: EventPayload) => void;
	/** `on_window_key` handlers kept across remounts. */
	onKeyDown?: (event: GpuixEvent) => void;
	onKeyUp?: (event: GpuixEvent) => void;
	/** `on_selection_change` kept across remounts. */
	onSelectionChange?: (event: GpuixEvent) => void;
	/** GPUI's draw-time readout, top right; `GPUIX_FPS` outranks it. */
	debugFrameOverlay?: DebugFrameOverlayMode;
	/** Native 0.11's 40% dim of every other focusable while one has keyboard focus; off unless this is true. */
	keyboardFocusDim?: boolean;
	/** Tab and Shift+Tab move focus unless a key handler calls `preventDefault()`; false leaves Tab to the app. */
	tabNavigation?: boolean;
	/**
	 * A title bar (title, minimise, maximise, close) above the app. The default `'auto'` draws it only on
	 * GNOME under Wayland, which gives a GPUI window none; `false` never draws it and `true` always does.
	 * It can't be dragged, since native has no window move.
	 */
	titlebar?: boolean | 'auto';
}
