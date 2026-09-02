/**
 * Headless testing on the real GPUI pipeline. `TestGpuixRenderer` runs Metal or
 * DirectX without a window; this is the mount / settle / hit-test loop around it
 * that every test used to spell out, bound to whatever native the renderer holds.
 */

import { TestGpuixRenderer, hasTestGpuixRenderer } from '@gpuix/native';
import { mount, unmount, flushSync, type Component } from 'svelte';
import renderer, { set_native, get_native, create_root, commit, dispatch } from './renderer.ts';
import type { GpuiStyle, ShadowNode } from './types.ts';

/** The headless viewport can be any width, but never taller than this; Windows ignores the size altogether. */
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

/** A tree node, a shadow node or a bare native id. */
export type Target = number | { id?: number; nativeId?: number | null };

export interface FindOptions {
	last?: boolean;
}

export interface ClickOptions extends FindOptions {
	button?: number;
	modifiers?: string;
}

export interface MountHeadlessOptions {
	props?: Record<string, any>;
	width?: number;
	height?: number;
	rootStyle?: GpuiStyle;
}

function native(): TestGpuixRenderer {
	const instance = get_native();
	if (!instance) throw new Error('[gpuix-svelte/test] nothing is mounted — call mount_headless() first');
	return instance as TestGpuixRenderer;
}

export function mount_headless<Exports extends Record<string, any> = Record<string, any>>(
	Component: Component<any, Exports, any>,
	{ props = {}, width, height, rootStyle }: MountHeadlessOptions = {}
) {
	if (typeof hasTestGpuixRenderer === 'function' && !hasTestGpuixRenderer()) {
		throw new Error('[gpuix-svelte/test] this @gpuix/native build has no TestGpuixRenderer (the Linux prebuild ships without one)');
	}

	const instance = new TestGpuixRenderer(width, height);
	set_native(instance);
	const root = create_root(rootStyle);
	// A comment anchor, so `mount` doesn't append a stray text node of its own.
	const anchor = renderer.createComment('');
	renderer.insert(root, anchor, null);
	const component = mount(Component, { renderer, target: root, anchor, props });
	focused = null;
	settle();

	return { native: instance, root, anchor, component, unmount: () => unmount(component) };
}

let focused: number | null = null;

/**
 * Focuses an element through native and stands in for the `focus`/`blur` events the
 * headless renderer never emits (a window does), so `editing` and `onfocus` follow.
 */
export function focus(target: Target) {
	const id = id_of(target);
	unfocus();
	native().focusElement(id);
	native().flush();
	drain();
	dispatch({ elementId: id, eventType: 'focus' });
	focused = id;
	settle();
}

/** The counterpart of `blur()`, which the test renderer lacks: reports the blur to the tree. */
export function unfocus() {
	if (focused === null) return;
	dispatch({ elementId: focused, eventType: 'blur' });
	focused = null;
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

/** `[x, y, width, height]` in logical px, from a tree node, a shadow node or an id. */
export const bounds = (target: Target) => native().getElementBounds(id_of(target));

/** Hands every event native queued to the renderer, as the window's callback would. */
export function drain() {
	for (const event of native().drainEvents()) dispatch(event);
}

/**
 * A click at the element's centre through GPUI's own hit testing, occlusion included.
 * `dispatch()` straight at an element skips that, and can pass while the window fails.
 */
export function click(target: Target, { button, modifiers }: ClickOptions = {}) {
	const box = bounds(target);
	if (!box) throw new Error(`[gpuix-svelte/test] element ${id_of(target)} has no painted bounds`);

	const [x, y, w, h] = box;
	const cx = x + w / 2;
	const cy = y + h / 2;
	const { width, height } = native().getWindowSize();
	if (cx > width || cy > height) {
		throw new Error(
			`[gpuix-svelte/test] element ${id_of(target)} is at (${Math.round(cx)}, ${Math.round(cy)}), outside the ${width}×${height} headless viewport (its height caps at ${MAX_HEADLESS_HEIGHT})`
		);
	}

	click_at(cx, cy, { button, modifiers });
}

/** A click at window coordinates, through the same hit testing. */
export function click_at(x: number, y: number, { button, modifiers }: ClickOptions = {}) {
	native().simulateClick(x, y, button, modifiers);
	drain();
	settle();
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

/** One key in GPUI's keystroke syntax — `'escape'`, `'cmd-k'`, `'shift-tab'`. */
export function press(keystroke: string, { held = false }: { held?: boolean } = {}) {
	native().simulateKeyDown(keystroke, held);
	drain();
	settle();
}

/** Space-separated keystrokes through the focused element's input pipeline. */
export function type(keystrokes: string) {
	native().simulateKeystrokes(keystrokes);
	drain();
	settle();
}

export const painted = () => native().getPaintedText().join('\n');
export const all_text = () => native().getAllText();

export function screenshot(path: string) {
	native().captureScreenshot(path);
	return path;
}

// Assertions: a plain script that exits 1 on failure — no runner.

let failures = 0;

export function check(label: string, actual: unknown, expected: unknown = true): boolean {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures++;
	console.log(
		`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       want ${JSON.stringify(expected)}\n       got  ${JSON.stringify(actual)}`}`
	);
	return ok;
}

export const failed = () => failures;

/** Prints the verdict and exits, so nothing left on a timer keeps the process alive. */
export function finish(name: string): never {
	if (failures > 0) {
		console.error(`\n${failures} failure(s)`);
		process.exit(1);
	}
	console.log(`\n${name} ok`);
	process.exit(0);
}

export type { ShadowNode };
