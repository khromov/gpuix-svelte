<script lang="ts">
	import type { Snippet } from 'svelte';
	import { get_native, on_window_key, type GpuixEvent, type ShadowNode } from 'gpuix-svelte';

	type Side = 'top' | 'right' | 'bottom' | 'left';
	type Align = 'start' | 'center' | 'end';

	let {
		open,
		onclose,
		children,
		content,
		side = 'bottom',
		align = 'start',
		gap = 4,
		position = null,
		testid = null
	}: {
		open: boolean;
		/** A press outside the panel and the trigger, or Escape. */
		onclose: () => void;
		/** The trigger; it toggles `open` itself. */
		children: Snippet;
		content: Snippet;
		side?: Side;
		align?: Align;
		gap?: number;
		/** Window coordinates to hang from instead of the trigger, e.g. a right click's `e.x`/`e.y`. */
		position?: { x: number; y: number } | null;
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

	let anchor: ShadowNode | null = null;

	// The trigger's own click closes it, and closing here first would let that click reopen it.
	function outside(e: GpuixEvent) {
		const box = anchor?.nativeId == null ? null : get_native()?.getElementBounds(anchor.nativeId);
		const px = e.x ?? -1;
		const py = e.y ?? -1;
		if (box && px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height) return;
		onclose();
	}

	$effect(() => {
		if (!open) return;
		return on_window_key('keydown', (e) => {
			if (e.key === 'escape') onclose();
		});
	});
</script>

<div class="host">
	<div class="anchor" {@attach (node: ShadowNode) => (anchor = node)} testId={testid}>
		{@render children()}
		{#if open}
			<div class="pin" style:justify-content={x} style:align-items={y}>
				<div class="dot">
					<anchored {side} align="start" anchor={CORNERS[side][align]} {gap} {position} class="layer">
						<div class="panel" onmousedownoutside={outside} testId={testid && `${testid}-panel`}>
							{@render content()}
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
	.panel {
		display: flex;
		flex-direction: column;
		padding: 4px;
		border-radius: 8px;
		border-width: 1px;
		border-color: var(--popover-border, #45475a);
		background-color: var(--popover-surface, #1e1e2e);
		color: var(--popover-ink, #cdd6f4);
	}
</style>
