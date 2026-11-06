<script lang="ts">
	import { test_id } from 'gpuix-svelte-ui/shared';

	// Neither CSS animations nor transforms reach GPUI, so the ring is eight dots whose opacity a timer
	// rotates; the same timer drives the browser, so the two tick alike.
	let { size = 20, label = 'Loading', testid = null }: { size?: number; label?: string; testid?: string | null } = $props();

	const COUNT = 8;
	let tick = $state(0);

	$effect(() => {
		const timer = setInterval(() => (tick = (tick + 1) % COUNT), 100);
		return () => clearInterval(timer);
	});

	const dot = $derived(Math.max(2, Math.round(size * 0.22)));
	const radius = $derived(size / 2 - dot / 2);
	const dots = $derived(
		Array.from({ length: COUNT }, (_, i) => {
			const angle = (i / COUNT) * Math.PI * 2 - Math.PI / 2;
			return { left: Math.round((size / 2 + Math.cos(angle) * radius - dot / 2) * 10) / 10, top: Math.round((size / 2 + Math.sin(angle) * radius - dot / 2) * 10) / 10 };
		})
	);
</script>

<div class="spinner" role="status" aria-label={label} style="width: {size}px; height: {size}px" {...test_id(testid)}>
	{#each dots as at, i (i)}
		<div class="dot" style="left: {at.left}px; top: {at.top}px; width: {dot}px; height: {dot}px; border-radius: {dot / 2}px; opacity: {(((i - tick + COUNT) % COUNT) / COUNT) * 0.85 + 0.15}"></div>
	{/each}
</div>

<style>
	.spinner {
		position: relative;
		flex-shrink: 0;
	}
	.dot {
		position: absolute;
		background-color: var(--ui-ink);
	}
</style>
