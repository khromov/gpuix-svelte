# 8. Style parity: `overflow: auto`, `rem`, intrinsic sizes

| | |
|---|---|
| Candidate | H in `docs/comparison-gpuix-solid.md` |
| Size | XS: about 15 lines of source, 10 of test, about 10 doc spots |
| Depends on | nothing; the smallest task, a good first one |
| Unblocks | fewer "looks like CSS but is not" surprises; `hitbox="self"` sees `overflow-y: auto` columns as scrolling |
| Line numbers | as of `e729a86` |

## Goal

Three CSS spellings that authors reach for reflexively stop being silent no-ops or dropped
values: `overflow: auto` becomes `scroll`, `rem` becomes pixels at 16 per rem, and
`max-content`/`min-content`/`fit-content` become `auto` on dimension keys. `em`, `vh` and `vw`
stay unsupported, on purpose.

## Background

gpuix-solid's [`normalizeStyleMutation`][solid-normalize] rewrites `overflow*: auto` to
`scroll`, parses `Nrem` as `N × 16`, resolves `Nem` on dimension keys against the element's own
`fontSize` (default 16), and collapses `max-content`, `min-content`, `fit-content` and
`fit-content(...)` to `auto`. Anything else numeric-looking throws a `TypeError`.

Native facts (0.7.0 `renderer.rs` `apply_styles`): `overflow` matches only `"scroll"` and
`"hidden"`; `StyleDesc.overflow` is `Option<String>`, so any other string is accepted by serde
and ignored. `DimensionValue` (`width`, `height`, `min*`, `max*`) accepts numbers, `auto` and
`%` only. GPUI's rem size defaults to 16 px and gpuix never changes it; there is no rem field in
`StyleDesc`.

Our [`src/style.ts`](../../src/style.ts):

- `coerce()` (lines 172-175) turns `12px` and bare `12` into numbers; everything else stays a
  string.
- `accepts()` (lines 177-186) rejects `NEVER` keys, non-numbers on `NUMBER_ONLY` keys, anything
  but a number, `auto` or `%` on `DIMENSION` keys (line 55), and any other string that starts
  numeric-looking. `overflow: auto` passes (a non-numeric string on an untyped key) and is
  silently ignored natively. `1rem` is rejected with a warning. `max-content` on `width` is
  rejected with a warning.
- `assign()` (lines 193-205) is where a keyword step fits, before `accepts()`.
- `shielded()` in [`src/renderer.ts:257-262`](../../src/renderer.ts#L257-L262) treats an
  element as scrolling by looking at its resolved `overflow` values; after this task an
  `overflow-y: auto` column keeps its hitbox under `hitbox="self"`.

## Design

In `src/style.ts`:

```ts
const REM = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)rem$/i;
const INTRINSIC = /^(?:max-content|min-content|fit-content)(?:\(.*\))?$/;
const KEYWORDS: Record<string, Record<string, string> | undefined> = {
	overflow: { auto: 'scroll' },
	overflowX: { auto: 'scroll' },
	overflowY: { auto: 'scroll' }
};

function coerce(value: string): StyleValue {
	// ...existing px / bare-number cases...
	if (REM.test(value)) return parseFloat(value) * 16;   // GPUI's rem is fixed at 16 px
	return value;
}

function assign(out: GpuiStyle, key: string, value: string) {
	let coerced = coerce(value);
	if (typeof coerced === 'string') {
		coerced = KEYWORDS[key]?.[coerced] ?? (DIMENSION.has(key) && INTRINSIC.test(coerced) ? 'auto' : coerced);
	}
	// ...existing accepts() + put()...
}
```

Skip `em`: it needs the element's resolved font size (a second pass after `merge` in
`build_style`), and CSS `em` means the inherited size, which the renderer cannot see;
gpuix-solid's "own `fontSize` or 16" is a guess. Keep dropping it with the warning. Skip `vh`
and `vw`: class rules are parsed at compile time and inline styles do not re-resolve on resize.

## Tests

Extend `test/style.ts` (no new script):

- `padding: 1rem; gap: 0.5rem` → `{ paddingTop: 16, ..., gap: 8 }` (padding expands to the four
  longhands; assert the expanded form).
- `overflow: auto; overflow-y: auto` → `{ overflow: 'scroll', overflowY: 'scroll' }`.
- `width: max-content; min-width: fit-content(200px)` → `{ width: 'auto', minWidth: 'auto' }`.
- Change the existing dropped-unit case from `1rem` to `1em`; it must still warn and drop.
- The shorthand-heavy style that currently includes `font-size: 1rem` keeps it and the commit
  still survives (`1rem` now ships as 16).
- Optional in `test/hitbox.ts`: an `overflow-y: auto` column under `hitbox="self"` keeps its
  hitbox.

Confirm what reached GPUI headlessly with `tree()`: each node's `style` is the deserialized
`StyleDesc`, so `overflow: 'scroll'` and `fontSize: 16` are visible there.

## Docs (most of the work)

- README, "Styling" (line 182): the units sentence ("Units other than `px`…") becomes "`rem` is
  16 px, GPUI's fixed rem size; `em`, `vh`, `vw` are dropped…"; the `overflow` entry says `auto`
  reads as `scroll`; the "looks like CSS but is not" list says the intrinsic keywords read as
  `auto`.
- CLAUDE.md: the "Writing components for this renderer" bullet about `rem`/`em`/`vh`, and the
  `style.ts` paragraph under Architecture.
- `examples/tutorial/content/styling.md`, first paragraph.
- `examples/tutorial/steps.ts` lines 242-258: the diagram node `fontSize: 1rem → warned,
  dropped` and the quiz option `font-size: 1rem` must change to `1em`, or the quiz has two right
  answers; update the explanation ("rem is not a pixel").
- `examples/styling-playground/StylingPlayground.svelte` around line 82: the card
  `font-size: 1rem; padding: 1em` splits; `padding: 1em` stays in the dropped column,
  `font-size: 1rem` moves to the "GPUI takes it" column with "1rem is 16 px".

## Acceptance

- [ ] The three rewrites land in `tree()` output headlessly.
- [ ] `test:style` passes on Node and Bun; the tutorial quiz still has one right answer.
- [ ] README, CLAUDE.md, tutorial and playground agree with the code.

## Sources

[solid-normalize]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/host/mutations.ts#L219-L276
