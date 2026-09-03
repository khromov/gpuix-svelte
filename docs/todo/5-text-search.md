# 5. `TextSearch`: a runes class over native `highlight`

| | |
|---|---|
| Candidate | E in `docs/comparison-gpuix-solid.md` |
| Size | S: about 45 lines of source, 55 of test, one `exports` entry |
| Depends on | nothing (task 2's `painted_highlights()` makes the test shorter) |
| Unblocks | a find bar in the tutorial or Substrate without hand-built specs |
| Line numbers | as of `e729a86` |

## Goal

A small reactive helper that turns a query into the native `highlight` spec, tracks the match
count the renderer reports, and moves the active match, so a component writes
`highlight={search.spec} onhighlight={search.on_highlight}` and nothing else.

## Background

The native `highlight` prop is accepted on `div` and `text` (it is in `UNIVERSAL_PROPS`,
[`src/renderer.ts:42`](../../src/renderer.ts#L42)). Its parser reads `query`, `caseSensitive`,
`wholeWord`, `ranges`, `color`, `activeColor`, `activeIndex`, `matchIndexOffset` and `radius`
(native `text/search.rs`). The `highlight` event fires with `matchCount` only when the element
listens for it. Highlighting is painted natively; `getPaintedHighlights()` exposes the result
to tests.

gpuix-solid's [`useTextSearch`][solid-search] returns `{ props: { highlight, onHighlight },
total, active, next(), previous(), goTo(index) }`. Internals: a `reported` signal (native
count) and a `requested` signal (the caret), `total` is 0 for an empty query, `active` is
`min(requested, total - 1)`, `next`/`previous` wrap modulo `total`. It also ships `findRanges`, a
JS reimplementation of the native matcher with a UTF-16 case-fold index map so surrogate pairs
map back to original offsets.

Here, every app writes the spec by hand. Substrate computes its own multi-term ranges in
`examples/second-brain/lib/rank.ts` (`match_ranges`) and passes the `{ ranges, color, radius }`
form from `components/ItemCard.svelte`. There is no shared `HighlightSpec` type.

## Design

`src/search.svelte.ts`, the package's first `.svelte.ts`. Both loaders compile `.svelte.ts`
modules (`src/register.ts`, `src/plugin.ts`, and `scripts/compile.ts` wires `load_module` for
the binary path). Keep it off `src/index.ts` so the main entry stays runes-free, and add
`"./search": "./src/search.svelte.ts"` to `exports` in `package.json`. Consumers' `tsc` resolves
it like the other `.ts` targets (`allowImportingTsExtensions`); the runes ambient types come from
`svelte`, which `test/ModuleStore.svelte.ts` already proves for this repo's gate.

```ts
import type { GpuixEvent, HighlightSpec } from './types.ts';

export interface TextSearchOptions {
	case_sensitive?: boolean;
	whole_word?: boolean;
	color?: string;
	active_color?: string;
	radius?: number;
}

export class TextSearch {
	query = $state('');
	#reported = $state(0);
	#requested = $state(0);
	#options: TextSearchOptions;

	constructor(options: TextSearchOptions = {}) {
		this.#options = options;
	}

	readonly total = $derived(this.query === '' ? 0 : this.#reported);
	readonly active = $derived(this.total === 0 ? 0 : Math.min(this.#requested, this.total - 1));
	readonly spec: HighlightSpec | null = $derived(
		this.query === ''
			? null
			: {
					query: this.query,
					activeIndex: this.active,
					caseSensitive: this.#options.case_sensitive,
					wholeWord: this.#options.whole_word,
					color: this.#options.color,
					activeColor: this.#options.active_color,
					radius: this.#options.radius
				}
	);

	on_highlight = (e: GpuixEvent) => {
		this.#reported = e.matchCount ?? 0;
	};
	next() { if (this.total) this.#requested = (this.active + 1) % this.total; }
	prev() { if (this.total) this.#requested = (this.active + this.total - 1) % this.total; }
	go_to(i: number) { if (i >= 0 && i < this.total) this.#requested = i; }
}
```

`HighlightSpec` goes in [`src/types.ts`](../../src/types.ts) and is exported from the index:

```ts
export interface HighlightSpec {
	query?: string;
	ranges?: [number, number][];
	caseSensitive?: boolean;
	wholeWord?: boolean;
	color?: string;
	activeColor?: string;
	activeIndex?: number;
	matchIndexOffset?: number;
	radius?: number;
}
```

Substrate's `{ ranges, color, radius }` form is then typed by the same interface.

Usage:

```svelte
<script lang="ts">
	import { TextSearch } from 'gpuix-svelte/search';
	const search = new TextSearch({ color: '#f9e2af55', active_color: '#f9e2af' });
</script>

<input value={search.query} onchange={(e) => (search.query = e.value)} onsubmit={() => search.next()} />
<text>{search.active + 1}/{search.total}</text>
<div highlight={search.spec} onhighlight={search.on_highlight}>{body}</div>
```

`spec === null` goes through `setAttribute`'s null branch → `removeAttribute` →
`setCustomProp(id, 'highlight', null)`, which clears the highlight natively.

Leave out `findRanges`. The native matcher does the matching, `getPaintedHighlights()` exposes
matches to tests, and Substrate's multi-term ranking is a different algorithm that stays
app-local. Multi-element find bars (`matchIndexOffset`, summed totals) are a documented manual
escape hatch, not part of the class.

## Tests

`test/search.ts` with fixture `test/Search.svelte`; script `test:search` plus the Bun twin,
chained into both `test` scripts. The test constructs `new TextSearch()` itself and passes it
as a prop (`mount_headless(Search, { props: { search } })`), as `test/module.ts` does for a
store, so it can drive it from outside.

Fixture: a text `the quick fox jumps over the lazy fox` with `highlight={search.spec}
onhighlight={search.on_highlight}`, `next` and `prev` buttons, and `{search.active + 1}/{search.total}`.

Flow:

1. `search.query = 'fox'`; `settle(); drain(); settle();` (the `highlight` event is emitted
   during the flush and has to be drained like a click's); the counter reads `1/2`.
2. `native.getPaintedHighlights()` (or task 2's `painted_highlights()`) has 2 entries and the
   first is `active`.
3. `click_text('next')` + drain/settle: the second is active; another `next` wraps to the first.
4. `search.query = ''`: `total` is 0, no painted highlights, `spec === null`.
5. `go_to(5)` on 2 matches is a no-op.

## Docs

- README: a "Text search" paragraph after "Theming with CSS variables" (line 286).
- CLAUDE.md: the `highlight` bullet under "Writing components for this renderer" mentions
  `TextSearch`; the Architecture tree adds `search.svelte.ts`; Commands block adds `test:search`.

## Constraints

- eslint already covers `**/*.svelte.ts`; tsc `include` covers `src`.
- No new dependencies.

## Acceptance

- [ ] `gpuix-svelte/search` exports `TextSearch` and `TextSearchOptions`; `gpuix-svelte` exports `HighlightSpec`.
- [ ] `test:search` passes on Node and Bun; typecheck and eslint clean.
- [ ] Substrate's `ItemCard.svelte` typechecks against `HighlightSpec` unchanged (optional: annotate it).
- [ ] README and CLAUDE.md updated.

## Risks

First `.svelte.ts` in `src/`. If a consumer's loader ever fails to compile it, the symptom is a
`$state is not defined` at import; the `consume` script would catch that, so run
`npm run consume` once after adding the export.

## Sources

[solid-search]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/hooks/use-text-search.ts#L25-L88
