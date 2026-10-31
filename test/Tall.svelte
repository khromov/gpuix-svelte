<script lang="ts">
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';

	let { rows = 30, follow = false, scroll = true, virtual = false }: { rows?: number; follow?: boolean; scroll?: boolean; virtual?: boolean } = $props();
	let extra = $state(0);
	let box = $state(200);
	const items = $derived(Array.from({ length: rows + extra }, (_, i) => i));

	export function grow(by: number) {
		extra += by;
	}

	export function resize(height: number) {
		box = height;
	}
</script>

<div style="display: flex; flex-direction: row; width: 300px; height: {box}px">
	<Scroller testid="list" gap={0} {follow} {scroll} {virtual} estimate={40}>
		{#each items as i (i)}
			<div style="height: {virtual ? (i % 2 ? 90 : 30) : 40}px; min-height: {virtual ? (i % 2 ? 90 : 30) : 40}px; width: 100%">row {i}</div>
		{/each}
	</Scroller>
</div>
