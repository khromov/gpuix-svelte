<script lang="ts">
	import type { Snippet } from 'svelte';

	type Side = 'top' | 'right' | 'bottom' | 'left';
	type Align = 'start' | 'center' | 'end';

	// The DOM stand-in for GPUI's <anchored>: a fixed layer hung off <body>, placed beside `anchor` (or at `position`) from measured boxes.
	let {
		anchor,
		side = 'bottom',
		align = 'start',
		gap = 0,
		position = null,
		children,
		...rest
	}: {
		anchor: HTMLElement | null;
		side?: Side;
		align?: Align;
		gap?: number;
		/** Viewport coordinates to hang from instead of `anchor`. */
		position?: { x: number; y: number } | null;
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
		layer.style.left = `${Math.round(x)}px`;
		layer.style.top = `${Math.round(y)}px`;
	}

	// Off <body>, out of every ancestor's overflow and stacking context like a deferred GPUI layer, while the slot stays
	// put so Svelte's teardown walk never leaves the component; the props read here re-hang the layer when they change.
	function hang(layer: HTMLElement) {
		document.body.appendChild(layer);
		place(layer);
		const again = () => place(layer);
		window.addEventListener('resize', again);
		window.addEventListener('scroll', again, true);
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(again);
		observer?.observe(layer);
		return () => {
			observer?.disconnect();
			window.removeEventListener('resize', again);
			window.removeEventListener('scroll', again, true);
			layer.remove();
		};
	}
</script>

<div class="slot"><div class="layer" {...rest} {@attach hang}>{@render children()}</div></div>

<style>
	.slot { display: contents; }
	.layer { position: fixed; left: 0; top: 0; z-index: 1001; }
</style>
