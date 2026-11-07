<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import { key_of, type KeyLike } from 'gpuix-svelte-ui/keys';
	import { aria_value, bounds_of, own_hitbox, pointer_x, still_pressed, test_id, type Box } from 'gpuix-svelte-ui/shared';

	let {
		value,
		onchange,
		min = 0,
		max = 100,
		step = 1,
		label = null,
		format = (v: number) => String(v),
		disabled = false,
		testid = null
	}: {
		value: number;
		onchange: (value: number) => void;
		min?: number;
		max?: number;
		step?: number;
		label?: string | null;
		/** How the readout beside the label prints the value. */
		format?: (value: number) => string;
		disabled?: boolean;
		/** The wrapper's id; the track gets `<testid>-track`. */
		testid?: string | null;
	} = $props();

	// The thumb overhangs the track by half its width at either end, which this padding makes room for.
	const INSET = 8;

	let track: unknown = null;
	let dragging = $state(false);
	// Read once per drag: the track does not move during one, and on Windows and Linux every read draws a frame.
	let box: Box | null = null;
	const fraction = $derived(max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0);

	function snap(raw: number) {
		const decimals = (String(step).split('.')[1] ?? '').length;
		const stepped = Math.round((raw - min) / step) * step + min;
		return Math.min(max, Math.max(min, Number(stepped.toFixed(decimals))));
	}

	function set(raw: number) {
		const next = snap(raw);
		if (next !== value) onchange(next);
	}

	function from_pointer(e: { x?: number; clientX?: number }) {
		if (!box || box.width <= 2 * INSET) return;
		set(min + ((pointer_x(e) - box.x - INSET) / (box.width - 2 * INSET)) * (max - min));
	}

	function down(e: { x?: number; clientX?: number }) {
		if (disabled) return;
		box = bounds_of(track);
		dragging = true;
		from_pointer(e);
	}

	// Neither renderer captures the pointer for a drag, so a window-sized catcher hears the moves, and a move
	// with no button held is a release that landed elsewhere.
	function move(e: { x?: number; clientX?: number; pressedButton?: number | null; buttons?: number }) {
		if (!dragging) return;
		if (!still_pressed(e)) {
			dragging = false;
			return;
		}
		from_pointer(e);
	}

	function keydown(e: KeyLike) {
		if (disabled) return;
		const key = key_of(e);
		const delta = key === 'right' || key === 'up' ? step : key === 'left' || key === 'down' ? -step : null;
		if (delta !== null) {
			e.preventDefault();
			set(value + delta);
		} else if (key === 'home') {
			e.preventDefault();
			set(min);
		} else if (key === 'end') {
			e.preventDefault();
			set(max);
		}
	}
</script>

<div class="slider" class:disabled {...test_id(testid)}>
	{#if label}
		<div class="head">
			<div class="label">{label}</div>
			<div class="readout">{format(value)}</div>
		</div>
	{/if}
	<div
		class="track"
		class:dragging
		class:disabled
		role="slider"
		aria-label={label}
		aria-valuetext={format(value)}
		{...aria_value(value, min, max)}
		tabindex={disabled ? -1 : 0}
		{...own_hitbox}
		{...test_id(testid ? `${testid}-track` : null)}
		{@attach (node: unknown) => (track = node)}
		onmousedown={down}
		onkeydown={keydown}
	>
		<div class="rail">
			<div class="fill" style:width="{fraction * 100}%"></div>
		</div>
		<div class="lead" style:width="{fraction * 100}%">
			<div class="thumb"></div>
		</div>
	</div>
	{#if dragging}
		<Portal>
			<div class="catcher" onmousemove={move} onmouseup={() => (dragging = false)}></div>
		</Portal>
	{/if}
</div>

<style>
	.slider {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	.slider.disabled {
		opacity: 0.5;
	}
	.track.disabled {
		pointer-events: none;
	}
	.head {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		gap: 12px;
	}
	.label {
		font-size: 13px;
		font-weight: 500;
		line-height: 18px;
		color: var(--ui-ink);
	}
	.readout {
		font-family: var(--ui-mono);
		font-size: 12px;
		line-height: 18px;
		color: var(--ui-muted);
	}
	.track {
		position: relative;
		display: flex;
		flex-direction: row;
		align-items: center;
		height: 24px;
		padding: 0 8px;
		border-radius: 12px;
		cursor: pointer;
		user-select: none;
		box-sizing: border-box;
	}
	.track:focus-visible {
		outline-width: 2px;
		outline-offset: 0;
		outline-style: solid;
		outline-color: var(--ui-ink);
	}
	.rail {
		position: absolute;
		left: 8px;
		right: 8px;
		top: 10px;
		display: flex;
		flex-direction: row;
		height: 4px;
		border-radius: 2px;
		pointer-events: none;
		background-color: var(--ui-border-strong);
	}
	.fill {
		height: 4px;
		border-radius: 2px;
		pointer-events: none;
		background-color: var(--ui-accent);
	}
	.lead {
		display: flex;
		flex-direction: row;
		justify-content: end;
		pointer-events: none;
	}
	.thumb {
		width: 16px;
		height: 16px;
		margin-right: -8px;
		border-radius: 8px;
		border-width: 2px;
		border-style: solid;
		border-color: var(--ui-accent);
		flex-shrink: 0;
		box-sizing: border-box;
		background-color: var(--ui-on-accent);
	}
	.track:hover {
		background-color: var(--ui-raised);
	}
	.track.dragging {
		background-color: var(--ui-raised);
	}
	.catcher {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		cursor: pointer;
		user-select: none;
	}
</style>
