<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { get_native, read_native, type GpuixEvent, type Native, type ShadowNode } from 'gpuix-svelte';

	// GPUI's thumb can't be dragged, so a plain column draws one from the heights and offset native
	// reports; a virtual list keeps GPUI's, which only native can size, and drags it through a strip.
	let {
		children,
		gap = 8,
		pad = '0',
		grow = 1,
		scroll = true,
		follow = false,
		virtual = false,
		estimate = 80,
		testid = null
	}: {
		children: Snippet;
		gap?: number;
		pad?: string;
		grow?: number;
		scroll?: boolean;
		follow?: boolean;
		/** Render a native `<virtual-list>`: each direct child is a row, and only rows near the viewport are built. */
		virtual?: boolean;
		/** Height hint for rows the list has not measured yet (virtual only). */
		estimate?: number;
		testid?: string | null;
	} = $props();

	let column: ShadowNode | null = null;
	let thumb = $state({ top: 0, height: 0 });
	let drag = $state<{ y: number; offset: number } | null>(null);
	let strip_hovered = $state(false);
	let last_total = 0;
	// Told rather than asked: on Windows and Linux reading bounds makes GPUI draw a frame,
	// so polling them keeps an idle window drawing.
	let column_height = 0;
	let content_height = 0;
	let scroll_y = 0;
	let list_scale = 0;
	let list_end = 0;
	let past_end = false;

	const NATIVE_THUMB_MIN = 20;

	type Metrics = { native: Native; viewport: number; total: number; offset: number };

	function metrics(): Metrics | null {
		const native = get_native();
		if (!native || !column?.nativeId || !column_height || !content_height) return null;
		return { native, viewport: column_height, total: content_height, offset: scroll_y };
	}

	function place(m: Metrics, offset: number) {
		let top = 0;
		let height = 0;
		if (scroll && m.total > m.viewport) {
			const h = Math.min(m.viewport, Math.max(24, (m.viewport / m.total) * m.viewport));
			height = Math.round(h);
			top = Math.round((-offset / (m.total - m.viewport)) * (m.viewport - h));
		}
		if (top !== thumb.top || height !== thumb.height) thumb = { top, height };
	}

	// `follow` keeps the bottom in view while content grows (a streaming reply);
	// a virtual list does that natively through `followTail`.
	function update() {
		const m = metrics();
		if (!m) return;
		if (follow && m.total !== last_total && m.total > m.viewport) {
			const bottom = m.viewport - m.total;
			scroll_y = bottom;
			m.native.scrollTo(column!.nativeId!, 0, bottom);
			place(m, bottom);
		} else {
			place(m, m.offset);
		}
		last_total = m.total;
	}

	function rows() {
		let n = 0;
		for (let c = column?.first ?? null; c; c = c.next) if (c.nativeId !== null) n++;
		return n;
	}

	function grab(e: GpuixEvent) {
		if (e.button !== 0) return;
		const m = metrics();
		if (m) drag = { y: e.y!, offset: m.offset };
	}

	// Native sizes its thumb from heights JS can't read, so the strip estimates the list's length once
	// per press, from the rows above the top one or else the hint.
	function grab_list(e: GpuixEvent) {
		if (e.button !== 0 || !column?.nativeId) return;
		const id = column.nativeId;
		const top = read_native((n) => n.getListScrollTop(id));
		const at = read_native((n) => n.getScrollOffset(id));
		if (!top || !at || !top[2]) return;

		const [index, within, viewport] = top;
		const above = index > 0 ? (-at[1] - within) / index : 0;
		const total = rows() * (above > 0 ? above : estimate);
		const length = Math.min(viewport, Math.max(NATIVE_THUMB_MIN, (viewport * viewport) / total));
		if (total <= viewport || viewport <= length) return;
		list_scale = (total - viewport) / (viewport - length);
		list_end = viewport - total;
		past_end = false;
		drag = { y: e.y!, offset: at[1] };
	}

	function release() {
		// The estimate can fall short of the list's real length, so a drag let go past it settles on the last row.
		if (virtual && drag !== null && past_end && column?.nativeId) get_native()?.scrollToItem(column.nativeId, rows());
		drag = null;
	}

	// Listening for mousedown and mousemove makes GPUI capture the pointer, so the release reaches the
	// grabbed element wherever it lands; a move with no button held is a release native never saw.
	function drag_to(e: GpuixEvent) {
		if (drag === null) return;
		if (e.pressedButton == null) {
			release();
			return;
		}
		if (virtual) {
			// Unclamped below, where native clamps at the list's real end.
			const offset = Math.min(0, drag.offset - (e.y! - drag.y) * list_scale);
			past_end = offset <= list_end;
			if (column?.nativeId) get_native()?.scrollTo(column.nativeId, 0, offset);
			return;
		}
		const m = metrics();
		if (!m || m.total <= m.viewport) return;

		// A viewport no taller than the thumb's minimum leaves it no track, and dividing by that is NaN.
		const travel = m.viewport - thumb.height;
		if (travel <= 0) return;
		const wanted = drag.offset - ((e.y! - drag.y) / travel) * (m.total - m.viewport);
		const offset = Math.max(m.viewport - m.total, Math.min(0, wanted));
		scroll_y = offset;
		m.native.scrollTo(column!.nativeId!, 0, offset);
		place(m, offset);
	}

	// Every thumb restyle is a full native frame, so a wheel stream gets at most one
	// per 50 ms; the offset has long moved by then.
	let pending: ReturnType<typeof setTimeout> | null = null;
	function refresh() {
		if (pending !== null) return;
		pending = setTimeout(() => {
			pending = null;
			update();
		}, 50);
	}

	onDestroy(() => {
		if (pending !== null) clearTimeout(pending);
	});

	function on_column_layout(e: GpuixEvent) {
		column_height = e.height ?? 0;
		refresh();
	}

	function on_content_layout(e: GpuixEvent) {
		content_height = e.height ?? 0;
		refresh();
	}

	function on_scroll_change(e: GpuixEvent) {
		scroll_y = e.scrollY ?? 0;
		refresh();
	}
</script>

<div class="wrap" style="flex-grow: {grow}">
	{#if virtual}
		<div class="inset" style="padding: {pad}">
			<div class="frame">
				<virtual-list
					{@attach (node: ShadowNode) => (column = node)}
					class="list"
					class:hot={strip_hovered || drag !== null}
					estimatedItemHeight={estimate}
					followTail={follow}
					testId={testid}
				>
					{@render children()}
				</virtual-list>
				<div
					class="strip"
					onmousedown={grab_list}
					onmousemove={drag_to}
					onmouseup={release}
					onmouseenter={() => (strip_hovered = true)}
					onmouseleave={() => (strip_hovered = false)}
					testId={testid && `${testid}-strip`}
				></div>
			</div>
		</div>
	{:else}
		<div {@attach (node: ShadowNode) => (column = node)} onlayout={on_column_layout} onscrollchange={on_scroll_change} class="column" class:fixed={!scroll} testId={testid}>
			<div onlayout={on_content_layout} class="content" class:fixed={!scroll} style="gap: {gap}px; padding: {pad}">
				{@render children()}
			</div>
		</div>

		<div class="gutter">
			<div
				class="thumb"
				class:dragging={drag !== null}
				style:top="{thumb.top}px"
				style:height="{thumb.height}px"
				onmousedown={grab}
				onmousemove={drag_to}
				onmouseup={release}
				testId={testid && `${testid}-thumb`}
			></div>
		</div>
	{/if}
</div>

<style>
	.wrap { position: relative; display: flex; flex-direction: column; flex-basis: 0; min-height: 0; min-width: 0; width: 100%; height: 100%; }
	.column { display: flex; flex-direction: column; height: 100%; padding-right: 12px; overflow-y: scroll; }
	.column.fixed { overflow-y: hidden; }
	.content { display: flex; flex-direction: column; }
	.content.fixed { flex-grow: 1; min-height: 0; }
	.inset { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.frame { position: relative; display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.list { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; scrollbar-color: var(--scroller-thumb, #404040); scrollbar-width: 8px; }
	.list.hot { scrollbar-color: var(--scroller-thumb-hover, #5a5a5a); }
	.strip { position: absolute; top: 0; right: 0; bottom: 0; width: 8px; user-select: none; }
	.gutter { position: absolute; top: 0; right: 0; bottom: 0; width: 8px; pointer-events: none; }
	.thumb { position: absolute; left: 0; width: 8px; border-radius: 4px; cursor: default; user-select: none; background-color: var(--scroller-thumb, #404040); }
	.thumb:hover { background-color: var(--scroller-thumb-hover, #5a5a5a); }
	.thumb.dragging { background-color: var(--scroller-thumb-hover, #5a5a5a); }
</style>
