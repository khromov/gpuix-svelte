<script lang="ts">
	import type { Component } from 'svelte';
	import { apply_theme } from 'gpuix-svelte-ui';

	let { Demo }: { Demo: Component } = $props();

	$effect(() => apply_theme('dark'));
</script>

<div class="frame">
	<Demo />
</div>

<style>
	.frame {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		padding: 24px;
		font-size: 14px;
		background-color: var(--ui-bg);
		color: var(--ui-ink);
	}
</style>
