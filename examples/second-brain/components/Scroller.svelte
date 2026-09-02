<script>
	import { get_native } from 'gpuix-svelte';

	// GPUI paints no scrollbars, so the panel draws a thumb sized from its painted
	// bounds and moved by its scroll offset (the tutorial's Scroller, in Substrate's colours).
	let { children, gap = 8, pad = '0', follow = false, testid = null } = $props();

	let column = null;
	let content = null;
	let thumb = $state({ top: 0, height: 0 });
	let drag = $state(null);
	let last_total = 0;

	function metrics() {
		const native = get_native();
		if (!native || !column?.nativeId || !content?.nativeId) return null;

		const viewport = native.getElementBounds(column.nativeId)?.[3];
		const total = native.getElementBounds(content.nativeId)?.[3];
		if (!viewport || !total) return null;

		return { native, viewport, total, offset: native.getScrollOffset(column.nativeId)?.[1] ?? 0 };
	}

	function place(m, offset) {
		if (m.total <= m.viewport) {
			thumb = { top: 0, height: 0 };
			return;
		}
		const height = Math.max(24, (m.viewport / m.total) * m.viewport);
		const top = (-offset / (m.total - m.viewport)) * (m.viewport - height);
		thumb = { top: Math.round(top), height: Math.round(height) };
	}

	// `follow` keeps the bottom in view while content grows (a streaming reply).
	function update() {
		const m = metrics();
		if (!m) return;
		if (follow && m.total !== last_total && m.total > m.viewport) {
			const bottom = m.viewport - m.total;
			m.native.scrollTo(column.nativeId, 0, bottom);
			place(m, bottom);
		} else {
			place(m, m.offset);
		}
		last_total = m.total;
	}

	function grab(e) {
		if (e.button !== 0) return;
		const m = metrics();
		if (m) drag = { y: e.y, offset: m.offset };
	}

	// GPUI does not capture the pointer, so the drag runs on a panel-sized overlay
	// and a move with no button held is a release that landed elsewhere.
	function drag_to(e) {
		if (drag === null) return;
		if (e.pressedButton == null) {
			drag = null;
			return;
		}
		const m = metrics();
		if (!m || m.total <= m.viewport) return;

		const travel = m.viewport - thumb.height;
		const wanted = drag.offset - ((e.y - drag.y) / travel) * (m.total - m.viewport);
		const offset = Math.max(m.viewport - m.total, Math.min(0, wanted));
		m.native.scrollTo(column.nativeId, 0, offset);
		place(m, offset);
	}

	// The offset moves after the wheel event returns, and content changes height
	// without any event, so the thumb is re-measured on a timer too.
	const refresh = () => setTimeout(update, 16);

	$effect(() => {
		const timer = setInterval(update, follow ? 100 : 250);
		return () => clearInterval(timer);
	});
</script>

<div class="wrap">
	<div {@attach (node) => (column = node)} onscroll={refresh} class="column" testId={testid}>
		<div {@attach (node) => (content = node)} class="content" style="gap: {gap}px; padding: {pad}">
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
		></div>
	</div>

	{#if drag !== null}
		<div class="overlay" onmousemove={drag_to} onmouseup={() => (drag = null)}></div>
	{/if}
</div>

<style>
	.wrap { position: relative; display: flex; flex-direction: column; flex-grow: 1; flex-basis: 0; min-height: 0; min-width: 0; width: 100%; }
	.column { display: flex; flex-direction: column; height: 100%; padding-right: 10px; overflow-y: scroll; }
	.content { display: flex; flex-direction: column; }
	.gutter { position: absolute; top: 0; right: 0; bottom: 0; width: 8px; pointer-events: none; }
	.thumb { position: absolute; left: 0; width: 8px; border-radius: 4px; cursor: default; user-select: none; background-color: var(--thumb); }
	.thumb:hover { background-color: var(--thumbHover); }
	.thumb.dragging { background-color: var(--thumbHover); }
	.overlay { position: absolute; inset: 0; user-select: none; }
</style>
