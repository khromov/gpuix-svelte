<script lang="ts">
	import type { GpuixEvent } from 'gpuix-svelte';

	let count = $state(0);
	let text = $state('hello');
	let hovered = $state(false);
	let revealed = $state(false);
</script>

<div style="display: flex; flex-direction: column; gap: 6px; padding: 8px">
	<div testid="inc" style="width: 120px; padding: 6px; background-color: #333" onclick={() => count++}>increment</div>
	<div testid="count">count: {count}</div>
	<input testid="field" style="width: 200px; height: 24px" value={text} onchange={(e: GpuixEvent) => (text = e.value ?? '')} />
	<div>typed: {text}</div>
	<div testid="list" style="display: flex; flex-direction: column">
		<div>alpha item</div>
		<div>beta item</div>
	</div>
	<div>alpha outside</div>
	<div testid="card" style="display: flex; flex-direction: row"><div>title</div><div>body</div></div>
	<div
		testid="hover"
		style="width: 120px; height: 20px; background-color: #444"
		onmouseenter={() => (hovered = true)}
		onmouseleave={() => (hovered = false)}
	>
		{hovered ? 'hovered' : 'idle'}
	</div>
	<div style="width: 120px; background-color: #333" onclick={() => setTimeout(() => (revealed = true), 40)}>reveal</div>
	{#if revealed}
		<div>revealed</div>
	{/if}
</div>
