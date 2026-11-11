<script lang="ts">
	import { find_ranges, type TextSearch } from 'gpuix-svelte';

	let { search, text, above = null }: { search: TextSearch; text: string; above?: string | null } = $props();

	// `above` stands in for the rows a virtual list has not mounted, counted the way an app would.
	$effect(() => {
		if (above === null) return;
		const before = find_ranges(above, search.query, search).length;
		search.matches = { total: before + find_ranges(text, search.query, search).length, index_offset: before };
	});
</script>

<div style="display: flex; flex-direction: column; gap: 8px; color: #cdd6f4">
	<text highlight={search.spec} onhighlight={search.on_highlight}>{text}</text>
	<div style="display: flex; gap: 8px">
		<div onclick={search.prev} style="padding: 8px; background-color: #313244">prev</div>
		<div onclick={search.next} style="padding: 8px; background-color: #313244">next</div>
	</div>
	<text>{search.total ? search.active + 1 : 0}/{search.total}</text>
</div>
