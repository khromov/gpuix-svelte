<script>
	let count = $state(0);
	const doubled = $derived(count * 2);
</script>

<div style="display: flex; flex-direction: column; align-items: center; gap: 12px">
	<div style="font-size: 40px; font-weight: bold; color: #cdd6f4">{count}</div>

	<div style="display: flex; flex-direction: row; gap: 10px">
		<div
			style="padding: 8px 20px; border-radius: 8px; background-color: #f38ba8;
			       color: #1e1e2e; font-weight: bold; cursor: pointer"
			hover="background-color: #eba0ac"
			onclick={() => count > 0 && count--}
		>
			−
		</div>
		<div
			style="padding: 8px 20px; border-radius: 8px; background-color: #a6e3a1;
			       color: #1e1e2e; font-weight: bold; cursor: pointer"
			hover="background-color: #94e2d5"
			testId="plus"
			onclick={() => count++}
		>
			+
		</div>
	</div>

	{#if count > 0}
		<div style="font-size: 13px; color: #f9e2af">doubled: {doubled}</div>
	{/if}
</div>
