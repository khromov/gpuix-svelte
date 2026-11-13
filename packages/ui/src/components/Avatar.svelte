<script lang="ts">
	import { IS_GPUIX } from 'gpuix-svelte';
	import { test_id } from 'gpuix-svelte-ui/shared';

	let {
		src = null,
		name = '',
		size = 32,
		testid = null
	}: {
		/** A path, `data:` URL or http(s) URL on GPUI; any image URL in the browser. */
		src?: string | null;
		/** Read for the initials shown without an image, and as the alt text. */
		name?: string;
		size?: number;
		testid?: string | null;
	} = $props();

	const initials = $derived(
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((word) => [...word][0].toUpperCase())
			.join('')
	);

	// GPUI scales an image through its own prop, spelled as native reads it; the browser through object-fit in the rule below.
	const fit = IS_GPUIX ? { objectFit: 'cover' as const } : {};
	const box = $derived(`width: ${size}px; height: ${size}px; border-radius: ${size / 2}px`);
</script>

<div class="avatar" style="{box}; font-size: {Math.round(size * 0.38)}px" aria-label={name} {...test_id(testid)}>
	{#if src}
		<img class="image" {src} alt={name} style={box} {...fit} />
	{:else}
		<div class="initials">{initials}</div>
	{/if}
</div>

<style>
	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		overflow: hidden;
		font-weight: 600;
		user-select: none;
		background-color: var(--ui-accent-wash);
		color: var(--ui-accent-ink);
	}
	.image {
		display: flex;
		object-fit: cover;
	}
</style>
