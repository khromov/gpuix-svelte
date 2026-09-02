import { focus_element } from 'gpuix-svelte';
import type { ShadowNode } from 'gpuix-svelte';

export type ToastKind = 'info' | 'error' | 'success';
export interface Toast {
	id: number;
	text: string;
	kind: ToastKind;
}
export interface Suggestion {
	label: string;
	hint: string;
	apply: () => void;
}
export interface Suggest {
	items: Suggestion[];
	active: number;
	left: number;
	top: number;
	width: number;
}

export const ui = $state<{ title: string; modals: number; toasts: Toast[]; suggest: Suggest | null; tick: number }>({
	title: 'Everything',
	/** Dialogs up right now; each renders itself through a <Portal> from wherever it is needed. */
	modals: 0,
	toasts: [],
	/** Completions under the search box; the SearchBar paints them through a <Portal>. */
	suggest: null,
	tick: 0
});

const nodes: Record<string, ShadowNode> = {};
let next_toast = 1;
let ticker: ReturnType<typeof setInterval> | null = null;
let ticker_users = 0;

/** Registers a shadow node so `focus(name)` can reach it. */
export function register(name: string, node: ShadowNode) {
	nodes[name] = node;
}

export function focus(name: string) {
	focus_element(nodes[name]);
}

export function toast(text: string, kind: ToastKind = 'info') {
	const id = next_toast++;
	ui.toasts.push({ id, text, kind });
	setTimeout(() => {
		const at = ui.toasts.findIndex((t) => t.id === id);
		if (at !== -1) ui.toasts.splice(at, 1);
	}, kind === 'error' ? 6000 : 3500);
}

/** A shared 80 ms tick for spinners — GPUI has no looping animation of its own. */
export function use_ticker(): () => void {
	ticker_users++;
	if (!ticker) {
		ticker = setInterval(() => {
			ui.tick = (ui.tick + 1) % 1000;
		}, 80);
	}
	return () => {
		ticker_users--;
		if (ticker_users <= 0 && ticker) {
			clearInterval(ticker);
			ticker = null;
			ticker_users = 0;
		}
	};
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export const spinner_frame = () => SPINNER[ui.tick % SPINNER.length];
