# 3. `window_size` and `window_insets`

| | |
|---|---|
| Candidate | C in `docs/comparison-gpuix-solid.md` |
| Size | S: about 40 lines of source, 55 of test |
| Depends on | nothing (shares `test/window.ts` with task 4; do 4 first or together) |
| Unblocks | Substrate reacting to resize; liquid-glass dropping its `padTop` prop (unverified, see Risks) |
| Line numbers | as of `e729a86` |

## Goal

Reactive window size and insets a component can read in a template
(`{window_size.width}`), polled only while something reads them, with zeros headlessly.

## Background

No native resize event exists in 0.7.0 (checked in the Rust: the only window-level events are
`windowKeyDown` and `windowKeyUp`). `getWindowSize()` exists on both renderers;
`getWindowInsets()` exists on the live `GpuixRenderer` only (`index.d.ts:46-47`, `:338`).
`WindowInsets` is `{ safeArea, ime, effective }`, each an `EdgeInsets`.

gpuix-solid's [`useWindowSize`][solid-window] and `useWindowInsets` poll every 100 ms
(`setInterval`, minimum 16 ms, `intervalMs: false` for a single read), compare structurally so
an unchanged value does not retrigger, fall back to 800×600 and zero insets when the native
call throws, and derive `keyboardTop`, `keyboardVisible` and `visibleHeight`.

We call `getWindowSize()` only in `src/test.ts` and `test/portal.ts`, and never call
`getWindowInsets()`. `examples/liquid-glass/main.ts` hand-passes a `padTop` prop for its
transparent titlebar. Substrate uses a fixed `WINDOW` object and cannot react to a resize.

## Design

Plain TypeScript in [`src/window.ts`](../../src/window.ts) on `createSubscriber` from
`svelte/reactivity`. The vendored 5.57.0 exports it under the `custom-renderer` condition
(`node_modules/svelte/package.json`, `src/reactivity/index-client.js`); it is what
`svelte/reactivity/window`'s `innerWidth` is built on. It gives template reactivity without a
`.svelte.ts` module, an `exports` entry or ambient runes in package TypeScript, and a read
outside any effect is a fresh synchronous FFI read.

```ts
import { createSubscriber } from 'svelte/reactivity';
import type { EdgeInsets } from '@gpuix/native';

export interface WindowInsets {
	safe_area: EdgeInsets;
	ime: EdgeInsets;
	effective: EdgeInsets;
	keyboard_visible: boolean;
	visible_height: number;
}

const POLL_MS = 100;
const ZERO: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// No native resize event exists, so a subscriber polls, and only while an effect is reading.
function polled<T>(read: () => T): () => T {
	let value: T;
	let polling = false;
	const subscribe = createSubscriber((update) => {
		polling = true;
		value = read();
		const timer = setInterval(() => {
			const next = read();
			if (JSON.stringify(next) !== JSON.stringify(value)) {
				value = next;
				update();
			}
		}, POLL_MS);
		return () => {
			clearInterval(timer);
			polling = false;
		};
	});
	return () => {
		subscribe();
		return polling ? value : read();
	};
}

const size = polled(() => {
	try { return win()?.getWindowSize?.() ?? { width: 0, height: 0 }; } catch { return { width: 0, height: 0 }; }
});
const insets = polled((): WindowInsets => {
	const s = size();
	let i;
	try { i = win()?.getWindowInsets?.(); } catch { /* window not ready yet */ }
	const { safeArea = ZERO, ime = ZERO, effective = ZERO } = i ?? {};
	return { safe_area: safeArea, ime, effective, keyboard_visible: ime.bottom > 0, visible_height: s.height - effective.top - effective.bottom };
});

export const window_size: { readonly width: number; readonly height: number } = {
	get width() { return size().width; },
	get height() { return size().height; }
};
export const window_insets: Readonly<WindowInsets> = {
	get safe_area() { return insets().safe_area; },
	get ime() { return insets().ime; },
	get effective() { return insets().effective; },
	get keyboard_visible() { return insets().keyboard_visible; },
	get visible_height() { return insets().visible_height; }
};
```

Why `value = read()` inside `start`: `createSubscriber` runs the start callback synchronously
inside the first tracking read, so `polling` is already true when the getter returns. The
`try/catch` keeps gpuix-solid's guard for a window that is not ready yet on Windows and Linux.
`keyboardTop` is dropped (it is `height - ime.bottom`).

Lifecycle: the poll starts on the first tracking read and stops one microtask after the last
effect that read it is destroyed (`svelte/src/reactivity/create-subscriber.js`). Hot remount:
`render()` unmounts the old component, its effects die, the poll stops; the new tree's first read
restarts it against the same native. `window.ts` loads once through `index.ts` and is never
cache-busted, so the module state is stable across remounts.

Other files:

- [`src/types.ts:107`](../../src/types.ts#L107): widen `WindowNative` to
  `Partial<Pick<GpuixRenderer, 'setWindowTitle' | 'activateWindow' | 'blur' | 'focusElement' |
  'getWindowSize' | 'getWindowInsets' | 'setDebugFrameOverlay' | 'cycleDebugFrameOverlay' |
  'getDebugFrameOverlayStats'>>` (the last three are for task 4).
- `src/index.ts`: export `window_size`, `window_insets` and the `WindowInsets` type.

## Tests

`test/window.ts` (shared with task 4) with fixture `test/Window.svelte` rendering
`{window_size.width}x{window_size.height}` and
`{window_insets.visible_height}/{window_insets.keyboard_visible}`. Script `test:window` plus
the Bun twin, chained into both `test` scripts.

1. After mount the text equals `native.getWindowSize()`. Never the requested size: macOS caps
   headless height at 538 and Windows opens 1024×749 (pattern `test/portal.ts:19`).
2. `visible_height === height` and `keyboard_visible === false` (zeros headlessly).
3. Monkeypatch `native.getWindowSize` (as `test/vars.ts:44-46` patches `applyBatch`) to return
   `{ width: 321, height: 123 }` and count calls; `await wait(150)`; the text is `321x123`.
4. `unmount()`, `await wait(10)` (the microtask countdown), snapshot the call count,
   `await wait(250)`; unchanged, so the poll stopped.
5. `window_size.width` read from the script while idle is `321` and the count went up by one
   (a fresh read when nothing subscribes).
6. `mount_headless` again; the text is correct, so the poll restarted.

## Docs

- README: a "Window" subsection after "Keyboard shortcuts and focus" (line 380): `window_size`,
  `window_insets`, "no native resize event; sampled every 100 ms while a component reads it;
  zeros headlessly".
- CLAUDE.md: the Architecture tree line for `window.ts`; a bullet under "Writing components for
  this renderer"; Commands block for `test:window`.

## Constraints

- `svelte/reactivity` is the existing dependency; no new packages.
- Keep `window.ts` free of runes so the main entry stays plain TypeScript.

## Acceptance

- [ ] `window_size` and `window_insets` exported from `gpuix-svelte`, reactive in templates.
- [ ] Poll starts and stops with subscribers (test steps 3 to 6).
- [ ] `test:window` passes on Node and Bun; typecheck and eslint clean.
- [ ] README and CLAUDE.md updated.

## Risks

- Relies on `createSubscriber` resolving under the `custom-renderer` condition in the vendored
  build. It does today; re-check after `npm run vendor`.
- Whether `getWindowInsets().safeArea.top` reports the transparent titlebar in the liquid-glass
  window is unverified. Leave `padTop` in `examples/liquid-glass` unless a manual run shows the
  inset is right.

## Sources

[solid-window]: https://github.com/jhomra21/gpuix-solid/blob/cd72e84/packages/solid/src/hooks/use-window-size.ts#L40-L74
