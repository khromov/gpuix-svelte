/**
 * The windowed twin of `test.ts`. The Linux prebuild ships no `TestGpuixRenderer`, so
 * a real window is the only way to assert against GPUI there — this drives the same
 * `render()` the demos use and reads back through `getAutomationTree()`.
 *
 * It is read-only by design. `simulate*` on a windowed renderer dispatches from inside
 * a GPUI update, so the handler it fires re-enters through `handle_event`'s inline
 * `commit()` and GPUI aborts ("cannot update GpuixView while it is already being
 * updated") — on macOS directly, and on Linux/Windows through the napi callback the
 * `gpuix-ui` thread makes synchronously. Real input has to come from outside the
 * process instead: `npm run linux:click` drives sway's pointer, which arrives on
 * GPUI's ordinary, non-reentrant path exactly like a user's click.
 *
 * `getPaintedText()`/`getPaintedHighlights()` are absent here for a related reason:
 * they read a thread-local filled while painting, so off macOS they are read from the
 * wrong thread and always come back empty. Use `all_text()`.
 */

import type { GpuixRenderer } from '@gpuix/native';
import { flushSync } from 'svelte';
import { get_native, commit } from './renderer.ts';
import { render } from './render.ts';
import type { AnyComponent, RenderOptions } from './types.ts';

/**
 * One node of `getAutomationTree()`. It is `getTreeJson()` without `style`, `events`
 * and `customProps` — skipped so a long list is not 100ms of JSON — but with the
 * painted `bounds` of every node, which is what makes layout assertable here.
 */
export interface WindowNode {
	id: number;
	type: string;
	text?: string;
	testId?: string;
	bounds?: { x: number; y: number; width: number; height: number };
	children?: WindowNode[];
}

export type Target = number | { id?: number; nativeId?: number | null };

export interface FindOptions {
	last?: boolean;
}

/** Long enough for the compositor to lay out and paint under software rendering. */
const SETTLE_MS = 120;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function native(): GpuixRenderer {
	const instance = get_native();
	if (!instance) throw new Error('[gpuix-svelte/test-window] nothing is mounted — call mount_window() first');
	return instance as GpuixRenderer;
}

export async function mount_window(Component: AnyComponent, options: RenderOptions = {}) {
	const component = render(Component, { title: 'gpuix-svelte test', width: 900, height: 620, ...options });
	await settle();
	return { native: native(), component };
}

/** Runs Svelte's effects, ships the batch, and gives the window time to paint it. */
export async function settle(ms = SETTLE_MS) {
	flushSync();
	commit();
	await sleep(ms);
}

/** `request_invalidate()` runs first inside native, so reading the tree also syncs a frame. */
export const tree = (): WindowNode => JSON.parse(native().getAutomationTree());

type Visit = (node: WindowNode, parent: WindowNode | null) => void;

function walk(node: WindowNode | null | undefined, visit: Visit, parent: WindowNode | null = null) {
	if (!node) return;
	visit(node, parent);
	for (const child of node.children ?? []) walk(child, visit, node);
}

export function find_all(pred: (node: WindowNode, parent: WindowNode | null) => boolean): WindowNode[] {
	const hits: WindowNode[] = [];
	walk(tree(), (node, parent) => {
		if (pred(node, parent)) hits.push(node);
	});
	return hits;
}

export function find(pred: (node: WindowNode, parent: WindowNode | null) => boolean, { last = false }: FindOptions = {}): WindowNode | null {
	const all = find_all(pred);
	return (last ? all.at(-1) : all[0]) ?? null;
}

export const find_text = (text: string, opts?: FindOptions) => find((n) => n.type === 'text' && n.text === text, opts);
export const find_test_id = (id: string, opts?: FindOptions) => find((n) => n.testId === id, opts);

/** The element around the text node with this content, as GPUI holds it. */
export function element_of(text: string, { last = false }: FindOptions = {}): WindowNode | null {
	const parents: Array<WindowNode | null> = [];
	walk(tree(), (node, parent) => {
		if (node.type === 'text' && node.text === text) parents.push(parent);
	});
	return (last ? parents.at(-1) : parents[0]) ?? null;
}

const id_of = (target: Target): number => (typeof target === 'number' ? target : (target?.id ?? target?.nativeId)) as number;

/** `[x, y, width, height]` in logical px — from the node's own `bounds` where it has them. */
export function bounds(target: Target): number[] | null {
	if (typeof target === 'object' && target !== null && 'bounds' in target) {
		const box = (target as WindowNode).bounds;
		if (box) return [box.x, box.y, box.width, box.height];
	}
	return native().getElementBounds(id_of(target));
}

export const window_size = () => native().getWindowSize();
export const all_text = () => native().getAllText();

export { check, failed, finish } from './assert.ts';
