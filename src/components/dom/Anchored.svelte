<script lang="ts">
	import { untrack, type Snippet } from 'svelte';

	type Side = 'top' | 'right' | 'bottom' | 'left';
	type Align = 'start' | 'center' | 'end';

	// The DOM stand-in for GPUI's <anchored>: a fixed layer hung off <body>, placed beside `anchor` (or at `position`) from measured boxes.
	let {
		anchor,
		side = 'bottom',
		align = 'start',
		gap = 0,
		position = null,
		occlude = true,
		children,
		...rest
	}: {
		anchor: HTMLElement | null;
		side?: Side;
		align?: Align;
		gap?: number;
		/** Viewport coordinates to hang from instead of `anchor`. */
		position?: { x: number; y: number } | null;
		/** False lets the pointer through to whatever lies beneath, as GPUI's `occlude={false}` does. */
		occlude?: boolean;
		children: Snippet;
		onmouseenter?: (e: MouseEvent) => void;
		onmouseleave?: (e: MouseEvent) => void;
	} = $props();

	const MARGIN = 8;

	function place(layer: HTMLElement) {
		const box = position ? { left: position.x, top: position.y, right: position.x, bottom: position.y, width: 0, height: 0 } : anchor?.getBoundingClientRect();
		if (!box) return;
		const { width, height } = layer.getBoundingClientRect();
		const along = (start: number, size: number, own: number) => (align === 'start' ? start : align === 'end' ? start + size - own : start + (size - own) / 2);
		let x: number;
		let y: number;
		if (side === 'top' || side === 'bottom') {
			x = along(box.left, box.width, width);
			y = side === 'top' ? box.top - gap - height : box.bottom + gap;
		} else {
			y = along(box.top, box.height, height);
			x = side === 'left' ? box.left - gap - width : box.right + gap;
		}
		// `fit: snap`, by the margin GPUI keeps from the window edge.
		x = Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN));
		y = Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN));
		const left = `${Math.round(x)}px`;
		const top = `${Math.round(y)}px`;
		if (layer.style.left !== left) layer.style.left = left;
		if (layer.style.top !== top) layer.style.top = top;
	}

	// Off <body>, out of every ancestor's overflow and stacking context like a deferred GPUI layer, while the slot stays
	// behind as the node Svelte holds on to, so a keyed {#each} reordering the parent moves the slot and not the layer.
	// Placed every frame, as GPUI places its layers, so it follows a trigger that moves through layout alone; the props
	// are read untracked, or a change would re-hang the layer and blur it.
	function hang(layer: HTMLElement) {
		document.body.appendChild(layer);
		untrack(() => place(layer));
		let frame = requestAnimationFrame(function again() {
			place(layer);
			frame = requestAnimationFrame(again);
		});
		return () => {
			cancelAnimationFrame(frame);
			layer.remove();
		};
	}
</script>

<div class="slot"><div class="layer" style:pointer-events={occlude ? null : 'none'} {...rest} {@attach hang}>{@render children()}</div></div>

<style>
	.slot { display: contents; }
	.layer { position: fixed; left: 0; top: 0; z-index: 1001; }
</style>
