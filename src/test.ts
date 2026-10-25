/**
 * Headless testing on the real GPUI pipeline. `TestGpuixRenderer` runs Metal or
 * DirectX without a window; this is the mount / settle / hit-test loop around it
 * that every test used to spell out, bound to whatever native the renderer holds.
 */

import { TestGpuixRenderer, hasTestGpuixRenderer, type ElementBounds, type EventPayload, type HighlightMatch } from '@gpuix/native';
import { mount, unmount, flushSync, type Component } from 'svelte';
import renderer, { set_native, set_tab_navigation, get_native, create_root, commit, dispatch } from './renderer.ts';
import type { GpuiStyle, ShadowNode } from './types.ts';

/** On macOS the headless viewport can be any width but never taller than this; Windows ignores the requested size. */
export const MAX_HEADLESS_HEIGHT = 538;

/** One node of `getTreeJson()`: what GPUI holds, with the ids the shadow tree assigned. */
export interface TreeNode {
	id: number;
	type: string;
	text?: string;
	testId?: string;
	events?: string[];
	style?: GpuiStyle;
	children?: TreeNode[];
}

/**
 * One node of `getAutomationTree()`, which carries last-paint bounds but no style or events;
 * `getTreeJson()` is the reverse, which is why `tree()` stays on it.
 */
export interface AutomationNode {
	id: number;
	type: string;
	text?: string;
	testId?: string;
	bounds?: ElementBounds;
	children?: AutomationNode[];
}

/** A tree node, a shadow node, an automation node or a bare native id. */
export type Target = number | { id?: number; nativeId?: number | null };

export interface Point {
	x: number;
	y: number;
}

/** A target (its centre) or window coordinates. */
export type PointTarget = Target | Point;

export interface FindOptions {
	last?: boolean;
}

export interface MouseOptions {
	/** 0 = left (default), 1 = middle, 2 = right. */
	button?: number;
	/** In `press()` syntax: `'cmd'`, `'cmd-shift'`, `'alt'`. */
	modifiers?: string;
}

export interface MoveOptions {
	/** The button held during the move, which makes it a drag. */
	pressed_button?: number;
	modifiers?: string;
}

export interface DragOptions extends MouseOptions {
	/** Moves between the press and the release; default 8. */
	steps?: number;
}

export interface WaitForOptions {
	/** Default 2000 ms. */
	timeout?: number;
	/** Default 16 ms. */
	interval?: number;
	/** Names the condition in the timeout error; defaults to the predicate's source. */
	label?: string;
}

export type ClickOptions = FindOptions & MouseOptions;

export interface MountHeadlessOptions {
	props?: Record<string, unknown>;
	width?: number;
	height?: number;
	rootStyle?: GpuiStyle;
	keyboardFocusDim?: boolean;
	tabNavigation?: boolean;
}

function native(): TestGpuixRenderer {
	const instance = get_native();
	if (!instance) throw new Error('[gpuix-svelte/test] nothing is mounted — call mount_headless() first');
	return instance as TestGpuixRenderer;
}

export function mount_headless<Exports extends Record<string, unknown> = Record<string, unknown>>(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see AnyComponent
	Component: Component<any, Exports, any>,
	{ props = {}, width, height, rootStyle, keyboardFocusDim, tabNavigation = true }: MountHeadlessOptions = {}
) {
	if (typeof hasTestGpuixRenderer === 'function' && !hasTestGpuixRenderer()) {
		throw new Error('[gpuix-svelte/test] this @gpuix/native build has no TestGpuixRenderer (the Linux prebuild ships without one)');
	}

	const instance = new TestGpuixRenderer(width, height);
	set_native(instance);
	set_tab_navigation(tabNavigation);
	const root = create_root(rootStyle, keyboardFocusDim);
	// A comment anchor, so `mount` doesn't append a stray text node of its own.
	const anchor = renderer.createComment('');
	renderer.insert(root, anchor, null);
	const component = mount(Component, { renderer, target: root, anchor, props });
	blurred = null;
	settle();

	return { native: instance, root, anchor, component, unmount: () => unmount(component) };
}

/** What `unfocus()` reported blurred while native kept it focused, so native's own blur for it is a repeat. */
let blurred: number | null = null;

function deliver(event: EventPayload) {
	if (event.eventType === 'blur' && event.elementId === blurred) {
		blurred = null;
		return;
	}
	dispatch(event);
}

/** Focuses an element through native, whose `focus`/`blur` events reach the tree as a window's would. */
export function focus(target: Target) {
	const id = id_of(target);
	if (id === blurred && native().getFocusedElementId() === id) {
		blurred = null;
		dispatch({ elementId: id, eventType: 'focus' });
		settle();
		return;
	}
	native().focusElement(id);
	native().flush();
	pump();
}

/** The counterpart of `blur()`, which the test renderer lacks: reports the blur to the tree. */
export function unfocus() {
	const id = native().getFocusedElementId();
	if (id == null || id === blurred) return;
	dispatch({ elementId: id, eventType: 'blur' });
	blurred = id;
	settle();
}

/** Runs Svelte's effects, ships the batch, and lets GPUI lay out and paint. */
export function settle() {
	flushSync();
	commit();
	native().flush();
}

/** For updates that arrive on a timer or a promise rather than from an event. */
export async function wait(ms = 30) {
	await new Promise((resolve) => setTimeout(resolve, ms));
	settle();
}

export const tree = (): TreeNode => JSON.parse(native().getTreeJson());

type Visit = (node: TreeNode, parent: TreeNode | null) => void;

function walk(node: TreeNode | null | undefined, visit: Visit, parent: TreeNode | null = null) {
	if (!node) return;
	visit(node, parent);
	for (const child of node.children ?? []) walk(child, visit, node);
}

export function find_all(pred: (node: TreeNode, parent: TreeNode | null) => boolean): TreeNode[] {
	const hits: TreeNode[] = [];
	walk(tree(), (node, parent) => {
		if (pred(node, parent)) hits.push(node);
	});
	return hits;
}

export function find(pred: (node: TreeNode, parent: TreeNode | null) => boolean, { last = false }: FindOptions = {}): TreeNode | null {
	const all = find_all(pred);
	return (last ? all.at(-1) : all[0]) ?? null;
}

export const find_text = (text: string, opts?: FindOptions) => find((n) => n.type === 'text' && n.text === text, opts);
export const find_test_id = (id: string, opts?: FindOptions) => find((n) => n.testId === id, opts);

/** The element around the text node with this content, as GPUI holds it. */
export function element_of(text: string, { last = false }: FindOptions = {}): TreeNode | null {
	const parents: Array<TreeNode | null> = [];
	walk(tree(), (node, parent) => {
		if (node.type === 'text' && node.text === text) parents.push(parent);
	});
	return (last ? parents.at(-1) : parents[0]) ?? null;
}

const id_of = (target: Target): number => (typeof target === 'number' ? target : (target?.id ?? target?.nativeId)) as number;

/** `{ x, y, width, height }` in logical px, from a tree node, a shadow node or an id. */
export const bounds = (target: Target) => native().getElementBounds(id_of(target));

/** Hands every event native queued to the renderer, as the window's callback would. */
export function drain() {
	for (const event of native().drainEvents()) deliver(event);
}

// A component that emits on every paint would otherwise keep pump() going forever.
const MAX_PUMP_ROUNDS = 10;

/**
 * Drains and settles until native has nothing left to report, because the paint a settle
 * triggers can queue events of its own (a hover change, a selection, a finished motion).
 */
export function pump() {
	for (let round = 0; round < MAX_PUMP_ROUNDS; round++) {
		const events = native().drainEvents();
		if (round > 0 && events.length === 0) return;
		for (const event of events) deliver(event);
		settle();
	}
}

/** The element's painted centre, or a throw naming why a pointer could not land there. */
export function center(target: Target): Point {
	const box = bounds(target);
	if (!box) throw new Error(`[gpuix-svelte/test] element ${id_of(target)} has no painted bounds`);

	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	const { width, height } = native().getWindowSize();
	// A clipped node still reports its full bounds, so only the window can say it is unreachable.
	if (x < 0 || y < 0 || x > width || y > height) {
		const cap = process.platform === 'darwin' ? ` (its height caps at ${MAX_HEADLESS_HEIGHT})` : '';
		throw new Error(
			`[gpuix-svelte/test] element ${id_of(target)} is at (${Math.round(x)}, ${Math.round(y)}), outside the ${width}×${height} headless viewport${cap}`
		);
	}
	return { x, y };
}

const is_point = (target: PointTarget): target is Point => typeof target === 'object' && target !== null && 'x' in target && 'y' in target;

/** A point passes through unchecked, so a gesture can end outside every element; anything else is its centre. */
export const point_of = (target: PointTarget): Point => (is_point(target) ? { x: target.x, y: target.y } : center(target));

/**
 * A click at the element's centre through GPUI's own hit testing, occlusion included.
 * `dispatch()` straight at an element skips that, and can pass while the window fails.
 */
export function click(target: Target, { button, modifiers }: ClickOptions = {}) {
	const { x, y } = center(target);
	click_at(x, y, { button, modifiers });
}

/** A Finder-style drop of `paths` on the element's centre, hit-tested like a click. */
export function drop_files(target: Target, paths: string[]) {
	const { x, y } = center(target);
	native().simulateFileDrop(x, y, paths);
	pump();
}

/** A click at window coordinates, through the same hit testing. */
export function click_at(x: number, y: number, { button, modifiers }: ClickOptions = {}) {
	native().simulateClick(x, y, button, modifiers);
	pump();
}

export function click_text(text: string, opts?: ClickOptions) {
	const node = find_text(text, opts);
	if (!node) throw new Error(`[gpuix-svelte/test] no text "${text}" in the tree`);
	click(node, opts);
}

export function click_test_id(id: string, opts?: ClickOptions) {
	const node = find_test_id(id, opts);
	if (!node) throw new Error(`[gpuix-svelte/test] no testId "${id}" in the tree`);
	click(node, opts);
}

/** Moves the pointer there, for `onmouseenter`/`onmouseleave` and `hover=` styles. */
export function hover(target: PointTarget, opts: MoveOptions = {}) {
	mouse_move(target, opts);
}

export function mouse_move(target: PointTarget, { pressed_button, modifiers }: MoveOptions = {}) {
	const { x, y } = point_of(target);
	native().simulateMouseMove(x, y, pressed_button, modifiers);
	pump();
}

export function mouse_down(target: PointTarget, { button, modifiers }: MouseOptions = {}) {
	const { x, y } = point_of(target);
	native().simulateMouseDown(x, y, button, modifiers);
	pump();
}

export function mouse_up(target: PointTarget, { button, modifiers }: MouseOptions = {}) {
	const { x, y } = point_of(target);
	native().simulateMouseUp(x, y, button, modifiers);
	pump();
}

/** One wheel event in px; a negative `delta_y` scrolls down, which is the direction GPUI's offsets go. */
export function wheel(target: PointTarget, delta_x: number, delta_y: number, { modifiers }: { modifiers?: string } = {}) {
	const { x, y } = point_of(target);
	native().simulateScrollWheel(x, y, delta_x, delta_y, modifiers);
	pump();
}

/**
 * Press at `from`, travel to `to` in `steps` moves with the button held, release there.
 * Both ends resolve before the press, since a live preview can move the target under it.
 */
export function drag(from: PointTarget, to: PointTarget, { button = 0, modifiers, steps = 8 }: DragOptions = {}) {
	const start = point_of(from);
	const end = point_of(to);
	const count = Math.max(1, Math.floor(steps));
	mouse_move(start, { modifiers });
	mouse_down(start, { button, modifiers });
	for (let step = 1; step <= count; step++) {
		const t = step / count;
		mouse_move({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }, { pressed_button: button, modifiers });
	}
	mouse_up(end, { button, modifiers });
}

/**
 * Drag-selects text and returns what got selected. Native does the down/move/up itself,
 * because the selection listeners register during paint and need a flush between each.
 */
export function drag_select(from: PointTarget, to: PointTarget): string | null {
	const a = point_of(from);
	const b = point_of(to);
	native().dragSelect(a.x, a.y, b.x, b.y);
	pump();
	return selected_text();
}

/** The current text selection joined in document order, or null. */
export const selected_text = (): string | null => native().getSelectedText();

export function clear_selection() {
	native().clearSelection();
	pump();
}

/** Every `highlight` wash painted in the last frame, with its rects; the quads never reach `painted()`. */
export const painted_highlights = (): HighlightMatch[] => native().getPaintedHighlights();

// GPUI's motion clock: each call pumps, so the frame repaints at the new time and a finished
// motion's `motionComplete` reaches its handler.

export function clock_pause(): number {
	const now = native().clockPause();
	pump();
	return now;
}

export function clock_set(now_ms: number): number {
	const now = native().clockSet(now_ms);
	pump();
	return now;
}

export function clock_fast_forward(delta_ms: number): number {
	const now = native().clockFastForward(delta_ms);
	pump();
	return now;
}

export function clock_resume(): number {
	const now = native().clockResume();
	pump();
	return now;
}

/** Runs GPUI's own due timers (caret blink, drag autoscroll); the motion clock and `setTimeout` keep their own time. */
export function advance_time(ms: number) {
	native().advanceTime(ms);
	pump();
}

/**
 * Polls until `pred()` is truthy and resolves with its value, pumping between tries so
 * timers, promises and native events all get to land.
 */
export async function wait_for<T>(pred: () => T, { timeout = 2000, interval = 16, label }: WaitForOptions = {}): Promise<NonNullable<T>> {
	const started = Date.now();
	for (;;) {
		const value = pred();
		if (value) return value as NonNullable<T>;
		if (Date.now() - started >= timeout) {
			throw new Error(`[gpuix-svelte/test] wait_for(${label ?? String(pred).replace(/\s+/g, ' ')}) timed out after ${timeout} ms`);
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
		pump();
	}
}

export function automation_tree(): AutomationNode | null {
	const json = native().getAutomationTree();
	return json ? (JSON.parse(json) as AutomationNode | null) : null;
}

/** One key in GPUI's keystroke syntax — `'escape'`, `'cmd-k'`, `'shift-tab'`. */
export function press(keystroke: string, { held = false }: { held?: boolean } = {}) {
	native().simulateKeyDown(keystroke, held);
	pump();
}

/** The key-up half `press()` leaves out, for `onkeyup` and `on_window_key('keyup')`. */
export function key_up(keystroke: string) {
	native().simulateKeyUp(keystroke);
	pump();
}

/** Space-separated keystrokes through the focused element's input pipeline. */
export function type(keystrokes: string) {
	native().simulateKeystrokes(keystrokes);
	pump();
}

export const painted = () => native().getPaintedText().join('\n');
export const all_text = () => native().getAllText();

export function screenshot(path: string) {
	native().captureScreenshot(path);
	return path;
}

// Assertions for a plain script that exits 1 on failure.

let failures = 0;
let ran = 0;

export function check(label: string, actual: unknown, expected: unknown = true): boolean {
	ran++;
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures++;
	console.log(
		`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       want ${JSON.stringify(expected)}\n       got  ${JSON.stringify(actual)}`}`
	);
	return ok;
}

export const failed = () => failures;

/**
 * Prints the verdict and exits, so nothing left on a timer keeps the process alive.
 * `expected` is how many `check` calls should have run: nothing else counts them, so
 * assertions that stop executing would otherwise take the file green with them.
 */
export function finish(name: string, expected?: number): never {
	if (ran === 0 || (expected !== undefined && ran !== expected)) {
		console.error(`\n${name}: ran ${ran} assertion(s), expected ${expected ?? 'at least one'}`);
		process.exit(1);
	}
	if (failures > 0) {
		console.error(`\n${failures} failure(s)`);
		process.exit(1);
	}
	console.log(`\n${name} ok`);
	process.exit(0);
}

export type { ShadowNode, HighlightMatch };
