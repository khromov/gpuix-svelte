# 1. `auxclick` event and a synthesized `contextmenu`

| | |
|---|---|
| Candidate | A in `docs/comparison-gpuix-solid.md` |
| Size | XS: about 25 lines of source, 70 of test, 5 doc lines |
| Depends on | nothing |
| Unblocks | 7 (Popover can close on right-click elsewhere), 10 (parity table) |
| Line numbers | as of `e729a86`; `src/` is unchanged in the working tree |

## Goal

Make right and middle clicks reachable from Svelte components. After this task, `onauxclick`
fires for non-primary buttons and `oncontextmenu` fires for right-clicks only, both through
GPUI's real hit testing, with no change to how `hitbox="self"`, `materialize()` or `dispatch()`
work.

## Background

Native 0.7.0 splits clicks by button, like the DOM ([renderer.rs][native-click]):

- `click` is bound with `on_click`, which GPUI fires for the primary button only.
- `auxClick` is bound with `on_aux_click` for right and middle buttons. Its payload sets `x`,
  `y`, `modifiers`, `clickCount` and `isRightClick`. It does **not** set `button`, so a handler
  cannot tell middle from right except through `isRightClick`.
- `mouseDown` and `mouseUp` are bound for all three buttons and do carry `button`
  (0 left, 1 middle, 2 right).
- No `contextMenu` event exists. The `EventPayload.button` doc comment in `index.d.ts` mentions
  it, but nothing in the Rust emits that string.

Our event list at [`src/events.ts:6-31`](../../src/events.ts#L6-L31) has `click`, `mouseDown`
and `mouseUp` but no `auxClick`. `to_gpui_event()` returns `null` for anything not in the list,
and the renderer drops such listeners silently. So today a right-click handler can only be
written by pairing `onmousedown` and `onmouseup` on `button === 2`.

gpuix-solid registers `onAuxClick` directly and synthesizes `onContextMenu` from a native
`mouseUp` with `button === 2` ([events.ts][solid-contextmenu], [nodes.ts][solid-native-type]).
The native listener bit for `mouseUp` is the OR of the `mouseUp` and `contextMenu` handlers.
For us the smaller shape is one native `auxClick` listener with a `contextmenu` alias filtered
on `isRightClick`, which also covers macOS ctrl-click (GPUI reports it as a right click).

## Current code

- `GPUI_EVENTS` and `to_gpui_event`: [`src/events.ts`](../../src/events.ts).
- `addEventListener` / `removeEventListener`:
  [`src/renderer.ts:544-582`](../../src/renderer.ts#L544-L582). Listeners are stored on
  `ShadowNode.listeners` keyed by the **native** event name; `setEventListener` is emitted on the
  0→1 edge and retracted on the 1→0 edge. `focus`/`blur` on text inputs are never retracted.
- `shielded()` ([`renderer.ts:257-262`](../../src/renderer.ts#L257-L262)) counts
  `listeners.size` to decide whether a descendant under `hitbox="self"` keeps its hitbox.
- `materialize()` ([`renderer.ts:330-370`](../../src/renderer.ts#L330-L370)) re-emits
  `setEventListener` for every key in `listeners` when a node becomes live.
- `dispatch()` ([`renderer.ts:734-767`](../../src/renderer.ts#L734-L767)) looks up the node by
  id, builds the DOM-shaped `GpuixEvent` (`type`, `target`, `currentTarget`, `editing`,
  `preventDefault`, ...) and calls every handler under `payload.eventType`.
- The headless harness already clicks with a button:
  `click(target, { button })` at [`src/test.ts:160`](../../src/test.ts#L160) passes it to
  `simulateClick`, which dispatches a down and an up, so GPUI derives the aux click itself.

## Design

### `src/events.ts`

1. Add `'auxClick'` after `'click'` in `GPUI_EVENTS`. `BY_LOWERCASE` then maps `onauxclick`
   with no other change.
2. Add the alias table:

```ts
import type { EventPayload } from '@gpuix/native';

/** Svelte-side names GPUI has no event for: listened for as `native`, delivered when `when` holds. */
export const EVENT_ALIASES: Record<string, { native: string; when: (e: EventPayload) => boolean }> = {
	contextmenu: { native: 'auxClick', when: (e) => e.isRightClick === true }
};
```

`to_gpui_event('contextmenu')` keeps returning `null`; the alias is resolved in the renderer.

### `src/renderer.ts`

Register the alias under the native key and wrap the handler, so every other code path stays
untouched:

```ts
const aliased = new Map<string, WeakMap<EventHandler, EventHandler>>();

function alias_handler(type: string, handler: EventHandler): EventHandler {
	const alias = EVENT_ALIASES[type]!;
	let map = aliased.get(type);
	if (!map) aliased.set(type, (map = new WeakMap()));
	let wrapped = map.get(handler);
	if (!wrapped) {
		map.set(handler, (wrapped = function (event) {
			if (alias.when(event)) handler.call(this, { ...event, type, button: 2 });
		}));
	}
	return wrapped;
}
```

In `addEventListener` and `removeEventListener`:

```ts
const key = type.toLowerCase();
const alias = EVENT_ALIASES[key];
const event = alias ? alias.native : to_gpui_event(type);
if (!event) return;
const stored = alias ? alias_handler(key, handler) : handler;
// ...then use `stored` everywhere `handler` was used.
```

Why a `WeakMap` per alias: `removeEventListener` must find the same wrapper that was added, and
the same function passed to both `onauxclick` and `oncontextmenu` must not collide. Why spread
the event: `preventDefault` and friends reference `this`, so a copy keeps them working while a
sibling `onauxclick` handler in the same dispatch still sees `type: 'auxClick'`.

Nothing changes in `materialize`, `shielded`, the edges or `dispatch`, because the listener is
stored under `auxClick`.

## Tests

New `test/events.ts` with fixture `test/Events.svelte`, script `test:events` plus
`bun:test:events`, both chained into `test` and `bun:test` in `package.json` (lines 59 and 95).

Fixture: boxes with `testId="aux"` (`onauxclick`), `"ctx"` (`oncontextmenu`), `"both"` (both),
a text showing counters and the last event's `type`/`isRightClick`/`button`, and a
`hitbox="self"` card with a painted badge that carries `oncontextmenu` (mirrors
`test/Hitbox.svelte`).

Checks, all through real hit testing with `click_test_id(id, { button })`:

- `ctx` with `{ button: 2 }` increments; `{ button: 1 }` and `{ button: 0 }` do not.
- `aux` with `{ button: 1 }` increments; `{ button: 2 }` increments again.
- `both` with `{ button: 2 }` runs both handlers once each.
- The synthesized event has `type === 'contextmenu'`, `isRightClick === true`, `button === 2`.
- `find_test_id('ctx').events` is `['auxClick']` and `native.hasEventListener(id, 'auxClick')`
  is true; `contextmenu` never reaches native.
- The badge under `hitbox="self"` keeps its hitbox (its `pointerEvents` stays unset, as
  `test/hitbox.ts` asserts for listeners today).
- A hand-built tree block (pattern `test/hitbox.ts:35-76`): add `contextmenu` and `auxclick`
  handlers, remove `contextmenu`, the native flag is still set; remove `auxclick`, it clears.

Run with the Bash sandbox off (CLAUDE.md, "Working in this repo").

## Docs

- CLAUDE.md, "Writing components for this renderer", the bullet starting "Only the events in
  `GPUI_EVENTS` fire": add `auxclick` (middle and right, `e.isRightClick`) and the `contextmenu`
  alias, and say that `click` is primary-button only.
- CLAUDE.md, Commands block: the `test:events` line.
- README, "Keyboard shortcuts and focus" (line 380) or the hitbox paragraph under "Components":
  one sentence on right-click.
- `examples/tutorial/content/state-events.md`, the event list in the first paragraph.

## Acceptance

- [ ] `onauxclick` and `oncontextmenu` work in a component through real hit testing.
- [ ] `test:events` passes on Node and Bun; `npm run typecheck` and `npx eslint .` clean.
- [ ] No change to `test/hitbox.ts` behaviour.
- [ ] Docs updated as above.

## Risks

Only one unverified point: that `simulateClick(x, y, 2)` yields `auxClick` in
`TestGpuixRenderer`. It dispatches a mouse down and up, and GPUI derives the aux click from
those, so it should. If it does not, fall back to `mouse_down` + `mouse_up` helpers from task 2
for the test and note it.

## Sources

[native-click]: https://github.com/remorses/gpuix/blob/@gpuix/native@0.7.0/packages/native/src/renderer.rs#L4354-L4404
[solid-contextmenu]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/host/events.ts#L287-L289
[solid-native-type]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/host/nodes.ts#L498-L500
