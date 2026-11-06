/**
 * A toast queue any module can push to, read by `<Toaster>` wherever it is rendered. Plain state behind
 * `createSubscriber` rather than a runes module, so it ships as JavaScript the consumer's loader never
 * has to compile.
 */

import { createSubscriber } from 'svelte/reactivity';
import type { Tone } from './shared.ts';

export interface ToastOptions {
	title: string;
	description?: string;
	tone?: Tone;
	/** Milliseconds until it goes by itself (default 4000); null keeps it until dismissed. */
	duration?: number | null;
	action?: { label: string; onclick: () => void };
}

export interface ToastItem extends ToastOptions {
	id: number;
	tone: Tone;
}

let items: readonly ToastItem[] = [];
let next_id = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

let notify = () => {};
const subscribe = createSubscriber((update) => {
	notify = update;
	return () => {
		notify = () => {};
	};
});

/** The toasts showing, newest last, reactive wherever a template or effect reads it. */
export const toasts = {
	get current(): readonly ToastItem[] {
		subscribe();
		return items;
	}
};

/** Shows a toast and returns its id; a plain string is its title. */
export function toast(options: ToastOptions | string): number {
	const given = typeof options === 'string' ? { title: options } : options;
	const item: ToastItem = { tone: 'neutral', duration: 4000, ...given, id: next_id++ };
	items = [...items, item];
	if (item.duration != null) timers.set(item.id, setTimeout(() => dismiss_toast(item.id), item.duration));
	notify();
	return item.id;
}

export function dismiss_toast(id: number) {
	const timer = timers.get(id);
	if (timer !== undefined) clearTimeout(timer);
	timers.delete(id);
	if (!items.some((t) => t.id === id)) return;
	items = items.filter((t) => t.id !== id);
	notify();
}

export function clear_toasts() {
	for (const timer of timers.values()) clearTimeout(timer);
	timers.clear();
	if (items.length === 0) return;
	items = [];
	notify();
}
