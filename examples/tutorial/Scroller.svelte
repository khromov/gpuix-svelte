<script>
	import { get_native } from 'gpuix-svelte';

	// GPUI paints no scrollbars, so the panel draws a thumb sized from its painted
	// bounds and moved by its scroll offset (the styling playground's pattern).
	let { children, scroll = true, gap = 12, grow = 1, testid = null } = $props();

	let column = null;
	let content = null;
	let thumb = $state({ top: 0, height: 0 });
	let drag = $state(null);

	function metrics() {
		const native = get_native();
		if (!native || !column?.nativeId || !content?.nativeId) return null;

		const viewport = native.getElementBounds(column.nativeId)?.[3];
		const total = native.getElementBounds(content.nativeId)?.[3];
		if (!viewport || !total) return null;

		return { native, viewport, total, offset: native.getScrollOffset(column.nativeId)?.[1] ?? 0 };
	}

	function place(m, offset) {
		if (!scroll || m.total <= m.viewport) {
			thumb = { top: 0, height: 0 };
			return;
		}

		const height = Math.max(24, (m.viewport / m.total) * m.viewport);
		const top = (-offset / (m.total - m.viewport)) * (m.viewport - height);
		thumb = { top: Math.round(top), height: Math.round(height) };
	}

	function update() {
		const m = metrics();
		if (m) place(m, m.offset);
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

	// The offset moves after the wheel event returns, and content (a quiz answer, a
	// list row) changes height without any event, so the thumb is re-measured on a timer too.
	const refresh = () => setTimeout(update, 16);

	$effect(() => {
		const timer = setInterval(update, 250);
		return () => clearInterval(timer);
	});

	const column_style = $derived(
		`display: flex; flex-direction: column; height: 100%; padding-right: 14px; overflow-y: ${scroll ? 'scroll' : 'hidden'}`
	);
	const content_style = $derived(
		`display: flex; flex-direction: column; gap: ${gap}px${scroll ? '' : '; flex-grow: 1; min-height: 0'}`
	);
</script>

<div style="position: relative; flex-grow: {grow}; flex-basis: 0; min-width: 0; height: 100%">
	<div {@attach (node) => (column = node)} onscroll={refresh} style={column_style} testId={testid}>
		<div {@attach (node) => (content = node)} style={content_style}>
			{@render children()}
		</div>
	</div>

	<div style="position: absolute; top: 0; right: 0; bottom: 0; width: 8px; pointer-events: none">
		<div
			style="position: absolute; left: 0; width: 8px; border-radius: 4px; cursor: default; user-select: none"
			style:top="{thumb.top}px"
			style:height="{thumb.height}px"
			style:background-color={drag ? '#7f849c' : '#585b70'}
			hover="background-color: #7f849c"
			onmousedown={grab}
		></div>
	</div>

	{#if drag !== null}
		<div
			style="position: absolute; inset: 0; user-select: none"
			onmousemove={drag_to}
			onmouseup={() => (drag = null)}
		></div>
	{/if}
</div>
