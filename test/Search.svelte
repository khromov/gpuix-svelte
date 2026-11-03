<script lang="ts">
	import type { TextSearch } from 'gpuix-svelte';

	let { search, text }: { search: TextSearch; text: string } = $props();
</script>

<div style="display: flex; flex-direction: column; gap: 8px; color: #cdd6f4">
	<text highlight={search.spec} onhighlight={search.on_highlight}>{text}</text>
	<div style="display: flex; gap: 8px">
		<div onclick={search.prev} style="padding: 8px; background-color: #313244">prev</div>
		<div onclick={search.next} style="padding: 8px; background-color: #313244">next</div>
	</div>
	<text>{search.total ? search.active + 1 : 0}/{search.total}</text>
</div>
