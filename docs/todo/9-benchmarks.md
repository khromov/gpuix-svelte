# 9. Benchmarks: a headless workload and a serialization bench

| | |
|---|---|
| Candidate | I in `docs/comparison-gpuix-solid.md` |
| Size | M: two scripts of about 150 lines, a fixture, a 40-line stats helper |
| Depends on | 4 (overlay stats through the wrappers) and 2 (wheel and clock helpers); both optional but they shorten the code |
| Unblocks | numbers to quote when the custom-renderer PR is discussed upstream; a regression check before native bumps |
| Line numbers | as of `e729a86` |

## Goal

Two runnable, package-level benchmarks that print p50/p95/max tables on both runtimes: a
headless component workload (mount, idle flush, wheel, highlight keystrokes, a motion toggle
under a paused clock) and a serialization bench over the real `applyBatch` payload. They are
`bench:*` scripts, not part of `test`.

## Background

gpuix-solid ports the upstream chat and timeline workloads and adds a serialization bench
([benchmarks/][solid-bench]):

- [`stats.ts`][solid-stats]: `percentile`, `summarize` → `{ n, p50, p95, max }`, `report(prefix,
  label, samples)` printing `n=… p50=…ms p95=…ms max=…ms`, `median`.
- [`chat.tsx`][solid-chat]: `TURNS` (default 1,000), `WARMUP` 10, `SAMPLES` 40. Measures mount
  time, idle `flush()` cost, `nativeSimulateScrollWheel` cost at a fixed point alternating
  direction every 8 samples, the debug-overlay p90/max after a reset, highlight cost per
  keystroke of a growing query and per active-index move, and sidebar clicks under
  `clock.pause()` with `fastForward(200)` between them. Prints the upstream React reference
  budgets as references, not pass/fail limits.
- [`timeline.tsx`][solid-timeline]: 24 tracks, 900 s, 1280×800; pan cost with and without
  culling, and pointer-captured clip drags.
- [`serialization.tsx`][solid-serialization]: a `CaptureRenderer` whose `applyBatch` records
  the parsed tuples; captures a 2,000-turn mount; writes the fixture to `tmp/`; measures
  `JSON.stringify` encode and `JSON.parse` decode medians and wire bytes for plain JSON, JSON
  through a UTF-8 `Buffer`, and a style-interning variant that replaces repeated `setStyle`
  objects with `defineStyle`/`setStyleRef` refs. Interning is measured, not implemented.

Prior art here: `examples/second-brain/scripts/frame-cost.ts` (CLAUDE.md, "Measuring frame
cost") boots Substrate in a live window, visits routes, and prints GPUI draw times from the
debug overlay at idle and while 90 wheel events scroll. It is Bun-only and app-specific.
Baselines recorded 2026-09-03: timeline ~4.6 ms a frame, settings ~7-9 ms. Nothing measures the
package itself, and nothing measures the JS side of a commit.

## Design

### `scripts/bench/stats.ts`

Port `stats.ts` as-is (snake_case): `percentile`, `summarize`, `report`, `median`. Plain
`node:*` TypeScript.

### `scripts/bench/List.svelte` (the workload)

A component that takes `rows` (default 1,000) and renders a chat-like list: each row a card with
a heading text, two or three body texts of varying length, a `<code>` block every 10th row, a
class-rule style with `:hover`, and a `<svg source>` icon. Two variants by prop: a plain
`overflow: scroll` column and `<Scroller virtual>`. A `highlight={spec}` on the column and a
`motion` sidebar toggled by a `testId="toggle"` button. Keep it under 120 lines; it is a
fixture, not an example.

### `scripts/bench-list.ts` (`bench:list`, `bun:bench:list`)

Runs headlessly through `mount_headless` from `gpuix-svelte/test` (so it goes through the bin
like a test) and prints, for both variants:

- `mount rows=N …ms` (time from `mount_headless` to the first `settle()`).
- `idle flush` over 40 samples after 10 warm-ups (`native.flush()` cost).
- `wheel` over 40 `wheel()` calls at the column centre, alternating direction every 8.
- Overlay `p90`/`max` after `reset_debug_overlay_stats()` + a flush (task 4), or the raw calls.
- `highlight keystroke`: set the query to a growing prefix of a word, `settle()` each, time it.
- `highlight cursor`: move `activeIndex` 20 times.
- `toggle` under `clock_pause()` with `clock_fast_forward(200)` between 8 clicks.

Env: `ROWS`, `SAMPLES`. Skip with a message when `hasTestGpuixRenderer()` is false (Linux).
Print a one-line note that numbers are only comparable on the same machine, native version and
fixture.

### `scripts/bench-serialization.ts` (`bench:serialization`, `bun:bench:serialization`)

Mount the same `List.svelte` against a capturing `NativeSink` (the stub pattern from
`test/lifecycle.ts:15-32`, `set_native` + `create_root`), collect every `applyBatch` JSON, parse
to tuples, and write the fixture to `$TMPDIR`. Then, over `ITERATIONS` (default 9):

| path | encode | decode | wire bytes | vs JSON |
|---|---|---|---|---|
| `JSON.stringify(queue)` | median | median | MB | 1.00x |
| JSON → UTF-8 `Buffer` | | | | |
| style refs + JSON (interned) | | | | |

Report `ops/row` and the share of `setStyle` ops, since class rules mean many identical style
objects: the interning row tells whether a `defineStyle` native op would be worth proposing
upstream. Do not implement interning in the renderer.

### package.json and docs

`bench:list`, `bench:serialization` and their `bun:` twins; not chained into `test`. CLAUDE.md:
the Commands block, and a paragraph under "Measuring frame cost" that names the two scripts as
the package-level counterpart of `brain:frames`, with the first baselines. README: one line under
"Testing headlessly" or "Known limitations".

## Constraints

- Scripts run through `bin/gpuix-svelte.js` like tests (they import `gpuix-svelte/test`), so
  no `--import tsx` of their own.
- No new dependencies; `node:*` only; write the fixture under `$TMPDIR`.
- Headless runs need the Bash sandbox off.

## Acceptance

- [ ] `npm run bench:list` and `npm run bun:bench:list` print the table on macOS.
- [ ] `npm run bench:serialization` prints the three rows and the interning share.
- [ ] Both skip cleanly where the test renderer is missing.
- [ ] CLAUDE.md records the commands and the first baselines with the native version.

## Risks

The numbers are machine-dependent; record the native version and window size beside them and
never present them as a Svelte-versus-Solid claim (gpuix-solid's own README makes the same
caveat).

## Sources

[solid-bench]: https://github.com/jhomra21/gpuix-solid/tree/cd72e84/examples/counter/src/benchmarks
[solid-stats]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/examples/counter/src/benchmarks/stats.ts
[solid-chat]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/examples/counter/src/benchmarks/chat.tsx
[solid-timeline]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/examples/counter/src/benchmarks/timeline.tsx
[solid-serialization]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/examples/counter/src/benchmarks/serialization.tsx
