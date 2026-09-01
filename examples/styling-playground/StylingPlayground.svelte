<script>
	import { get_native } from 'gpuix-svelte';

	// Every case is a style string rendered verbatim on a box, so what GPUI
	// actually did with it sits next to what was written.
	const SECTIONS = [
		{
			title: 'Reads like CSS',
			color: '#a6e3a1',
			cases: [
				{
					css: 'padding: 6px 18px; border-radius: 10px; background-color: #89b4fa; color: #1e1e2e',
					note: 'box shorthands expand to the four GPUI longhands'
				},
				{
					kind: 'class',
					label: 'class="chip"  (.chip and .chip:hover in <style>)',
					note: 'class rules are compiled into a GPUI style; hover the chip'
				},
				{
					css: 'background-color: rebeccapurple; color: hsl(50 90% 70%)',
					note: 'any CSS colour syntax: names, hsl(), rgb(), 8-digit hex'
				},
				{
					css: 'font-weight: 600; font-size: 18px; text-align: center; flex-grow: 1',
					note: 'flex-grow fills the row; font-weight takes numbers or names'
				},
				{
					css: 'border-width: 2px; border-color: #f9e2af; border-radius: 6px',
					note: 'longhands only — there is no border-style'
				},
				{
					css: 'width: 50%; opacity: 0.4',
					note: '% and auto survive on width/height/min*/max* only'
				},
				{
					kind: 'lines',
					css: 'width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis',
					note: 'ellipsis works on a fixed-width box'
				}
			]
		},
		{
			title: 'Looks like CSS, but is not',
			color: '#f38ba8',
			cases: [
				{
					css: 'flex: 1',
					note: 'unknown key, dropped silently — the box never grows'
				},
				{
					css: 'border: 1px solid #f9e2af',
					note: 'shorthand dropped with a warning; nothing is drawn'
				},
				{
					kind: 'lines',
					css: 'width: 180px; line-height: 1.5',
					note: 'unitless line-height is 1.5 px — the lines overlap'
				},
				{
					css: 'display: none',
					note: 'still painted; only flex and grid mean anything'
				},
				{
					css: 'margin: 0 auto',
					note: 'auto is dropped, so the box stays on the left'
				},
				{
					kind: 'blank',
					css: 'border-radius: 50%; width: 48px; height: 48px',
					note: '% is dropped on pixel-only keys — a square, not a circle'
				},
				{
					css: 'font-size: 1rem; padding: 1em',
					note: 'rem/em/vh are dropped with a warning'
				},
				{
					bare: true,
					css: 'background: linear-gradient(90deg, #89b4fa, #f38ba8)',
					note: 'parsed as a colour and fails; gradients are object-only'
				},
				{
					css: 'box-shadow: 0 2px 8px #000; text-decoration: underline; letter-spacing: 2px',
					note: 'shadow dropped with a warning, the other two vanish silently'
				}
			]
		},
		{
			title: 'Not CSS, but GPUI takes it',
			color: '#f9e2af',
			cases: [
				{
					css: 'padding: 12; font-size: 18; border-radius: 6',
					note: 'bare numbers are logical pixels'
				},
				{
					kind: 'children',
					css: 'display: grid; grid-template-columns: 3; gap: 4px; width: 100%',
					note: 'a column count, not a track list — repeat(3, 1fr) is dropped'
				},
				{
					kind: 'children',
					css: 'display: flex; flex-direction: row; justify-content: between; width: 100%',
					note: "GPUI's own aliases for space-between / space-around"
				},
				{
					kind: 'lines',
					css: 'width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis-start',
					note: 'ellipsis-start truncates from the left'
				},
				{
					css: 'font-weight: semibold',
					note: 'CSS has no semibold keyword'
				},
				{
					css: 'cursor: pointer',
					hover: 'background-color: #45475a',
					active: 'background-color: #7f849c',
					note: 'hover= and active= are attributes, not :pseudo-classes'
				},
				{
					css: 'cursor: grab; selection-color: #f38ba8',
					note: 'drag-select the text: the wash colour has no CSS equivalent'
				}
			]
		}
	];

	const BASE = 'padding: 8px 12px; color: #cdd6f4';
	const FILL = 'background-color: #313244';
	const BLOCKS = ['#89b4fa', '#f38ba8', '#a6e3a1', '#f9e2af', '#cba6f7', '#94e2d5'];
	const LONG = 'The quick brown fox jumps over the lazy dog and keeps running well past the edge of this box';

	// Inline wins over a class, so the class case must not carry the base inline.
	function sample_style(c) {
		if (c.kind === 'class') return '';
		return `${BASE}; ${c.bare ? '' : FILL}; ${c.css ?? ''}`;
	}

	// GPUI paints no scrollbars, so each column gets a thumb sized from its painted
	// bounds and moved by its scroll offset.
	let columns = [];
	let contents = [];
	let thumbs = $state(SECTIONS.map(() => ({ top: 0, height: 0 })));

	function metrics(i) {
		const native = get_native();
		const column = columns[i]?.nativeId;
		const content = contents[i]?.nativeId;
		if (!native || !column || !content) return null;

		const viewport = native.getElementBounds(column)?.[3];
		const total = native.getElementBounds(content)?.[3];
		if (!viewport || !total) return null;

		return { native, column, viewport, total, offset: native.getScrollOffset(column)?.[1] ?? 0 };
	}

	function place_thumb(i, m, offset) {
		if (m.total <= m.viewport) {
			thumbs[i] = { top: 0, height: 0 };
			return;
		}

		const height = Math.max(24, (m.viewport / m.total) * m.viewport);
		const top = (-offset / (m.total - m.viewport)) * (m.viewport - height);
		thumbs[i] = { top: Math.round(top), height: Math.round(height) };
	}

	function update_thumb(i) {
		const m = metrics(i);
		if (m) place_thumb(i, m, m.offset);
	}

	// GPUI does not capture the pointer on mousedown, so a drag shows a window-sized
	// overlay that receives every move and the release; a move with no button held
	// is a release that happened outside the window.
	let drag = $state(null);

	function grab(i, e) {
		if (e.button !== 0) return;
		const m = metrics(i);
		if (m) drag = { i, y: e.y, offset: m.offset };
	}

	function drag_to(e) {
		if (drag === null) return;
		if (e.pressedButton == null) {
			drag = null;
			return;
		}

		const m = metrics(drag.i);
		if (!m || m.total <= m.viewport) return;

		const travel = m.viewport - thumbs[drag.i].height;
		const wanted = drag.offset - ((e.y - drag.y) / travel) * (m.total - m.viewport);
		const offset = Math.max(m.viewport - m.total, Math.min(0, wanted));
		m.native.scrollTo(m.column, 0, offset);
		place_thumb(drag.i, m, offset);
	}

	// The offset moves after the wheel event returns, and bounds exist only after
	// the first paint, so both reads wait a beat.
	const refresh = (i) => setTimeout(() => update_thumb(i), 16);

	$effect(() => {
		const timer = setTimeout(() => SECTIONS.forEach((_, i) => update_thumb(i)), 100);
		return () => clearTimeout(timer);
	});
</script>

<div
	style="position: relative; display: flex; flex-direction: row; gap: 16px; width: 100%; height: 100%;
	       background-color: #11111b; padding: 16px"
>
	{#each SECTIONS as section, i}
		<div style="position: relative; width: 33%; height: 100%">
			<div
				{@attach (node) => { columns[i] = node; }}
				onscroll={() => refresh(i)}
				style="display: flex; flex-direction: column; height: 100%; overflow-y: scroll; padding-right: 14px"
			>
				<div {@attach (node) => { contents[i] = node; }} style="display: flex; flex-direction: column; gap: 8px">
			<div style="font-size: 14px; font-weight: bold" style:color={section.color}>
				{section.title}
			</div>

			{#each section.cases as c}
				<div
					style="display: flex; flex-direction: column; gap: 6px; padding: 10px;
					       background-color: #1e1e2e; border-radius: 8px"
				>
					<div style="font-family: Menlo; font-size: 11px; color: #cba6f7">{c.label ?? c.css}</div>

					<div
						style="display: flex; flex-direction: row; width: 100%; padding: 4px;
						       background-color: #181825; border-radius: 4px"
					>
						<div
							class={c.kind === 'class' ? 'chip' : null}
							style={sample_style(c)}
							hover={c.hover}
							active={c.active}
						>
							{#if c.kind === 'children'}
								{#each BLOCKS as color}
									<div style="width: 28px; height: 20px; border-radius: 3px" style:background-color={color}></div>
								{/each}
							{:else if c.kind === 'lines'}
								{LONG}
							{:else if c.kind !== 'blank'}
								sample
							{/if}
						</div>
					</div>

					<div style="font-size: 11px; color: #6c7086">{c.note}</div>
				</div>
			{/each}
				</div>
			</div>

			<div style="position: absolute; top: 0; right: 0; bottom: 0; width: 8px; pointer-events: none">
				<div
					style="position: absolute; left: 0; width: 8px; border-radius: 4px; cursor: default; user-select: none"
					style:top="{thumbs[i].top}px"
					style:height="{thumbs[i].height}px"
					style:background-color={drag?.i === i ? '#7f849c' : '#585b70'}
					hover="background-color: #7f849c"
					onmousedown={(e) => grab(i, e)}
				></div>
			</div>
		</div>
	{/each}

	{#if drag !== null}
		<div
			style="position: absolute; inset: 0; user-select: none"
			onmousemove={drag_to}
			onmouseup={() => (drag = null)}
		></div>
	{/if}
</div>

<style>
	.chip {
		background-color: #cba6f7;
		color: #1e1e2e;
		border-radius: 999px;
		padding: 6px 14px;
		font-weight: bold;
		cursor: pointer;
	}
	.chip:hover {
		background-color: #f5c2e7;
	}
</style>
