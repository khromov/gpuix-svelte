import { focus_element } from 'gpuix-svelte';

/**
 * @typedef {{ title: string, body?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }} ModalOptions
 */

export const ui = $state({
	title: 'Everything',
	/** @type {(ModalOptions & { resolve: (ok: boolean) => void }) | null} */
	modal: null,
	/** @type {Array<{ id: number, text: string, kind: 'info' | 'error' | 'success' }>} */
	toasts: [],
	/** Completions under the search box, painted from the root so the page cannot cover them. */
	/** @type {{ items: Array<{ label: string, hint: string, apply: () => void }>, active: number, left: number, top: number, width: number } | null} */
	suggest: null,
	tick: 0
});

const nodes = {};
let next_toast = 1;
let ticker = null;
let ticker_users = 0;

/** Registers a shadow node so `focus(name)` can reach it. */
export function register(name, node) {
	nodes[name] = node;
}

export function focus(name) {
	focus_element(nodes[name]);
}

/** @param {ModalOptions} options @returns {Promise<boolean>} */
export function confirm(options) {
	return new Promise((resolve) => {
		ui.modal = { ...options, resolve };
	});
}

export function close_modal(ok = false) {
	const modal = ui.modal;
	ui.modal = null;
	modal?.resolve(ok);
}

/** @param {string} text @param {'info' | 'error' | 'success'} [kind] */
export function toast(text, kind = 'info') {
	const id = next_toast++;
	ui.toasts.push({ id, text, kind });
	setTimeout(() => {
		const at = ui.toasts.findIndex((t) => t.id === id);
		if (at !== -1) ui.toasts.splice(at, 1);
	}, kind === 'error' ? 6000 : 3500);
}

/** A shared 80 ms tick for spinners — GPUI has no looping animation of its own. */
export function use_ticker() {
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
