<script lang="ts">
	import { open_url } from '../lib/shell.ts';
	import { md_theme } from '../lib/theme.svelte.ts';

	let { source = '' }: { source?: string } = $props();
</script>

<markdown {source} theme={md_theme()} onlinkclick={(e) => open_url(e.value)}></markdown>
