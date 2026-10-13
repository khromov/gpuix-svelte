import { createSubscriber } from 'svelte/reactivity';
import { createTextSearchController, findRanges, type HighlightSpec, type TextSearchSnapshot } from '@gpuix/native/host';
import type { GpuixEvent } from './types.ts';

export interface TextSearchOptions {
	case_sensitive?: boolean;
	whole_word?: boolean;
	color?: string;
	active_color?: string;
	radius?: number;
}

/** Find-in-text over native `highlight`: `highlight={search.spec} onhighlight={search.on_highlight}` on the element to search. */
export class TextSearch {
	#controller = createTextSearchController();
	#query = '';
	#case_sensitive: boolean;
	#whole_word: boolean;
	#style: Pick<HighlightSpec, 'color' | 'activeColor' | 'radius'>;
	#snapshot: TextSearchSnapshot | null = null;
	#spec: HighlightSpec | null = null;
	#notify: (() => void) | undefined;
	#subscribe = createSubscriber((update) => {
		this.#notify = update;
		return () => {
			this.#notify = undefined;
		};
	});

	constructor({ case_sensitive = false, whole_word = false, color, active_color, radius }: TextSearchOptions = {}) {
		this.#case_sensitive = case_sensitive;
		this.#whole_word = whole_word;
		this.#style = { color, activeColor: active_color, radius };
		this.#controller.subscribe(() => this.#changed());
	}

	get query() {
		this.#subscribe();
		return this.#query;
	}

	set query(value: string) {
		if (value === this.#query) return;
		this.#query = value;
		this.#changed();
	}

	get case_sensitive() {
		this.#subscribe();
		return this.#case_sensitive;
	}

	set case_sensitive(value: boolean) {
		if (value === this.#case_sensitive) return;
		this.#case_sensitive = value;
		this.#changed();
	}

	get whole_word() {
		this.#subscribe();
		return this.#whole_word;
	}

	set whole_word(value: boolean) {
		if (value === this.#whole_word) return;
		this.#whole_word = value;
		this.#changed();
	}

	get spec(): HighlightSpec | null {
		this.#subscribe();
		this.#current();
		return this.#spec;
	}

	get total() {
		this.#subscribe();
		return this.#current().total;
	}

	get active() {
		this.#subscribe();
		return this.#current().active;
	}

	readonly on_highlight = (e: GpuixEvent) => {
		this.#current().props.onHighlight?.(e);
	};

	readonly next = () => {
		this.#current();
		this.#controller.next();
	};

	readonly prev = () => {
		this.#current();
		this.#controller.previous();
	};

	readonly go_to = (index: number) => {
		this.#current();
		this.#controller.goTo(index);
	};

	#changed() {
		this.#snapshot = null;
		this.#notify?.();
	}

	// getSnapshot() records the options next()/prev() count against and builds a fresh spec every call,
	// so it runs once per change, and an unchanged spec keeps its identity for set_attribute to skip.
	#current() {
		if (this.#snapshot) return this.#snapshot;
		const snapshot = this.#controller.getSnapshot({
			query: this.#query,
			caseSensitive: this.#case_sensitive,
			wholeWord: this.#whole_word,
			...this.#style
		});
		const spec = (snapshot.props.highlight ?? null) as HighlightSpec | null;
		if (JSON.stringify(spec) !== JSON.stringify(this.#spec)) this.#spec = spec;
		return (this.#snapshot = snapshot);
	}
}

/** Native's matcher in JS, for `ranges` and `matchIndexOffset` over text native has not mounted (a virtual list's offscreen rows). */
export function find_ranges(text: string, query: string, { case_sensitive, whole_word }: Pick<TextSearchOptions, 'case_sensitive' | 'whole_word'> = {}) {
	return findRanges({ text, query, caseSensitive: case_sensitive, wholeWord: whole_word });
}
