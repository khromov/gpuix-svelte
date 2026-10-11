<script lang="ts">
	import type { GpuixEvent, ShadowNode } from 'gpuix-svelte';

	let { on_row, on_group, on_img }: { on_row: (n: ShadowNode) => void; on_group: (n: ShadowNode) => void; on_img: (n: ShadowNode) => void } =
		$props();

	let dropped = $state('none');
	let open = $state(false);
	let moved = $state(0);
	const rows = Array.from({ length: 30 }, (_, i) => i);
</script>

<div style="display: flex; flex-direction: column; gap: 6px; padding: 8px">
	<text role="heading" aria-level="2">Settings</text>
	<div role="button" aria-label="Delete note" aria-expanded={open} testid="delete" style="width: 80px; height: 20px; background-color: #333" onclick={() => (open = !open)}>
		<text>Delete</text>
	</div>
	<div testid="drop" style="width: 200px; height: 30px; background-color: #222" onfiledrop={(e: GpuixEvent) => (dropped = (e.paths ?? []).join(','))}>
		<text>{`dropped: ${dropped}`}</text>
	</div>
	<text testid="selectable" style="width: 200px">Select these words</text>
	<div
		testid="mover"
		style="position: relative; width: 20px; height: 10px; background-color: #444"
		motion={{ initial: { left: 0 }, animate: { left: 40 }, transition: { duration: 0.1 } }}
		onmotioncomplete={() => moved++}
	></div>
	<text>{`moved: ${moved}`}</text>
	<div {@attach on_group} testid="group" style="display: flex; flex-direction: row; gap: 4px">
		<div tabindex="0" testid="f1" style="width: 10px; height: 10px"></div>
		<div tabindex="0" testid="f2" style="width: 10px; height: 10px"></div>
		<div tabindex="0" testid="f3" style="width: 10px; height: 10px"></div>
	</div>
	<img {@attach on_img} testid="img" style="width: 8px; height: 8px" />
	<div testid="list" style="height: 60px; overflow: scroll; display: flex; flex-direction: column">
		{#each rows as i (i)}
			{#if i === 25}
				<text {@attach on_row} style="height: 20px">{`row ${i}`}</text>
			{:else}
				<text style="height: 20px">{`row ${i}`}</text>
			{/if}
		{/each}
	</div>
</div>
