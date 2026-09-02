<script lang="ts">
	import { spinner_frame, use_ticker } from '../lib/ui.svelte.ts';

	let { size = 13 }: { size?: number } = $props();

	$effect(() => use_ticker());
</script>

<div class="spinner" style="font-size: {size}px; line-height: {size + 2}px">{spinner_frame()}</div>

<style>
	.spinner { font-family: Lilex; user-select: none; }
</style>
