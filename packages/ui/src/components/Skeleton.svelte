<script lang="ts">
	import { test_id } from 'gpuix-svelte-ui/shared';

	// A placeholder block that pulses on a timer, since GPUI has no CSS animations; the transition softens it in a browser.
	let {
		width = '100%',
		height = 16,
		radius = 6,
		testid = null
	}: {
		/** px, or CSS width text such as `60%`. */
		width?: number | string;
		height?: number;
		radius?: number;
		testid?: string | null;
	} = $props();

	let dim = $state(false);

	$effect(() => {
		const timer = setInterval(() => (dim = !dim), 700);
		return () => clearInterval(timer);
	});
</script>

<div class="skeleton" class:dim role="presentation" style="width: {typeof width === 'number' ? `${width}px` : width}; height: {height}px; border-radius: {radius}px" {...test_id(testid)}></div>

<style>
	.skeleton {
		flex-shrink: 0;
		background-color: var(--ui-raised);
		transition: opacity 0.6s;
	}
	.skeleton.dim {
		opacity: 0.55;
	}
</style>
