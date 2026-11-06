<script lang="ts">
	let count = $state(0);
	const doubled = $derived(count * 2);
</script>

<div style="display: flex; flex-direction: column; align-items: center; gap: 12px">
	<div style="font-size: 40px; font-weight: 600; color: #ededed">{count}</div>

	<div style="display: flex; flex-direction: row; gap: 10px">
		<div
			style="padding: 8px 20px; border-radius: 8px; border-width: 1px; border-color: #242424;
			       color: #ededed; font-weight: 600; cursor: pointer"
			hover="background-color: #1c1c1c; border-color: #404040"
			onclick={() => count > 0 && count--}
		>
			−
		</div>
		<div
			style="padding: 8px 20px; border-radius: 8px; border-width: 1px; border-color: #ededed;
			       background-color: #ededed; color: #000000; font-weight: 600; cursor: pointer"
			hover="background-color: #ffffff; border-color: #ffffff"
			testId="plus"
			onclick={() => count++}
		>
			+
		</div>
	</div>

	{#if count > 0}
		<div style="font-size: 13px; color: #ff8a5c">doubled: {doubled}</div>
	{/if}
</div>
