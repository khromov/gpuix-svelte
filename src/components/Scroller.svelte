<script lang="ts">
	import type { Snippet } from 'svelte';
	import { get_native, type GpuixEvent, type Native, type ShadowNode } from 'gpuix-svelte';

	// GPUI paints no scrollbars, so the column draws a thumb sized from its painted
	// bounds and moved by its scroll offset, and drags it on a panel-sized overlay.
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
	let content: ShadowNode | null = null;
	let thumb = $state({ top: 0, height: 0 });
	let drag = $state<{ y: number; offset: number } | null>(null);
	let last_total = 0;
	// A virtual list has no content to measure, so the thumb works in rows, scaled by
	// the average painted row height. GPUI reports one row more or less in view from
	// event to event, so the scale is a running mean of the reports, seeded with
	// `estimate` at the weight of PRIOR reports so the first few barely move it.
	let in_view = 0;
	let reports = 0;
	const PRIOR = 8;

	type Metrics = { native: Native; viewport: number; total: number; offset: number; per: number };

	function rows() {
		let n = 0;
		for (let c = column?.first ?? null; c; c = c.next) if (c.nativeId !== null) n++;
		return n;
	}

	function metrics(): Metrics | null {
		const native = get_native();
		if (!native || !column?.nativeId) return null;

		if (virtual) {
			const top = native.getListScrollTop(column.nativeId);
			const count = rows();
			if (!top || !top[2] || count === 0) return null;
			const per = top[2] / ((PRIOR * (top[2] / estimate) + in_view) / (PRIOR + reports));
			return { native, viewport: top[2], total: count * per, offset: -(top[0] * per + top[1]), per };
		}

		if (!content?.nativeId) return null;
		const viewport = native.getElementBounds(column.nativeId)?.[3];
		const total = native.getElementBounds(content.nativeId)?.[3];
		if (!viewport || !total) return null;

		return { native, viewport, total, offset: native.getScrollOffset(column.nativeId)?.[1] ?? 0, per: 0 };
	}

	function scroll_to(m: Metrics, offset: number) {
		if (!virtual) {
			m.native.scrollTo(column!.nativeId!, 0, offset);
			return;
		}
		const index = -offset / m.per;
		m.native.scrollToItem(column!.nativeId!, Math.floor(index), (index - Math.floor(index)) * m.per);
	}

	function place(m: Metrics, offset: number) {
		let top = 0;
		let height = 0;
		if ((scroll || virtual) && m.total > m.viewport) {
			const h = Math.max(24, (m.viewport / m.total) * m.viewport);
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
		if (!virtual && follow && m.total !== last_total && m.total > m.viewport) {
			const bottom = m.viewport - m.total;
			scroll_to(m, bottom);
			place(m, bottom);
		} else {
			place(m, m.offset);
		}
		last_total = m.total;
	}

	function grab(e: GpuixEvent) {
		if (e.button !== 0) return;
		const m = metrics();
		if (m) drag = { y: e.y!, offset: m.offset };
	}

	// GPUI does not capture the pointer, so the drag runs on a panel-sized overlay
	// and a move with no button held is a release that landed elsewhere.
	function drag_to(e: GpuixEvent) {
		if (drag === null) return;
		if (e.pressedButton == null) {
			drag = null;
			return;
		}
		const m = metrics();
		if (!m || m.total <= m.viewport) return;

		const travel = m.viewport - thumb.height;
		const wanted = drag.offset - ((e.y! - drag.y) / travel) * (m.total - m.viewport);
		const offset = Math.max(m.viewport - m.total, Math.min(0, wanted));
		scroll_to(m, offset);
		place(m, offset);
	}

	// Every thumb restyle is a full native frame, so a wheel stream gets at most one
	// per 50 ms rather than one per event; the offset has long moved by then.
	let pending: ReturnType<typeof setTimeout> | null = null;
	function refresh() {
		if (pending !== null) return;
		pending = setTimeout(() => {
			pending = null;
			update();
		}, 50);
	}

	function on_range(e: GpuixEvent) {
		const rows = (e.endIndex ?? 0) - (e.startIndex ?? 0);
		if (rows > 0) {
			in_view += rows;
			reports++;
		}
		refresh();
	}

	// Content changes height without any event, so the thumb is re-measured on a timer too.
	$effect(() => {
		if (!scroll && !follow && !virtual) return;
		const timer = setInterval(update, follow ? 100 : 250);
		return () => clearInterval(timer);
	});
</script>

<div class="wrap" style="flex-grow: {grow}">
	{#if virtual}
		<div class="inset" style="padding: {pad}">
			<virtual-list
				{@attach (node: ShadowNode) => (column = node)}
				onvisiblerange={on_range}
				class="list"
				estimatedItemHeight={estimate}
				followTail={follow}
				testId={testid}
			>
				{@render children()}
			</virtual-list>
		</div>
	{:else}
		<div {@attach (node: ShadowNode) => (column = node)} onscroll={refresh} class="column" class:fixed={!scroll} testId={testid}>
			<div {@attach (node: ShadowNode) => (content = node)} class="content" class:fixed={!scroll} style="gap: {gap}px; padding: {pad}">
				{@render children()}
			</div>
		</div>
	{/if}

	<div class="gutter">
		<div
			class="thumb"
			class:dragging={drag !== null}
			style:top="{thumb.top}px"
			style:height="{thumb.height}px"
			onmousedown={grab}
			testId={testid && `${testid}-thumb`}
		></div>
	</div>

	{#if drag !== null}
		<div class="overlay" onmousemove={drag_to} onmouseup={() => (drag = null)} testId={testid && `${testid}-overlay`}></div>
	{/if}
</div>

<style>
	.wrap { position: relative; display: flex; flex-direction: column; flex-basis: 0; min-height: 0; min-width: 0; width: 100%; height: 100%; }
	.column { display: flex; flex-direction: column; height: 100%; padding-right: 12px; overflow-y: scroll; }
	.column.fixed { overflow-y: hidden; }
	.content { display: flex; flex-direction: column; }
	.content.fixed { flex-grow: 1; min-height: 0; }
	.inset { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.list { display: flex; flex-direction: column; flex-grow: 1; min-height: 0; }
	.gutter { position: absolute; top: 0; right: 0; bottom: 0; width: 8px; pointer-events: none; }
	.thumb { position: absolute; left: 0; width: 8px; border-radius: 4px; cursor: default; user-select: none; background-color: var(--scroller-thumb, #585b70); }
	.thumb:hover { background-color: var(--scroller-thumb-hover, #7f849c); }
	.thumb.dragging { background-color: var(--scroller-thumb-hover, #7f849c); }
	.overlay { position: absolute; inset: 0; user-select: none; }
</style>
