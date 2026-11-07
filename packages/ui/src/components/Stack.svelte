<script lang="ts">
	import type { Snippet } from 'svelte';
	import { test_id } from 'gpuix-svelte-ui/shared';

	// A flex box with its spacing as props, in the units both renderers read. GPUI knows `start`
	// and `end` but not `flex-start` / `flex-end`, hence the names here.
	let {
		children,
		direction = 'column',
		gap = 8,
		align = null,
		justify = null,
		wrap = false,
		pad = 0,
		grow = null,
		testid = null
	}: {
		children: Snippet;
		direction?: 'row' | 'column';
		gap?: number;
		align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline' | null;
		justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly' | null;
		wrap?: boolean;
		/** Padding in px, or CSS padding text. */
		pad?: number | string;
		grow?: number | null;
		testid?: string | null;
	} = $props();

	const style = $derived(
		[
			`flex-direction: ${direction}`,
			`gap: ${gap}px`,
			`padding: ${typeof pad === 'number' ? `${pad}px` : pad}`,
			align && `align-items: ${align}`,
			justify && `justify-content: ${justify}`,
			wrap && 'flex-wrap: wrap',
			grow != null && `flex-grow: ${grow}`
		]
			.filter(Boolean)
			.join('; ')
	);
</script>

<div class="stack" {style} {...test_id(testid)}>{@render children()}</div>

<style>
	.stack {
		display: flex;
		min-width: 0;
		min-height: 0;
	}
</style>
