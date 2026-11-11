<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { dismiss_layer } from 'gpuix-svelte';

	type Side = 'top' | 'right' | 'bottom' | 'left';
	type Align = 'start' | 'center' | 'end';
	type Hover = { onmouseenter: () => void; onmouseleave: () => void };
	type Focus = { onfocus: () => void; onblur: () => void };

	let {
		children,
		content,
		side = 'top',
		align = 'center',
		gap = 6,
		delay = 300,
		open = null,
		style = null,
		testid = null
	}: {
		/**
		 * The trigger; one with a listener of its own occludes the wrapper, so it spreads the hover handlers it is
		 * passed. A trigger that takes keyboard focus spreads the focus ones too, which make anything focusable on GPUI.
		 */
		children: Snippet<[Hover, Focus]>;
		content: string | Snippet;
		side?: Side;
		align?: Align;
		gap?: number;
		/** ms of hover before the tip shows. */
		delay?: number;
		/** Forces the tip shown or hidden; `null` leaves it to hover and focus. */
		open?: boolean | null;
		/** Inline CSS for the tip box, which wins over its own rules: `padding: 0; border-radius: 12px`. */
		style?: string | null;
		testid?: string | null;
	} = $props();

	// GPUI's own `align: center` lands half a layer off, so the layer hangs by an explicit corner
	// from a 0×0 dot that flex places on the trigger's edge.
	const CORNERS = {
		top: { start: 'bottomLeft', center: 'bottomCenter', end: 'bottomRight' },
		right: { start: 'topLeft', center: 'leftCenter', end: 'bottomLeft' },
		bottom: { start: 'topLeft', center: 'topCenter', end: 'topRight' },
		left: { start: 'topRight', center: 'rightCenter', end: 'bottomRight' }
	} as const;
	const x = $derived(side === 'left' ? 'start' : side === 'right' ? 'end' : align);
	const y = $derived(side === 'top' ? 'start' : side === 'bottom' ? 'end' : align);

	let shown = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	// A pointer that jumps onto the tip enters it before it leaves the trigger, so hover is tracked per
	// source rather than by the last event, and the 80 ms grace once none is hovered lets it cross the gap.
	const over = { wrap: false, trigger: false, tip: false, focus: false };

	function sync() {
		clearTimeout(timer);
		if (!over.wrap && !over.trigger && !over.tip && !over.focus) timer = setTimeout(() => (shown = false), 80);
		else if (!shown) timer = setTimeout(() => (shown = true), delay);
	}

	function hide() {
		clearTimeout(timer);
		over.focus = false;
		shown = false;
	}

	const track = (source: Exclude<keyof typeof over, 'focus'>): Hover => ({
		onmouseenter: () => {
			over[source] = true;
			// The pointer takes over from focus, since GPUI reports a hover a paint after the click whose focus came first.
			over.focus = false;
			sync();
		},
		onmouseleave: () => {
			over[source] = false;
			sync();
		}
	});

	const wrap = track('wrap');
	const tip = track('tip');
	const trigger = track('trigger');
	const focus: Focus = {
		// Focus that arrives with the pointer already on the trigger came from a click, which hover covers.
		onfocus: () => {
			if (over.wrap || over.trigger) return;
			over.focus = true;
			clearTimeout(timer);
			shown = true;
		},
		// A blur that ends no focus-shown tip must not reach sync(), which would reopen one Escape dismissed under a resting pointer.
		onblur: () => {
			if (!over.focus) return;
			over.focus = false;
			sync();
		}
	};

	// A tip that `open` forces can't be dismissed, so it must not take an Escape meant for a layer below.
	$effect(() => {
		if (open != null || !shown) return;
		return dismiss_layer({ onEscape: hide });
	});

	onDestroy(() => clearTimeout(timer));
</script>

<div class="host">
	<div class="anchor" hitbox="self" {...wrap} testId={testid}>
		{@render children(trigger, focus)}
		{#if open ?? shown}
			<div class="pin" style:justify-content={x} style:align-items={y}>
				<div class="dot">
					<anchored {side} align="start" anchor={CORNERS[side][align]} {gap} occlude={false} class="layer" {...tip}>
						<div class="tip" {style} testId={testid && `${testid}-tip`}>
							{#if typeof content === 'string'}{content}{:else}{@render content()}{/if}
						</div>
					</anchored>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.host { display: flex; align-items: start; }
	.anchor { position: relative; display: flex; }
	.pin { position: absolute; inset: 0; display: flex; pointer-events: none; }
	.dot { width: 0; height: 0; }
	.layer { background-color: #00000001; }
	.tip {
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 12px;
		line-height: 16px;
		white-space: nowrap;
		user-select: none;
		background-color: var(--tooltip-surface, #1c1c1c);
		color: var(--tooltip-ink, #ededed);
	}
</style>
