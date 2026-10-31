<script lang="ts">
	import { window_size, type ShadowNode } from 'gpuix-svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';

	let {
		virtual = false,
		images = true,
		onimages = () => {}
	}: { virtual?: boolean; images?: boolean; onimages?: (a: ShadowNode, b: ShadowNode) => void } = $props();

	let a: ShadowNode | null = null;
	let b: ShadowNode | null = null;
	const bind_a = (node: ShadowNode) => {
		a = node;
		if (b) onimages(a, b);
	};
	const bind_b = (node: ShadowNode) => {
		b = node;
		if (a) onimages(a, b);
	};
	const rows = Array.from({ length: 40 }, (_, i) => i);
</script>

<div style="display: flex; flex-direction: column; width: 300px; height: 300px">
	<div testId="size">{window_size.width}x{window_size.height}</div>
	{#if images}
		<img {@attach bind_a} src="" alt="" style="width: 10px; height: 10px" />
		<img {@attach bind_b} src="" alt="" style="width: 10px; height: 10px" />
	{/if}
	<Scroller testid="list" {virtual} estimate={30}>
		{#each rows as i (i)}
			<div style="height: 30px; min-height: 30px; width: 100%">row {i}</div>
		{/each}
	</Scroller>
</div>
