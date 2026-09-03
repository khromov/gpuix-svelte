import { focus_element } from 'gpuix-svelte';
import type { GpuixEvent, ShadowNode } from 'gpuix-svelte';
import type { IconName } from './icons.ts';

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

export interface MenuAction {
	label: string;
	icon?: IconName;
	/** Right-aligned: a shortcut, a current value, whatever the row needs to say. */
	hint?: string;
	danger?: boolean;
	disabled?: boolean;
	/** Puts a dialog in front of `run`; ContextMenu hosts it, so no confirm promise is needed. */
	confirm?: { title: string; body?: string; confirmLabel: string };
	run: () => unknown;
}
export type MenuEntry = MenuAction | 'separator';
export interface Menu {
	title: string | null;
	entries: MenuEntry[];
	x: number;
	y: number;
	active: number;
}

export const ui = $state<{ title: string; modals: number; toasts: Toast[]; suggest: Suggest | null; menu: Menu | null; tick: number }>({
	title: 'Everything',
	/** Dialogs up right now; each renders itself through a <Portal> from wherever it is needed. */
	modals: 0,
	toasts: [],
	/** Completions under the search box; the SearchBar paints them through a <Portal>. */
	suggest: null,
	/** The open context menu; App paints it through a <Portal>, above everything but a dialog. */
	menu: null,
	tick: 0
});

/**
 * GPUI sends a right click to `auxClick`, never to `click`, but routes macOS's
 * ctrl+click to `click` — so a surface has to watch both to catch a secondary click.
 */
export const is_secondary = (e: GpuixEvent) => e.isRightClick === true || (process.platform === 'darwin' && e.modifiers?.ctrl === true);

export function open_menu(e: GpuixEvent, entries: MenuEntry[], title: string | null = null) {
	// auxClick is every non-primary button, so a middle click gets here too.
	if (!is_secondary(e)) return;
	const actions = entries.filter((entry) => entry !== 'separator');
	if (!actions.length) return;
	ui.suggest = null;
	ui.menu = { title, entries: trim(entries), x: e.x ?? 0, y: e.y ?? 0, active: -1 };
}

export function close_menu() {
	ui.menu = null;
}

/** Applicability filtering leaves leading, trailing and doubled separators behind. */
function trim(entries: MenuEntry[]): MenuEntry[] {
	const out: MenuEntry[] = [];
	for (const entry of entries) {
		if (entry === 'separator' && (out.length === 0 || out[out.length - 1] === 'separator')) continue;
		out.push(entry);
	}
	if (out[out.length - 1] === 'separator') out.pop();
	return out;
}

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
