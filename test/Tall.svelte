<script lang="ts">
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';

	let { rows = 30, follow = false, scroll = true }: { rows?: number; follow?: boolean; scroll?: boolean } = $props();
	const items = $derived(Array.from({ length: rows }, (_, i) => i));
</script>

<div style="display: flex; flex-direction: row; width: 300px; height: 200px">
	<Scroller testid="list" gap={0} {follow} {scroll}>
		{#each items as i (i)}
			<div style="height: 40px; min-height: 40px">row {i}</div>
		{/each}
	</Scroller>
</div>
