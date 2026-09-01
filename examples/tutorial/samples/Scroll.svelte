<script>
	const rows = Array.from({ length: 40 }, (_, i) => `row ${i + 1}`);
</script>

<div
	style="display: flex; flex-direction: column; flex-grow: 1; min-height: 0;
	       gap: 6px; overflow-y: scroll; padding-right: 8px"
>
	{#each rows as row}
		<div
			style="padding: 8px 12px; border-radius: 6px; background-color: #313244;
			       color: #cdd6f4; font-size: 13px"
		>
			{row}
		</div>
	{/each}
</div>
